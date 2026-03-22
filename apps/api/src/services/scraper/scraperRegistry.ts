import { Prisma, EventStatus, Sport as PrismaSport } from '@prisma/client';
import { prisma } from '../../prisma';
import { logger } from '../../utils/logger';
import type { IScraper, ScrapedEvent } from './types';
import { emitOddsUpdated } from '../../sockets/oddsSocket';
import { emitEventStatusChange } from '../../sockets/index';
import type { EventStatus as SharedEventStatus, OddsUpdatedPayload } from '@betintel/shared';
import { invalidateOddsCache } from '../odds/oddsService';
import { BetanoScraper } from './sites/betanoScraper';
import { Bet365Scraper } from './sites/bet365Scraper';
import { BetclicScraper } from './sites/betclicScraper';
import { EscOnlineScraper } from './sites/escOnlineScraper';
import { MooshScraper } from './sites/mooshScraper';
import { PlacardScraper } from './sites/placardScraper';
import { SolverdeScraper } from './sites/solverdeScraper';

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Collected socket emissions from a single persistEvent call.
 * Deferred until after the Redis cache is invalidated so all mobile refetches
 * triggered by these events see fresh data (no cache hit on stale values).
 */
interface PersistResult {
  oddsChanges: OddsUpdatedPayload[];
  statusChange: { eventId: string; status: SharedEventStatus } | null;
}

const registry = new Map<string, IScraper>();

/** Registers a scraper instance so the job queue can find it by slug. */
export function registerScraper(scraper: IScraper): void {
  registry.set(scraper.siteSlug, scraper);
  logger.info(`Scraper registered`, { slug: scraper.siteSlug, name: scraper.siteName });
}

/** Returns all registered scrapers. */
export function getAllScrapers(): IScraper[] {
  return Array.from(registry.values());
}

/** Returns a single scraper by site slug, or undefined if not registered. */
export function getScraper(slug: string): IScraper | undefined {
  return registry.get(slug);
}

