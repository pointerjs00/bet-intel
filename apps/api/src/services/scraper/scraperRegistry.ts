import { Prisma, EventStatus, Sport as PrismaSport } from '@prisma/client';
import { prisma } from '../../prisma';
import { logger } from '../../utils/logger';
import type { IScraper, ScrapedEvent } from './types';
import { emitOddsUpdated } from '../../sockets/oddsSocket';
import type { OddsUpdatedPayload } from '@betintel/shared';
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
 *
 * NOTE: status changes are no longer emitted from persistEvent — event status
 * is owned exclusively by the sports-data status service (API-Football) and
 * the periodic cleanup in updateEventStatuses(). Scrapers only write odds.
 */
interface PersistResult {
  oddsChanges: OddsUpdatedPayload[];
}

interface PersistSiteOptions {
  incremental?: boolean;
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
  // registerScraper(new PlacardScraper());   // disabled — selector failures, re-enable when fixed
  // registerScraper(new BetanoScraper());    // disabled — selector failures, re-enable when fixed
  // registerScraper(new Bet365Scraper());    // disabled — bot-detection, re-enable when fixed
  // registerScraper(new EscOnlineScraper()); // disabled — selector failures, re-enable when fixed
  // registerScraper(new MooshScraper());     // disabled — selector failures, re-enable when fixed
  // registerScraper(new SolverdeScraper());  // disabled — selector failures, re-enable when fixed
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

  // ── Global odds deactivation for unseen LIVE events ─────────────────────────
  // All scrapers have now run. Any LIVE event with NO active odd updated in the
  // last 10 minutes was not confirmed live by any scraper this cycle.
  // We deactivate their odds so stale prices don't appear in the feed.
  // Status (FINISHED) will be set by the sports-data status service once it
  // confirms the match is over — we don't guess here.
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
      // Deactivate all odds for these events — they'll disappear from the odds feed
      await prisma.odd.updateMany({
        where: { eventId: { in: stale.map((e) => e.id) }, isActive: true },
        data: { isActive: false },
      });
      await invalidateOddsCache();
      logger.info(`Global odds cleanup: deactivated odds for ${stale.length} LIVE events not seen by any scraper`, {
        events: stale.map((e) => `${e.homeTeam} vs ${e.awayTeam}`),
      });
    }
  } catch (err) {
    logger.warn('Global odds cleanup failed', { error: (err as Error).message });
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

  const persisted = await persistScrapedEventsForSite(scraper.siteSlug, scraper.siteName, events);

  logger.info(`Scraper finished`, {
    slug: scraper.siteSlug,
    persisted,
    total: events.length,
    durationMs: Date.now() - startMs,
  });

  return persisted;
}

async function ensureBettingSite(siteSlug: string, siteName: string) {
  const site = await prisma.bettingSite.upsert({
    where: { slug: siteSlug },
    create: {
      slug: siteSlug,
      name: siteName,
      baseUrl: resolveSiteBaseUrl(siteSlug),
      isActive: true,
    },
    update: { lastScraped: new Date() },
  });

  if (site.lastScraped === null || site.lastScraped < new Date(Date.now() - 1000)) {
    await prisma.bettingSite.update({
      where: { id: site.id },
      data: { lastScraped: new Date() },
    });
  }

  return site;
}

export async function persistScrapedEventsForSite(
  siteSlug: string,
  siteName: string,
  events: ScrapedEvent[],
  options: PersistSiteOptions = {},
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const site = await ensureBettingSite(siteSlug, siteName);

  let persisted = 0;
  const pendingOddsChanges: OddsUpdatedPayload[] = [];

  for (const ev of events) {
    try {
      const result = await persistEvent(site.id, ev);
      persisted++;
      pendingOddsChanges.push(...result.oddsChanges);
    } catch (err) {
      logger.warn(`Failed to persist event`, {
        slug: siteSlug,
        event: `${ev.homeTeam} vs ${ev.awayTeam}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // After a successful scrape, any LIVE event from this site that wasn't
  // returned by the scraper at all is no longer listed on the betting site —
  // the match ended or was removed. Mark it FINISHED immediately so the feed
  // reflects the betting site's truth with no time-based guessing.
  let cacheInvalidated = persisted > 0;
  if (!options.incremental) {
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
      // Betting site no longer lists these events → they may be over.
      // We don't force FINISHED here — the sports-data status service owns the
      // authoritative status. Instead deactivate their odds so stale odds are
      // hidden from the feed. The status cleanup will finalise them shortly.
      await prisma.odd.updateMany({
        where: { siteId: site.id, eventId: { in: notSeenIds }, isActive: true },
        data: { isActive: false },
      });
      logger.info(`Deactivated odds for ${notSeenIds.length} events no longer listed by scraper`, {
        slug: siteSlug,
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
 *
 * This function is **odds-only** — it never writes to the `status` column.
 * Event status is owned exclusively by the sports-data status service
 * (eventStatusService.ts) which polls API-Football for authoritative results,
 * and by the periodic updateEventStatuses() safety-net cleanup. Keeping the
 * two concerns separate eliminates false-positive LIVE promotions that were
 * previously caused by scraper HTML artefacts (e.g. elapsed-time text).
 */
async function persistEvent(siteId: string, ev: ScrapedEvent): Promise<PersistResult> {
  const result: PersistResult = { oddsChanges: [] };
  const home = normaliseTeamName(ev.homeTeam);
  const away = normaliseTeamName(ev.awayTeam);
  const league = sanitiseLeagueName(ev.league, home, away);

  let externalIdMatches: Array<{ id: string; externalId: string | null }> = [];
  if (ev.externalId) {
    externalIdMatches = await prisma.sportEvent.findMany({
      where: {
        sport: ev.sport as unknown as PrismaSport,
        externalId: ev.externalId,
        homeTeam: { equals: home, mode: 'insensitive' },
        awayTeam: { equals: away, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, externalId: true },
    });
  }

  if (externalIdMatches.length > 1) {
    const duplicateIds = externalIdMatches.slice(1).map((match) => match.id);
    await prisma.odd.updateMany({
      where: { siteId, eventId: { in: duplicateIds }, isActive: true },
      data: { isActive: false },
    });
  }

  // Widen by 30 min each side to absorb clock-skew between sites
  const windowStart = new Date(ev.eventDate.getTime() - 30 * 60 * 1000);
  const windowEnd   = new Date(ev.eventDate.getTime() + 30 * 60 * 1000);

  // Try to find an existing SportEvent row (possibly created by another scraper)
  const existing = externalIdMatches[0] ?? await prisma.sportEvent.findFirst({
    where: {
      sport: ev.sport as unknown as PrismaSport,
      homeTeam: { equals: home, mode: 'insensitive' },
      awayTeam: { equals: away, mode: 'insensitive' },
      eventDate: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, externalId: true },
  });

  let eventId: string;

  if (existing) {
    eventId = existing.id;
    // Update metadata only — status is intentionally excluded
    await prisma.sportEvent.update({
      where: { id: eventId },
      data: {
        externalId: existing.externalId ?? ev.externalId,
        league,
        homeTeam: home,
        awayTeam: away,
        eventDate: ev.eventDate,
      },
    });
  } else {
    const created = await prisma.sportEvent.create({
      data: {
        externalId: ev.externalId,
        sport: ev.sport as unknown as PrismaSport,
        league,
        homeTeam: home,
        awayTeam: away,
        eventDate: ev.eventDate,
        status: EventStatus.UPCOMING, // all new events start as UPCOMING
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