/** Registers the built-in scraper set used by scheduled scrape jobs. */
export function registerDefaultScrapers(): void {
  registerScraper(new BetclicScraper());
  registerScraper(new PlacardScraper());
  registerScraper(new BetanoScraper());
  registerScraper(new Bet365Scraper());
  registerScraper(new EscOnlineScraper());
  registerScraper(new MooshScraper());
  registerScraper(new SolverdeScraper());
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Runs a single scraper by site slug, persists results to the DB.
 * Returns the number of events successfully persisted.
 * Throws if the slug is not registered.
 */
export async function runScraper(siteSlug: string): Promise<number> {
  const scraper = registry.get(siteSlug);
  if (!scraper) throw new Error(`No scraper registered for slug: ${siteSlug}`);
  return runScraperInstance(scraper);
}

/**
 * Runs all registered scrapers in sequence.
 * Individual failures are caught and logged — does not abort remaining scrapers.
 *
 * After all scrapers finish, runs a global LIVE cleanup: any LIVE event whose
 * active odds have NOT been updated during this cycle (i.e. no scraper reported
 * it) is no longer backed by live data from any source → mark FINISHED.
 * This is purely scraper-driven — it uses Odd.updatedAt as proof that a scraper
 * touched the event. It handles scraper failures (e.g. 403 → 0 events) where
 * the per-site "not seen" check is skipped.
 */
export async function runAllScrapers(): Promise<void> {
  for (const scraper of getAllScrapers()) {
    await runScraperInstance(scraper).catch((err: unknown) => {
      logger.error(`Scraper run failed`, {
        slug: scraper.siteSlug,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ── Global LIVE cleanup ──────────────────────────────────────────────────────
  // All scrapers have now run. Any LIVE event with NO active odd updated in the
  // last 10 minutes was not confirmed live by any scraper this cycle.
  // 10 min is generous enough to cover sequential scraping of all 7 sites.
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stale = await prisma.sportEvent.findMany({
      where: {
        status: EventStatus.LIVE as unknown as Prisma.EnumEventStatusFilter['equals'],
        odds: { none: { isActive: true, updatedAt: { gte: tenMinutesAgo } } },
      },
      select: { id: true, homeTeam: true, awayTeam: true },
    });

    if (stale.length > 0) {
      await prisma.sportEvent.updateMany({
        where: { id: { in: stale.map((e) => e.id) } },
        data: { status: EventStatus.FINISHED as never },
      });
      // Invalidate FIRST — then broadcast so that mobile refetches see fresh data
      await invalidateOddsCache();
      for (const event of stale) {
        emitEventStatusChange({ eventId: event.id, status: 'FINISHED' as unknown as SharedEventStatus, homeScore: null, awayScore: null });
      }
      logger.info(`Global LIVE cleanup: ${stale.length} events → FINISHED`, {
        events: stale.map((e) => `${e.homeTeam} vs ${e.awayTeam}`),
      });
    }
  } catch (err) {
    logger.warn('Global LIVE cleanup failed', { error: (err as Error).message });
  }
}

// ─── Core run + persistence ───────────────────────────────────────────────────

async function runScraperInstance(scraper: IScraper): Promise<number> {
  logger.info(`Scraper started`, { slug: scraper.siteSlug });
  const startMs = Date.now();

  let events: ScrapedEvent[];
  try {
    events = await scraper.scrapeEvents();
  } catch (err) {
    // scrapeEvents() is supposed to catch internally, but guard here too
    logger.error(`scrapeEvents() threw unexpectedly`, {
      slug: scraper.siteSlug,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  if (events.length === 0) {
    logger.warn(`Scraper returned no events`, { slug: scraper.siteSlug });
    return 0;
  }

  // Ensure BettingSite row exists in DB
  const site = await prisma.bettingSite.upsert({
    where: { slug: scraper.siteSlug },
    create: {
      slug: scraper.siteSlug,
      name: scraper.siteName,
      baseUrl: resolveSiteBaseUrl(scraper.siteSlug),
      isActive: true,
    },
    update: { lastScraped: new Date() },
  });

  // If the upsert hit the existing path, update lastScraped separately
  if (site.lastScraped === null || site.lastScraped < new Date(Date.now() - 1000)) {
    await prisma.bettingSite.update({
      where: { id: site.id },
      data: { lastScraped: new Date() },
    });
  }

  let persisted = 0;
  const pendingOddsChanges: OddsUpdatedPayload[] = [];
  const pendingStatusChanges: Array<{ eventId: string; status: SharedEventStatus }> = [];

  for (const ev of events) {
    try {
      const result = await persistEvent(site.id, ev);
      persisted++;
      pendingOddsChanges.push(...result.oddsChanges);
      if (result.statusChange) pendingStatusChanges.push(result.statusChange);
    } catch (err) {
      logger.warn(`Failed to persist event`, {
        slug: scraper.siteSlug,
        event: `${ev.homeTeam} vs ${ev.awayTeam}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`Scraper finished`, {
    slug: scraper.siteSlug,
    persisted,
    total: events.length,
    durationMs: Date.now() - startMs,
  });

  // After a successful scrape, any LIVE event from this site that wasn't
  // returned by the scraper at all is no longer listed on the betting site —
  // the match ended or was removed. Mark it FINISHED immediately so the feed
  // reflects the betting site's truth with no time-based guessing.
  let cacheInvalidated = persisted > 0;
  if (events.length > 0) {
    // All team-name keys the scraper returned (live or upcoming)
    const seenKeys = new Set(
      events.map((ev) =>
        `${normaliseTeamName(ev.homeTeam).toLowerCase()}|${normaliseTeamName(ev.awayTeam).toLowerCase()}`,
      ),
    );

    // LIVE events in the DB that belong to this site but weren't in the batch
    const dbLiveEvents = await prisma.sportEvent.findMany({
      where: {
        status: EventStatus.LIVE as unknown as Prisma.EnumEventStatusFilter['equals'],
        odds: { some: { siteId: site.id, isActive: true } },
      },
      select: { id: true, homeTeam: true, awayTeam: true },
    });

    const notSeenIds = dbLiveEvents
      .filter(
        (dbEv) => !seenKeys.has(`${dbEv.homeTeam.toLowerCase()}|${dbEv.awayTeam.toLowerCase()}`),
      )
      .map((dbEv) => dbEv.id);

    if (notSeenIds.length > 0) {
      // Betting site no longer lists these events → they are over
      const result = await prisma.sportEvent.updateMany({
        where: { id: { in: notSeenIds } },
        data: { status: EventStatus.FINISHED as never },
      });
      // Collect status changes — will be emitted after cache is cleared below
      for (const eventId of notSeenIds) {
        pendingStatusChanges.push({ eventId, status: 'FINISHED' as unknown as SharedEventStatus });
      }
      logger.info(`Marked ${result.count} unseen LIVE events as FINISHED`, {
        slug: scraper.siteSlug,
      });
      cacheInvalidated = true;
    }
  }

  // ── Fire all deferred socket events AFTER cache is cleared ─────────────────
  // Clearing cache first ensures that any mobile refetch triggered by these
  // socket events hits fresh DB data, not a stale Redis cache entry.
  if (cacheInvalidated) {
    await invalidateOddsCache();
  }

  for (const change of pendingStatusChanges) {
    emitEventStatusChange({ eventId: change.eventId, status: change.status, homeScore: null, awayScore: null });
  }
  for (const payload of pendingOddsChanges) {
    emitOddsUpdated(payload);
  }

  return persisted;
}

/**
 * Upserts a scraped event and all its odds into the database.
 *
 * Events are matched across sites by: sport + normalised team names +
 * event date ±30 min window. This allows odds from multiple sites to point
 * at the same `SportEvent` row, enabling cross-site comparison.
 */
async function persistEvent(siteId: string, ev: ScrapedEvent): Promise<PersistResult> {
  const result: PersistResult = { oddsChanges: [], statusChange: null };
  const home = normaliseTeamName(ev.homeTeam);
  const away = normaliseTeamName(ev.awayTeam);
  const league = sanitiseLeagueName(ev.league, home, away);

  // Widen by 30 min each side to absorb clock-skew between sites
  const windowStart = new Date(ev.eventDate.getTime() - 30 * 60 * 1000);
  const windowEnd   = new Date(ev.eventDate.getTime() + 30 * 60 * 1000);

  // Try to find an existing SportEvent row (possibly created by another scraper)
  const existing = await prisma.sportEvent.findFirst({
    where: {
      sport: ev.sport as unknown as PrismaSport,
      homeTeam: { equals: home, mode: 'insensitive' },
      awayTeam: { equals: away, mode: 'insensitive' },
      eventDate: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, externalId: true, status: true },
  });

  let eventId: string;

  // Determine status from scraper observations, with time-window guards:
  // • Match started 0–150 min ago AND (scraper signals live OR time implies live)
  //   → LIVE
  // • Match started >150 min ago AND existing status is LIVE
  //   → FINISHED immediately (don't wait for the periodic cleanup; the scraper's
  //     isLive flag can fire on "90+3'" elapsed-time text rendered for matches that
  //     already ended, so we gate everything on the 150-min window)
  // • Anything else → undefined (preserve existing status unchanged)
  // IMPORTANT: never downgrade FINISHED → UPCOMING; the periodic cleanup owns
  // the authoritative LIVE → FINISHED transition and must not be undone here.
  const now = Date.now();
  const minutesSinceStart = (now - ev.eventDate.getTime()) / 60_000;
  const withinLiveWindow = minutesSinceStart >= 0 && minutesSinceStart <= 150;
  const isLiveSignal = (ev.isLive || withinLiveWindow) && withinLiveWindow;

  const scrapedStatus: EventStatus | undefined =
    isLiveSignal
      ? EventStatus.LIVE
      : minutesSinceStart > 150 && existing?.status === EventStatus.LIVE
        ? EventStatus.FINISHED
        : undefined;

  if (existing) {
    eventId = existing.id;
    await prisma.sportEvent.update({
      where: { id: eventId },
      data: {
        externalId: existing.externalId ?? ev.externalId,
        league,
        homeTeam: home,
        awayTeam: away,
        eventDate: ev.eventDate,
        ...(scrapedStatus ? { status: scrapedStatus } : {}),
      },
    });
    // Collect status change — emitted after cache is cleared in runScraperInstance
    if (scrapedStatus && scrapedStatus !== existing.status) {
      result.statusChange = { eventId, status: scrapedStatus as unknown as SharedEventStatus };
    }
  } else {
    const created = await prisma.sportEvent.create({
      data: {
        externalId: ev.externalId,
        sport: ev.sport as unknown as PrismaSport,
        league,
        homeTeam: home,
        awayTeam: away,
        eventDate: ev.eventDate,
        status: scrapedStatus ?? EventStatus.UPCOMING,
      },
      select: { id: true },
    });
    eventId = created.id;
  }

  // Mark all existing odds for this site+event as inactive before re-inserting.
  // This cleanly handles removed markets / selections without leaving stale rows.
  await prisma.odd.updateMany({
    where: { siteId, eventId },
    data: { isActive: false },
  });

  // Upsert each selection: update if row already exists (by findFirst), else create
  for (const mkt of ev.markets) {
    for (const sel of mkt.selections) {
      if (!isValidOdds(sel.value)) continue;

      const oddRow = await prisma.odd.findFirst({
        where: { siteId, eventId, market: mkt.market, selection: sel.selection },
        select: { id: true },
      });

      if (oddRow) {
        const existingOdd = await prisma.odd.findUnique({
          where: { id: oddRow.id },
          select: { value: true },
        });

        await prisma.odd.update({
          where: { id: oddRow.id },
          data: {
            value: new Prisma.Decimal(sel.value),
            isActive: true,
            scrapedAt: new Date(),
          },
        });

        const oldValue = existingOdd?.value.toFixed(2);
        const newValue = sel.value.toFixed(2);
        if (oldValue && oldValue !== newValue) {
          // Collect — emitted after Redis cache is cleared so mobile sees fresh data
          result.oddsChanges.push({
            eventId,
            siteId,
            market: mkt.market,
            selection: sel.selection,
            oldValue,
            newValue,
          });
        }
      } else {
        await prisma.odd.create({
          data: {
            siteId,
            eventId,
            market: mkt.market,
            selection: sel.selection,
            value: new Prisma.Decimal(sel.value),
            isActive: true,
          },
        });
      }
    }
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collapses whitespace and trims a team name for consistent DB storage. */
function normaliseTeamName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function sanitiseLeagueName(league: string, homeTeam: string, awayTeam: string): string {
  let normalised = league.replace(/\s+/g, ' ').trim();

  if (normalised.length === 0) {
    return 'Futebol';
  }

  const lower = normalised.toLowerCase();
  const suspicious =
    normalised.length > 120
    || /\bempate\b/i.test(normalised)
    || /\d+[.,]\d+/.test(normalised)
    || lower.includes(homeTeam.toLowerCase())
    || lower.includes(awayTeam.toLowerCase());

  if (suspicious) return 'Futebol';

  // Strip trailing round/group details:
  //   "Áustria - Bundesliga - Grupo Relegation Round, Jornada 24" → "Áustria - Bundesliga"
  //   "Liga Portugal - Jornada 30"  → "Liga Portugal"
  //   "England - Premier League - Round 28"  → "England - Premier League"
  // Pattern: keep up to "Country - League" but strip " - Group/Round/Jornada/..." etc.
  normalised = normalised
    .replace(/\s*[-–]\s*(?:Grupo|Group|Round|Ronda|Jornada|Giornata|Matchday|Spieltag|Journée|Fase|Phase|Playoff|Play-off|Relegation|Qualification|Qualificação)\b.*/i, '')
    .replace(/\s*,\s*(?:Jornada|Round|Matchday|Spieltag|Giornata|Journée)\b.*/i, '')
    .replace(/\s+\d+['+]*$/, '') // trailing minute markers like " 90+1'"
    .trim();

  return normalised || 'Futebol';
}

/** Odds must be a finite number ≥ 1.01 — reject anything clearly invalid. */
function isValidOdds(value: number): boolean {
  return Number.isFinite(value) && value >= 1.01 && value <= 1000;
}

function resolveSiteBaseUrl(siteSlug: string): string {
  switch (siteSlug) {
    case 'bet365':
      return 'https://www.bet365.com';
    case 'esconline':
      return 'https://www.esportesonline.com';
    default:
      return `https://www.${siteSlug}.pt`;
  }
}
