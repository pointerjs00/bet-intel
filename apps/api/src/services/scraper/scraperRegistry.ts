import { Prisma, EventStatus, Sport as PrismaSport } from '@prisma/client';
import { prisma } from '../../prisma';
import { logger } from '../../utils/logger';
import type { IScraper, ScrapedEvent } from './types';
import { emitOddsUpdated } from '../../sockets/oddsSocket';
import { emitEventStatusChange } from '../../sockets/index';
import type { OddsUpdatedPayload, EventStatusChangePayload } from '@betintel/shared';
import { invalidateOddsCache } from '../odds/oddsService';
import { BetanoScraper } from './sites/betanoScraper';
import { BetclicScraper } from './sites/betclicScraper';
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
  scoreChange?: EventStatusChangePayload;
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

/** Registers the PT-only legal bookmaker scrapers used by BetIntel. */
export function registerDefaultScrapers(): void {
  if (registry.size > 0) {
    return;
  }

  registerScraper(new BetclicScraper());
  registerScraper(new BetanoScraper());
  registerScraper(new PlacardScraper());
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
  // Run all scrapers concurrently so the total cycle time equals the slowest
  // single scraper (~40-70 s) rather than the sum of all scrapers (~2.8 min).
  await Promise.allSettled(
    getAllScrapers().map((scraper) =>
      runScraperInstance(scraper).catch((err: unknown) => {
        logger.error(`Scraper run failed`, {
          slug: scraper.siteSlug,
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    ),
  );

  // ── Global odds deactivation for unseen LIVE events ─────────────────────────
  // All scrapers have now run. Any LIVE FOOTBALL event with NO active odd updated in the
  // last 10 minutes was not confirmed live by any scraper this cycle.
  // We deactivate their odds so stale prices don't appear in the feed.
  // Status (FINISHED) will be set by the sports-data status service once it
  // confirms the match is over — we don't guess here.
  //
  // Non-football sports (basketball, tennis, etc.) are excluded from this
  // aggressive 10-minute cleanup because their scrapers rely on external APIs
  // that can return 403/WAF blocks in individual cycles without the event
  // actually being over. The sport-specific time cutoffs in updateEventStatuses()
  // serve as the safety net for these sports with appropriately longer windows.
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stale = await prisma.sportEvent.findMany({
      where: {
        sport: PrismaSport.FOOTBALL,
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
  const pendingScoreChanges: EventStatusChangePayload[] = [];

  for (const ev of events) {
    try {
      const result = await persistEvent(site.id, ev);
      persisted++;
      pendingOddsChanges.push(...result.oddsChanges);
      if (result.scoreChange) {
        pendingScoreChanges.push(result.scoreChange);
      }
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
    // All team-name keys the scraper returned (live or upcoming).
    // Use fuzzy normalization so different scrapers' spellings (e.g. "Sporting CP"
    // vs "Sporting") produce the same key and don't falsely flag a live event as
    // unseen, which would prematurely deactivate its odds.
    const seenKeys = new Set(
      events.map((ev) =>
        `${normaliseTeamNameFuzzy(ev.homeTeam)}|${normaliseTeamNameFuzzy(ev.awayTeam)}`,
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
        (dbEv) => !seenKeys.has(
          `${normaliseTeamNameFuzzy(dbEv.homeTeam as unknown as string)}|${normaliseTeamNameFuzzy(dbEv.awayTeam as unknown as string)}`,
        ),
      )
      .map((dbEv) => dbEv.id);

    if (notSeenIds.length > 0) {
      // Betting site no longer lists these events → they may be over.
      // We don't force FINISHED here — the sports-data status service owns the
      // authoritative status. Instead deactivate their odds so stale odds are
      // hidden from the feed. The status cleanup will finalise them shortly.
      //
      // Grace period: only deactivate odds that haven't been refreshed in the
      // last 3 minutes. This protects against a single bad cycle (e.g. suspended
      // odds shown as "–" on Betclic, network hiccup, partial page load) where a
      // live event is temporarily absent from the scraper batch but is still
      // live. 3 min = 3 × the 60 s live scrape interval, requiring 3 consecutive
      // misses before odds are hidden. The global 10-minute cleanup in
      // runAllScrapers() provides the final safety net.
      const graceMs = 3 * 60 * 1000;
      await prisma.odd.updateMany({
        where: {
          siteId: site.id,
          eventId: { in: notSeenIds },
          isActive: true,
          updatedAt: { lt: new Date(Date.now() - graceMs) },
        },
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

  for (const payload of pendingScoreChanges) {
    emitEventStatusChange(payload);
  }

  return persisted;
}

/**
 * Scores a league name by specificity. Higher = more specific/useful.
 * Generic region names like "Europa" or "Américas" score low;
 * "Portugal - Primeira Liga" scores high.
 */
function leagueSpecificityScore(league: string): number {
  if (!league || league === 'Futebol') return 0;
  const lower = league.toLowerCase();
  const GENERIC_REGIONS = ['europa', 'américas', 'americas', 'ásia', 'asia', 'africa', 'áfrica', 'oceania'];
  if (GENERIC_REGIONS.includes(lower)) return 1;
  // Country-only names (no league separator) are medium quality
  if (!lower.includes(' - ') && !lower.includes(' liga') && !lower.includes(' league')
    && !lower.includes(' serie') && !lower.includes(' division') && !lower.includes(' premier')
    && !lower.includes(' bundesliga') && !lower.includes(' ligue') && !lower.includes(' primeira')
    && !lower.includes(' segunda')) return 2;
  return 3 + league.length;
}

/**
 * Chooses the better of two league names. Prefers more specific names.
 * E.g. "Portugal - Primeira Liga" wins over "Europa".
 */
function chooseBetterLeague(existingLeague: string, newLeague: string): string {
  const existingScore = leagueSpecificityScore(existingLeague);
  const newScore = leagueSpecificityScore(newLeague);
  return newScore >= existingScore ? newLeague : existingLeague;
}

/**
 * Upserts a scraped event and all its odds into the database.
 *
 * Events are matched across sites by: sport + normalised team names +
 * event date ±30 min window. This allows odds from multiple sites to point
 * at the same `SportEvent` row, enabling cross-site comparison.
 *
 * Event status is primarily owned by the sports-data status service
 * (eventStatusService.ts) which polls API-Football for authoritative results,
 * and by the periodic updateEventStatuses() safety-net cleanup.
 *
 * However, when a scraper explicitly reports `isLive === true`, this function
 * will promote an UPCOMING event to LIVE. This ensures live events appear
 * promptly even without an API-Football key. The scraper signal is only used
 * for forward promotions (UPCOMING→LIVE) — it never demotes or overwrites
 * FINISHED/CANCELLED status.
 */
async function persistEvent(siteId: string, ev: ScrapedEvent): Promise<PersistResult> {
  const result: PersistResult = { oddsChanges: [] };
  const home = normaliseTeamName(ev.homeTeam);
  const away = normaliseTeamName(ev.awayTeam);
  const league = sanitiseLeagueName(ev.league, home, away);

  type EventMatch = {
    id: string;
    externalId: string | null;
    apiFootballFixtureId: number | null;
    status: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    liveClock: string | null;
    eventDate: Date;
    updatedAt: Date;
    _count?: { odds: number };
  };

  let externalIdMatches: EventMatch[] = [];
  if (ev.externalId) {
    externalIdMatches = await prisma.sportEvent.findMany({
      where: {
        sport: ev.sport as unknown as PrismaSport,
        externalId: ev.externalId,
        homeTeam: { equals: home, mode: 'insensitive' },
        awayTeam: { equals: away, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, externalId: true, apiFootballFixtureId: true, status: true, league: true, homeTeam: true, awayTeam: true, homeScore: true, awayScore: true, liveClock: true, eventDate: true, updatedAt: true },
    });
  }

  if (externalIdMatches.length > 1) {
    const duplicateIds = externalIdMatches.slice(1).map((match) => match.id);
    await prisma.odd.updateMany({
      where: { siteId, eventId: { in: duplicateIds }, isActive: true },
      data: { isActive: false },
    });
  }

  // Widen by 6h each side to absorb clock-skew between betting sites.
  // Different scrapers often report significantly different kickoff times
  // for the same event (e.g. Betclic: 15:15, Solverde: 18:00, Betano: 12:00).
  const windowStart = new Date(ev.eventDate.getTime() - 6 * 60 * 60 * 1000);
  const windowEnd   = new Date(ev.eventDate.getTime() + 6 * 60 * 60 * 1000);

  // Try to find an existing SportEvent row (possibly created by another scraper)
  let existing: EventMatch | null = externalIdMatches[0] ?? await prisma.sportEvent.findFirst({
    where: {
      sport: ev.sport as unknown as PrismaSport,
      homeTeam: { equals: home, mode: 'insensitive' },
      awayTeam: { equals: away, mode: 'insensitive' },
      eventDate: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, externalId: true, apiFootballFixtureId: true, status: true, league: true, homeTeam: true, awayTeam: true, homeScore: true, awayScore: true, liveClock: true, eventDate: true, updatedAt: true },
  });

  if (!existing) {
    const fuzzyHome = normaliseTeamNameFuzzy(home);
    const fuzzyAway = normaliseTeamNameFuzzy(away);
    if (fuzzyHome && fuzzyAway) {
      const fuzzyCandidates = await prisma.sportEvent.findMany({
        where: {
          sport: ev.sport as unknown as PrismaSport,
          eventDate: { gte: windowStart, lte: windowEnd },
          status: { notIn: [EventStatus.CANCELLED as never, EventStatus.POSTPONED as never] },
        },
        select: { id: true, externalId: true, apiFootballFixtureId: true, status: true, league: true, homeTeam: true, awayTeam: true, homeScore: true, awayScore: true, liveClock: true, eventDate: true, updatedAt: true },
      });

      existing = fuzzyCandidates.find((candidate) =>
        fuzzyNamesMatch(fuzzyHome, normaliseTeamNameFuzzy(candidate.homeTeam as unknown as string))
        && fuzzyNamesMatch(fuzzyAway, normaliseTeamNameFuzzy(candidate.awayTeam as unknown as string)),
      ) ?? null;

      // For non-football sports, also try reversed home/away order.
      // Basketball/volleyball tournaments and finals are often played at neutral
      // sites, so different scrapers may list teams in opposite order.
      // We explicitly exclude FOOTBALL because 1X2 markets use positional
      // selections ("1" = home win) — reversing teams there would corrupt odds.
      if (!existing && ev.sport !== 'FOOTBALL') {
        existing = fuzzyCandidates.find((candidate) => {
          const candidateHome = normaliseTeamNameFuzzy(candidate.homeTeam as unknown as string);
          const candidateAway = normaliseTeamNameFuzzy(candidate.awayTeam as unknown as string);
          return fuzzyNamesMatch(fuzzyHome, candidateAway) && fuzzyNamesMatch(fuzzyAway, candidateHome);
        }) ?? null;
        if (existing) {
          logger.debug('persistEvent: reversed home/away match (neutral-site sport)', {
            home, away, sport: ev.sport,
            matchedHome: existing.homeTeam, matchedAway: existing.awayTeam,
          });
        }
      }
    }
  }

  // Fallback for live events whose date is unreliable (some scrapers fall back
  // to new Date() when a match is already in-play and no kickoff time is shown).
  // If no date-window match was found but the scraper says the event is live,
  // search a rolling +/-24h window for LIVE or UPCOMING events with the same
  // fuzzy team names, ignoring the exact kickoff time. This prevents duplicates
  // when one scraper reports the original kickoff and another reports "now" or
  // crosses a UTC day boundary.
  let sameTeamLiveCandidates: EventMatch[] = [];
  if (ev.isLive === true || existing == null) {
    const liveFallbackStart = new Date(ev.eventDate.getTime() - 48 * 60 * 60 * 1000);
    const liveFallbackEnd = new Date(ev.eventDate.getTime() + 48 * 60 * 60 * 1000);

    const liveCandidates = await prisma.sportEvent.findMany({
      where: {
        sport: ev.sport as unknown as PrismaSport,
        status: { in: [EventStatus.LIVE as never, EventStatus.UPCOMING as never] },
        eventDate: { gte: liveFallbackStart, lte: liveFallbackEnd },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        apiFootballFixtureId: true,
        status: true,
        league: true,
        homeTeam: true,
        awayTeam: true,
        homeScore: true,
        awayScore: true,
        liveClock: true,
        eventDate: true,
        updatedAt: true,
        _count: { select: { odds: { where: { isActive: true } } } },
      },
    });

    const fuzzyHome = normaliseTeamNameFuzzy(home);
    const fuzzyAway = normaliseTeamNameFuzzy(away);
    sameTeamLiveCandidates = liveCandidates.filter((candidate) => {
      const candidateHome = normaliseTeamNameFuzzy(candidate.homeTeam as unknown as string);
      const candidateAway = normaliseTeamNameFuzzy(candidate.awayTeam as unknown as string);
      // Same direction
      if (fuzzyNamesMatch(fuzzyHome, candidateHome) && fuzzyNamesMatch(fuzzyAway, candidateAway)) return true;
      // Reversed direction — allowed for non-football neutral-site sports only
      if (ev.sport !== 'FOOTBALL' && fuzzyNamesMatch(fuzzyHome, candidateAway) && fuzzyNamesMatch(fuzzyAway, candidateHome)) return true;
      return false;
    });

    const shouldUseSameTeamFallback =
      ev.isLive === true || sameTeamLiveCandidates.some((candidate) => candidate.status === EventStatus.LIVE);

    if (shouldUseSameTeamFallback && sameTeamLiveCandidates.length > 0) {
      sameTeamLiveCandidates.sort((left, right) => {
        const leftIsLive = left.status === EventStatus.LIVE ? 1 : 0;
        const rightIsLive = right.status === EventStatus.LIVE ? 1 : 0;
        if (rightIsLive !== leftIsLive) {
          return rightIsLive - leftIsLive;
        }

        const leftHasScore = left.homeScore != null && left.awayScore != null ? 1 : 0;
        const rightHasScore = right.homeScore != null && right.awayScore != null ? 1 : 0;
        if (rightHasScore !== leftHasScore) {
          return rightHasScore - leftHasScore;
        }

        const oddsDiff = (right._count?.odds ?? 0) - (left._count?.odds ?? 0);
        if (oddsDiff !== 0) {
          return oddsDiff;
        }

        return right.updatedAt.getTime() - left.updatedAt.getTime();
      });

      existing = sameTeamLiveCandidates[0] ?? existing;
      logger.debug('persistEvent: live same-team match found', {
        home, away,
        scraperDate: ev.eventDate.toISOString(),
        matched: existing?.id,
        candidates: sameTeamLiveCandidates.map((candidate) => candidate.id),
      });

      const staleCandidateIds = sameTeamLiveCandidates
        .filter((candidate) => candidate.id !== existing?.id)
        .map((candidate) => candidate.id);
      if (staleCandidateIds.length > 0 && existing) {
        // Migrate active odds from stale duplicate events to the primary event.
        // This preserves every site's odds rather than losing them when a scraper
        // picks a different "canonical" row. Strategy:
        //   1. Find which siteIds have active odds on stale rows.
        //   2. For those siteIds, deactivate any conflicting odds already on the
        //      primary (to avoid presenting double odds for one site).
        //   3. Re-point the stale odds to the primary event (update eventId).
        const staleActiveOdds = await prisma.odd.findMany({
          where: { eventId: { in: staleCandidateIds }, isActive: true },
          select: { siteId: true },
        });
        const staleSiteIds = [...new Set(staleActiveOdds.map((o) => o.siteId))];
        if (staleSiteIds.length > 0) {
          // Remove conflicting existing odds on primary for migrated sites
          await prisma.odd.updateMany({
            where: { eventId: existing.id, siteId: { in: staleSiteIds }, isActive: true },
            data: { isActive: false },
          });
          // Re-assign stale odds to the primary event
          await prisma.odd.updateMany({
            where: { eventId: { in: staleCandidateIds }, isActive: true },
            data: { eventId: existing.id },
          });
        }
        logger.info('persistEvent: migrated odds from stale duplicate events to primary', {
          primaryId: existing.id,
          staleCandidateIds,
          staleSiteIds,
          home,
          away,
        });
      }
    }
  }

  let eventId: string;
  // Hoisted flag — set inside `if (existing)`, read again after the if/else
  // block to guard the odds-processing section.
  let oddsWereSuppressed = false;

  if (existing) {
    eventId = existing.id;
    const hasScraperScores = ev.homeScore != null && ev.awayScore != null;
    const hasAuthoritativeScores = existing.homeScore != null && existing.awayScore != null;

    // Compute goal totals early — needed for both suppression check and score update.
    const scraperTotalGoals  = (ev.homeScore ?? 0) + (ev.awayScore ?? 0);
    const dbTotalGoals       = (existing.homeScore ?? 0) + (existing.awayScore ?? 0);
    const scraperIsMoreRecent = scraperTotalGoals >= dbTotalGoals;

    // Only suppress odds when the scraper reports MORE goals than the DB
    // (= scraper detected a goal before API-Football did). In that window the
    // scraper's odds prices haven't been repriced yet and may be exploitable.
    //
    // When the DB is already AHEAD (DB total goals > scraper total), API-Football
    // has already recorded the goal and the bookmaker is still catching up.
    // The bookmaker will momentarily suspend its own markets; once it reopens
    // them the scraper will show updated prices. Deactivating odds here would
    // make the match card disappear from the feed for the entire repricing window
    // (which can span multiple minutes), which is worse than showing slightly
    // stale odds the bookmaker has already re-published.
    const scoresDisagree =
      existing.homeScore !== ev.homeScore || existing.awayScore !== ev.awayScore;
    const shouldSuppressMismatchedLiveOdds =
      ev.isLive === true
      && existing.apiFootballFixtureId != null
      && hasScraperScores
      && hasAuthoritativeScores
      && scoresDisagree
      && scraperTotalGoals > dbTotalGoals; // scraper is AHEAD of API-Football

    if (shouldSuppressMismatchedLiveOdds) {
      oddsWereSuppressed = true;
      // Do NOT deactivate existing odds here. The last clean set of odds
      // (written when scraper and API-Football agreed) remains active so the
      // match card stays visible in the feed. We only skip writing the new
      // scraper odds (handled by the early return below) until API-Football
      // confirms the goal.
      logger.info('Suppressed live odds because scraper score disagrees with authoritative score', {
        eventId,
        siteId,
        homeTeam: home,
        awayTeam: away,
        authoritativeScore: `${existing.homeScore}-${existing.awayScore}`,
        scraperScore: `${ev.homeScore}-${ev.awayScore}`,
      });

      // Do NOT return early — fall through so that score/clock updates still
      // happen. The scraper is ahead of API-Football so its score is the truth.
    }

    // Promote UPCOMING → LIVE when the betting site reports in-play.
    // Only promote forward (UPCOMING→LIVE); never demote LIVE→UPCOMING
    // or touch FINISHED events.
    // Guard: require that kick-off is within 5 minutes of now (or has already
    // passed). This prevents spurious LIVE promotions when a scraper
    // mis-classifies a pre-match "starting soon" page as in-play.
    const kickoffInFutureMs = existing.eventDate.getTime() - Date.now();
    const shouldPromoteLive =
      ev.isLive === true &&
      existing.status === EventStatus.UPCOMING &&
      kickoffInFutureMs <= 5 * 60 * 1000; // at most 5 min before kick-off

    // Write scraper-sourced scores when the event is live and the DB has no
    // scores yet. API-Football is authoritative — once it writes scores we
    // never overwrite them. Scraper scores act as a fast initial source.
    const dbMissingScores =
      existing.homeScore === null || existing.awayScore === null;
    const isLiveEvent =
      shouldPromoteLive || existing.status === EventStatus.LIVE || ev.isLive === true;
    const shouldWriteScores =
      hasScraperScores && dbMissingScores && isLiveEvent;
    // Also update scores if the event is live and the scraper reports different
    // values (e.g. a goal was scored between API-Football polls).
    // When odds were suppressed due to a score mismatch, only allow the update
    // if the scraper has more total goals (= more recent than API-Football's
    // last poll). This handles: API-Football set 0-0 early on, match progressed
    // to 3-2 in the 5-minute polling gap — scraper's data is the truth.
    const shouldUpdateScores =
      hasScraperScores && isLiveEvent && !dbMissingScores &&
      (existing.homeScore !== ev.homeScore || existing.awayScore !== ev.awayScore) &&
      (!shouldSuppressMismatchedLiveOdds || scraperIsMoreRecent);
    const hasScraperLiveClock = typeof ev.liveClock === 'string' && ev.liveClock.trim().length > 0;
    const nextScraperLiveClock = hasScraperLiveClock ? ev.liveClock!.trim() : null;
    const shouldUpdateLiveClock =
      hasScraperLiveClock &&
      isLiveEvent &&
      shouldReplaceLiveClock(existing.liveClock, nextScraperLiveClock!);
    const shouldPreserveLiveEventDate =
      ev.isLive === true &&
      Math.abs(existing.eventDate.getTime() - ev.eventDate.getTime()) > 30 * 60 * 1000;
    const nextEventDate = shouldPreserveLiveEventDate
      ? new Date(Math.min(existing.eventDate.getTime(), ev.eventDate.getTime()))
      : ev.eventDate;

    const scoreData = (shouldWriteScores || shouldUpdateScores)
      ? { homeScore: ev.homeScore!, awayScore: ev.awayScore! }
      : {};
    const liveClockData = shouldUpdateLiveClock
      ? { liveClock: nextScraperLiveClock! }
      : {};

    await prisma.sportEvent.update({
      where: { id: eventId },
      data: {
        externalId: existing.externalId ?? ev.externalId,
        league: chooseBetterLeague(existing.league, league),
        homeTeam: home,
        awayTeam: away,
        eventDate: nextEventDate,
        ...(shouldPromoteLive ? { status: EventStatus.LIVE as never } : {}),
        ...scoreData,
        ...liveClockData,
      },
    });

    // Emit score/status change via Socket.io so mobile UI updates immediately
    if (shouldWriteScores || shouldUpdateScores || shouldPromoteLive || shouldUpdateLiveClock) {
      const newStatus = shouldPromoteLive ? EventStatus.LIVE : existing.status;
      result.scoreChange = {
        eventId,
        status: newStatus as unknown as import('@betintel/shared').EventStatus,
        homeScore: (shouldWriteScores || shouldUpdateScores) ? ev.homeScore! : existing.homeScore,
        awayScore: (shouldWriteScores || shouldUpdateScores) ? ev.awayScore! : existing.awayScore,
        liveClock: shouldUpdateLiveClock ? nextScraperLiveClock! : existing.liveClock,
      };
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
        status: ev.isLive ? (EventStatus.LIVE as never) : EventStatus.UPCOMING,
        ...(ev.isLive && ev.homeScore != null && ev.awayScore != null
          ? { homeScore: ev.homeScore, awayScore: ev.awayScore }
          : {}),
        ...(ev.isLive && ev.liveClock ? { liveClock: ev.liveClock.trim() } : {}),
      },
      select: { id: true },
    });
    eventId = created.id;
  }

  // Mark all existing odds for this site+event as inactive before re-inserting.
  // This cleanly handles removed markets / selections without leaving stale rows.
  // Skip when odds were already suppressed above (mismatch with authoritative score).
  if (oddsWereSuppressed) {
    return result;
  }

  // Fetch all existing odds for this site+event in ONE query (replaces N individual findFirst calls)
  const existingOdds = await prisma.odd.findMany({
    where: { siteId, eventId },
    select: { id: true, market: true, selection: true, value: true, isActive: true },
  });

  // Build lookup map: "market|selection" → { id, value }
  const oddLookup = new Map<string, { id: string; value: Prisma.Decimal }>();
  for (const odd of existingOdds) {
    oddLookup.set(`${odd.market}|${odd.selection}`, { id: odd.id, value: odd.value });
  }

  // Mark all existing odds inactive in a single query
  if (existingOdds.length > 0) {
    await prisma.odd.updateMany({
      where: { siteId, eventId },
      data: { isActive: false },
    });
  }

  // Collect new rows to batch-create and existing rows to batch-update
  const toCreate: Array<{ siteId: string; eventId: string; market: string; selection: string; value: Prisma.Decimal; isActive: boolean }> = [];
  const toUpdate: Array<{ id: string; value: Prisma.Decimal }> = [];
  const now = new Date();

  for (const mkt of ev.markets) {
    for (const sel of mkt.selections) {
      if (!isValidOdds(sel.value)) continue;

      const key = `${mkt.market}|${sel.selection}`;
      const existing = oddLookup.get(key);

      if (existing) {
        toUpdate.push({ id: existing.id, value: new Prisma.Decimal(sel.value) });

        const oldValue = existing.value.toFixed(2);
        const newValue = sel.value.toFixed(2);
        if (oldValue !== newValue) {
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
        toCreate.push({
          siteId,
          eventId,
          market: mkt.market,
          selection: sel.selection,
          value: new Prisma.Decimal(sel.value),
          isActive: true,
        });
      }
    }
  }

  // Batch-create new odds (single query)
  if (toCreate.length > 0) {
    await prisma.odd.createMany({ data: toCreate });
  }

  // Batch-update existing odds — use a single $transaction for all updates
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((row) =>
        prisma.odd.update({
          where: { id: row.id },
          data: { value: row.value, isActive: true, scrapedAt: now },
        }),
      ),
    );
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collapses whitespace and trims a team name for consistent DB storage. */
/**
 * Normalises a team name for cross-site matching.
 *
 * Key transformations:
 *  - Collapse whitespace
 *  - Canonicalise youth/age-group suffixes to "Sub-N" form so that
 *    "França S21", "França U21", "França Sub 21", "França Under-21" etc.
 *    all produce the same string and match the same SportEvent row.
 */
function normaliseTeamName(name: string): string {
  let n = name.replace(/\s+/g, ' ').trim();

  const aliasKey = n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const countryDisplayAliases = new Map<string, string>([
    ['guyana', 'Guiana'],
    ['cyprus', 'Chipre'],
    ['moldova', 'Moldavia'],
    ['sierra leone', 'Serra Leoa'],
    ['wales', 'País de Gales'],
    ['england', 'Inglaterra'],
    ['scotland', 'Escócia'],
    ['northern ireland', 'Irlanda do Norte'],
    ['south korea', 'Coreia do Sul'],
    ['north korea', 'Coreia do Norte'],
    ['saudi arabia', 'Arábia Saudita'],
    ['south africa', 'África do Sul'],
    ['new zealand', 'Nova Zelândia'],
    ['czech republic', 'República Checa'],
  ]);

  const aliased = countryDisplayAliases.get(aliasKey);
  if (aliased) {
    n = aliased;
  }

  // Canonicalise age-group suffixes → Sub-N
  // Handles: Sub-21, Sub21, Sub 21, Under-21, S21, U21, U 21, etc.
  // Multi-char prefixes (Sub, Under) are listed first so "Sub-21" is consumed
  // as a full prefix and the standalone-S/U branch only fires for bare "S21"/"U21".
  n = n.replace(
    /\b(?:Sub[\s-]?|Under[\s-]?|[SU][\s-]?)(\d{2})\b/gi,
    (_, age) => `Sub-${age}`,
  );

  return n;
}

const FUZZY_NOISE_TOKENS = new Set([
  'club', 'atletico', 'atletica', 'atletico', 'atlético', 'atlética',
  'fc', 'cf', 'ac', 'sc', 'rc', 'rcd', 'ssd', 'asd', 'fk', 'sk', 'bk', 'csd',
  'tsg', 'vfl', 'vfb', 'tsv', 'fsv', 'spvgg', 'sv', 'bsc', 'tfc',
  'association', 'associazione', 'calcio', 'football', 'futebol', 'fútbol',
  // Legal suffixes (PT/ES/NL/BE)
  'sad', 'sab', 'bv', 'nv',
  'de', 'del', 'la', 'las', 'los', 'el', 'do', 'da', 'dos', 'das', 'van',
]);

/**
 * Maps common Portuguese/French localised team names to their canonical form
 * so different scrapers produce matching fuzzy tokens.
 * Key = lowered, NFD-stripped, space-normalised form.
 * Value = canonical lowered fuzzy form.
 */
const TEAM_FUZZY_ALIASES = new Map<string, string>([
  // ── Germany ──────────────────
  ['borussia monchengladbach', 'gladbach'],
  ['borussia mgladbach', 'gladbach'],
  ['mgladbach', 'gladbach'],
  ['monchengladbach', 'gladbach'],
  ['bayern munique', 'bayern munchen'],
  ['bayern munich', 'bayern munchen'],
  ['bayern de munique', 'bayern munchen'],
  ['friburgo', 'freiburg'],
  ['hamburgo', 'hamburg'],
  ['augsburgo', 'augsburg'],
  ['wolfsburgo', 'wolfsburg'],
  ['estugarda', 'stuttgart'],
  ['leverkusen', 'bayer leverkusen'],
  ['colonia', 'koln'],
  ['dusseldorf', 'dusseldorf'],
  ['nuremberga', 'nurnberg'],
  ['1860 munchen', '1860 munchen'],
  ['1860 munique', '1860 munchen'],
  // ── Italy ────────────────────
  ['internazionale', 'inter'],
  ['inter de milao', 'inter'],
  ['inter milan', 'inter'],
  ['ac milan', 'milan'],
  ['napoles', 'napoli'],
  // ── England ──────────────────
  ['wolverhampton wanderers', 'wolverhampton'],
  ['wolverhampton', 'wolves'],
  ['wolverhampton wolves', 'wolves'],
  ['man city', 'manchester city'],
  ['man utd', 'manchester united'],
  ['man united', 'manchester united'],
  ['newcastle utd', 'newcastle united'],
  ['newcastle', 'newcastle united'],
  ['nottingham', 'nottingham forest'],
  ['nott forest', 'nottingham forest'],
  ['brighton hove albion', 'brighton'],
  ['west bromwich albion', 'west brom'],
  ['sheffield utd', 'sheffield united'],
  ['tottenham hotspur', 'tottenham'],
  // ── France ───────────────────
  ['paris saint germain', 'psg'],
  ['paris sg', 'psg'],
  ['paris saint-germain', 'psg'],
  ['marselha', 'marseille'],
  ['olimpique marselha', 'marseille'],
  ['liao', 'lille'],
  ['estrassburgo', 'strasbourg'],
  ['saint etienne', 'st etienne'],
  // ── Spain ────────────────────
  ['atletico madrid', 'atletico madrid'],
  ['atletico de madrid', 'atletico madrid'],
  ['real sociedad', 'real sociedad'],
  ['real betis', 'real betis'],
  // ── Portugal ──────────────────
  ['sporting cp', 'sporting'],
  ['sporting lisboa', 'sporting'],
  ['fc porto', 'porto'],
  ['sl benfica', 'benfica'],
  ['sport lisboa benfica', 'benfica'],
  // ── NBA — Kambi/Placard uses 3-letter city codes; Betclic/Betano use full names ──
  // All 30 teams mapped so any abbreviation matches the full-name canonical form.
  ['atl hawks', 'atlanta hawks'],
  ['bos celtics', 'boston celtics'],
  ['bkn nets', 'brooklyn nets'],
  ['brk nets', 'brooklyn nets'],
  ['cha hornets', 'charlotte hornets'],
  ['chi bulls', 'chicago bulls'],
  ['cle cavaliers', 'cleveland cavaliers'],
  ['cle cavs', 'cleveland cavaliers'],
  ['dal mavericks', 'dallas mavericks'],
  ['dal mavs', 'dallas mavericks'],
  ['den nuggets', 'denver nuggets'],
  ['det pistons', 'detroit pistons'],
  ['gs warriors', 'golden state warriors'],
  ['gsw warriors', 'golden state warriors'],
  ['hou rockets', 'houston rockets'],
  ['ind pacers', 'indiana pacers'],
  ['lac clippers', 'los angeles clippers'],
  ['la clippers', 'los angeles clippers'],
  ['lal lakers', 'los angeles lakers'],
  ['la lakers', 'los angeles lakers'],
  ['mem grizzlies', 'memphis grizzlies'],
  ['mia heat', 'miami heat'],
  ['mil bucks', 'milwaukee bucks'],
  ['min timberwolves', 'minnesota timberwolves'],
  ['min twolves', 'minnesota timberwolves'],
  ['no pelicans', 'new orleans pelicans'],
  ['nop pelicans', 'new orleans pelicans'],
  ['ny knicks', 'new york knicks'],
  ['nyk knicks', 'new york knicks'],
  ['okc thunder', 'oklahoma city thunder'],
  ['orl magic', 'orlando magic'],
  ['phi 76ers', 'philadelphia 76ers'],
  ['phi sixers', 'philadelphia 76ers'],
  ['phx suns', 'phoenix suns'],
  ['pho suns', 'phoenix suns'],
  ['por trail blazers', 'portland trail blazers'],
  ['por trailblazers', 'portland trail blazers'],
  ['sac kings', 'sacramento kings'],
  ['sa spurs', 'san antonio spurs'],
  ['sas spurs', 'san antonio spurs'],
  ['tor raptors', 'toronto raptors'],
  ['uta jazz', 'utah jazz'],
  ['was wizards', 'washington wizards'],
  ['wsh wizards', 'washington wizards'],
]);


const FUZZY_COUNTRY_ALIASES = new Map<string, string>([
  ['guyana', 'guiana'],
  ['guiana', 'guiana'],
  ['chipre', 'cyprus'],
  ['moldavia', 'moldova'],
  ['eua', 'usa'],
  ['estados unidos', 'usa'],
  ['serra leoa', 'sierra leone'],
  ['pais de gales', 'wales'],
  ['país de gales', 'wales'],
  ['inglaterra', 'england'],
  ['escocia', 'scotland'],
  ['escócia', 'scotland'],
  ['irlanda do norte', 'northern ireland'],
  ['coreia do sul', 'south korea'],
  ['coreia do norte', 'north korea'],
  ['arabia saudita', 'saudi arabia'],
  ['arábia saudita', 'saudi arabia'],
  ['africa do sul', 'south africa'],
  ['áfrica do sul', 'south africa'],
  ['nova zelandia', 'new zealand'],
  ['nova zelândia', 'new zealand'],
  ['republica checa', 'czech republic'],
  ['república checa', 'czech republic'],
]);

function applyFuzzyCountryAlias(name: string): string {
  return FUZZY_COUNTRY_ALIASES.get(name) ?? name;
}

function normaliseTeamNameFuzzy(name: string): string {
  const normalised = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Join apostrophe-abbreviated parts: M'gladbach → mgladbach
    .replace(/'/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check full-string alias first (before noise filtering)
  const aliased = TEAM_FUZZY_ALIASES.get(normalised);
  if (aliased) return aliased;

  const tokens = applyFuzzyCountryAlias(normalised)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FUZZY_NOISE_TOKENS.has(word))
    .join(' ')
    .trim();

  // Check alias again after noise filtering
  return TEAM_FUZZY_ALIASES.get(tokens) ?? tokens;
}

function fuzzyNamesMatch(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  // Acronym/initials check: Kambi often uses acronyms like "AFS" for "AVS Futebol SAD".
  // If one side is a single short token (2–5 chars), check if it equals the
  // initials of the other side's tokens.
  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);
  if (leftWords.length === 1 && left.length >= 2 && left.length <= 5 && rightWords.length > 1) {
    const initials = rightWords.map((w) => w[0]).join('');
    if (left === initials) return true;
  }
  if (rightWords.length === 1 && right.length >= 2 && right.length <= 5 && leftWords.length > 1) {
    const initials = leftWords.map((w) => w[0]).join('');
    if (right === initials) return true;
  }

  // Token-overlap: if all tokens of the shorter name appear in the longer name,
  // treat them as matching.  This handles cases like:
  //   "sporting cp" vs "sporting lisbon" — both share "sporting"
  //   "rb bragantino" vs "bragantino" — shorter is subset of longer
  // Also allows suffix matching for tokens ≥5 chars to handle abbreviations like
  //   "gladbach" matching "monchengladbach" (via M'gladbach abbreviation)
  const [shorter, longer] = leftWords.length <= rightWords.length
    ? [leftWords, rightWords]
    : [rightWords, leftWords];

  const tokenMatches = (token: string, targets: string[]): boolean =>
    targets.some((t) =>
      t === token ||
      (token.length >= 5 && t.endsWith(token)) ||
      (t.length >= 5 && token.endsWith(t)),
    );

  return shorter.length > 0 && shorter.every((token) => tokenMatches(token, longer));
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

  // Strip trailing round/group details and bullet-separated phase suffixes:
  //   "Áustria - Bundesliga - Grupo Relegation Round, Jornada 24" → "Áustria - Bundesliga"
  //   "Liga Portugal - Jornada 30"  → "Liga Portugal"
  //   "England - Premier League - Round 28"  → "England - Premier League"
  //   "Dinamarca - 1.ª Divisão • Grupo Promotion Round" → "Dinamarca - 1.ª Divisão"
  normalised = normalised
    .replace(/\s*[•·]\s*.*/i, '')  // strip bullet-separated suffixes (Kambi group/phase)
    .replace(/\s*[-–]\s*(?:Grupo|Group|Round|Ronda|Jornada|Giornata|Matchday|Spieltag|Journée|Fase|Phase|Playoff|Play-off|Relegation|Qualification|Qualificação)\b.*/i, '')
    .replace(/\s*,\s*(?:Jornada|Round|Matchday|Spieltag|Giornata|Journée)\b.*/i, '')
    .replace(/\s+\d+['+]*$/, '') // trailing minute markers like " 90+1'"
    .trim();

  return normaliseLeagueToCanonical(normalised) || 'Futebol';
}

/**
 * Maps well-known league name variants to a single canonical display name.
 * Handles differences between Betano, Kambi (Placard/Solverde), and Betclic scrapers.
 */
function normaliseLeagueToCanonical(league: string): string {
  const l = league.toLowerCase();

  // ── Portugal ──────────────────────────────────────────────────────
  if (
    (/\bprimeira\s*liga\b/.test(l) || /\bliga\s*portugal\b/.test(l) || l === 'liga nos' || l === 'liga portuguesa') &&
    !/\bsegunda\b/.test(l) && !/\b2[.°º]?\b/.test(l) && !/\bii\b/.test(l)
  ) return 'Portugal - Primeira Liga';

  if (
    /\bsegunda\s*liga\b/.test(l) ||
    (/\bliga\s*portugal\b/.test(l) && (/\b2[.°º]?\b/.test(l) || /\bsegunda\b/.test(l)))
  ) return 'Portugal - Segunda Liga';

  // ── UEFA ──────────────────────────────────────────────────────────
  if (/champions\s*league/.test(l) || /liga\s*dos\s*campe/.test(l))
    return 'UEFA Champions League';

  if (/conference\s*league/.test(l) || /liga\s*confer/.test(l))
    return 'UEFA Conference League';

  if (/\beuropa\s*league\b/.test(l) || (l.includes('liga europa') && !l.includes('conference') && !l.includes('champions')))
    return 'UEFA Europa League';

  if (/nations\s*league/.test(l) || /liga\s*das\s*na/.test(l))
    return 'UEFA Nations League';

  // ── Spain ─────────────────────────────────────────────────────────
  if (/la\s*liga\s*2/.test(l) || /segunda\s*divis/.test(l))
    return 'Espanha - La Liga 2';

  // Primera Federación (3rd tier, formerly "Primera División RFEF") — must come before La Liga
  // Require Spanish context for the abbreviation form ("primera f.") to avoid
  // matching Mexican "Primera División" leagues.
  if (
    /primera\s*feder|rfef/.test(l) ||
    (/\bprimera\s*f\.?\b/.test(l) && (l.includes('espanha') || l.includes('espa\u00f1a')))
  )
    return 'Espanha - Primera Federación';

  // La Liga: explicit "la liga", or "primera división" only if no RFEF/Federación suffix
  if ((/\bla\s*liga\b/.test(l) || (/primera\s*divis/.test(l) && !/rfef|feder/.test(l))) && !/la\s*liga\s*2/.test(l))
    return 'Espanha - La Liga';

  // ── England ───────────────────────────────────────────────────────
  // Require explicit English context. Bare "Premier League" stays unmapped so
  // that chooseBetterLeague can pick the correct country from another scraper
  // (e.g. Kambi sends "Bahrain - Premier League" which would override later).
  if (
    /\bpremier\s*league\b/.test(l) &&
    !/premier\s*league\s*2/.test(l) &&
    (l.includes('england') || l.includes('inglat') || l.includes('reino unido'))
  )
    return 'Inglaterra - Premier League';

  if (/\bchampionship\b/.test(l) && (l.includes('england') || l.includes('inglat') || !l.includes(' - ')))
    return 'Inglaterra - Championship';

  // ── Germany ───────────────────────────────────────────────────────
  if (/3\.?\s*liga/.test(l) && (/alemanha|germany/.test(l) || !l.includes(' - ')))
    return 'Alemanha - 3. Liga';

  if (/2\.?\s*bundesliga|bundesliga\s*2/.test(l))
    return 'Alemanha - 2. Bundesliga';

  if (/\bbundesliga\b/.test(l) && !l.includes('áustria') && !l.includes('austria') && !l.includes('suíça') && !l.includes('schweiz'))
    return 'Alemanha - Bundesliga';

  // ── France ────────────────────────────────────────────────────────
  if (/\bligue\s*1\b/.test(l)) return 'França - Ligue 1';
  if (/\bligue\s*2\b/.test(l)) return 'França - Ligue 2';

  // ── Italy ─────────────────────────────────────────────────────────
  // Require Italian context or no country prefix — exclude Ecuador "Liga Pro Serie A",
  // Brazilian "Série A", and women's "Serie A - Feminino".
  if (
    /\bs[eé]rie\s*a\b/.test(l) &&
    !l.includes('brasil') && !l.includes('brazil') &&
    !l.includes('equador') && !l.includes('ecuador') &&
    !l.includes('liga pro') &&
    !/feminin|women|\(f\)/.test(l) &&
    (l.includes('itália') || l.includes('italia') || !l.includes(' - '))
  )
    return 'Itália - Serie A';

  if (
    /\bs[eé]rie\s*b\b/.test(l) &&
    !l.includes('brasil') && !l.includes('brazil') &&
    !l.includes('equador') && !l.includes('ecuador') &&
    !l.includes('liga pro') &&
    (l.includes('itália') || l.includes('italia') || !l.includes(' - '))
  )
    return 'Itália - Serie B';

  // ── Netherlands ───────────────────────────────────────────────────
  if (/\beredivisie\b/.test(l)) return 'Holanda - Eredivisie';

  // ── Brazil ────────────────────────────────────────────────────────
  if (/campeonato\s*brasileiro/.test(l)) return 'Brasil - Série A';

  // ── Wales ─────────────────────────────────────────────────────────
  if (/pa[ií]s\s*de\s*gales/.test(l) && (/\bpremier\b/.test(l) || /\bcymru\b/.test(l)))
    return 'País de Gales - Cymru Premier';

  // ── Croatia ───────────────────────────────────────────────────────
  if (/cro[aá]cia/.test(l) && (/\bhnl\b/.test(l) || /\b1\.\s*nl\b/.test(l)))
    return 'Croácia - HNL';

  // ── Serbia ────────────────────────────────────────────────────────
  if (/s[eé]rvia/.test(l) && /super\s*liga/.test(l))
    return 'Sérvia - SuperLiga';

  // ── Bulgaria ──────────────────────────────────────────────────────
  if (/bulg[aá]ria/.test(l) && /parva\s*liga|liga\s*parva/.test(l))
    return 'Bulgária - Parva Liga';

  // ── Bosnia ────────────────────────────────────────────────────────
  if (/b[oó]snia/.test(l) && /premij?er\s*liga/.test(l))
    return 'Bósnia-Herzegovina - Premijer Liga';

  // ── Saudi Arabia ──────────────────────────────────────────────────
  if (/ar[aá]bia\s*saudita/.test(l) && (/pro\s*league/.test(l) || /liga\s*profissional/.test(l)))
    return 'Arábia Saudita - Liga Profissional';

  // ── Georgia ───────────────────────────────────────────────────────
  if (/ge[oó]rgia/.test(l) && /erovnuli/.test(l))
    return 'Geórgia - Erovnuli Liga';

  // ── Switzerland ───────────────────────────────────────────────────
  if (/su[ií][çc]a/.test(l) && (/challenge\s*league/.test(l) || /liga\s*challenge/.test(l)))
    return 'Suíça - Challenge League';

  // ── Qatar ─────────────────────────────────────────────────────────
  if (/catar/.test(l) && (/stars?\s*league/.test(l) || /liga\s*das\s*estrelas/.test(l)))
    return 'Catar - Stars League';

  // ── Belgium ───────────────────────────────────────────────────────
  if (/b[eé]lgica/.test(l) && (/1a?\s*pro\s*league/.test(l) || /primeira\s*divis[ãa]o\s*a\b/.test(l)))
    return 'Bélgica - Primeira Divisão A';

  // ── Denmark ───────────────────────────────────────────────────────
  if (/dinamarca/.test(l) && /1[.ªº]?\s*divis/.test(l))
    return 'Dinamarca - 1ª Divisão';

  // ── Country spelling normalisation (PT-BR → PT-PT) ────────────────
  if (/rom[êe]nia/.test(l) && !l.startsWith('roménia'))
    return league.replace(/Rom[êe]nia/, 'Roménia');
  if (/eslov[êe]nia/.test(l) && !l.startsWith('eslovénia'))
    return league.replace(/Eslov[êe]nia/, 'Eslovénia');
  if (/maced[ôo]nia/.test(l) && l.includes('ô'))
    return league.replace(/Macedônia/, 'Macedónia');

  return league;
}

function parseLiveClockProgress(clock: string): number | null {
  const value = clock.trim();
  if (!value) {
    return null;
  }

  if (/^int\.?$/i.test(value)) {
    return 45.5;
  }

  const minuteMatch = value.match(/^(\d+)(?:\+(\d+))?'$/);
  if (!minuteMatch) {
    return null;
  }

  const minute = Number(minuteMatch[1]);
  const addedTime = Number(minuteMatch[2] ?? '0');
  if (!Number.isFinite(minute) || !Number.isFinite(addedTime)) {
    return null;
  }

  return minute + addedTime / 1000;
}

function shouldReplaceLiveClock(existingClock: string | null, nextClock: string): boolean {
  const incoming = nextClock.trim();
  if (!incoming) {
    return false;
  }

  const current = existingClock?.trim() ?? '';
  if (!current) {
    return true;
  }

  if (current === incoming) {
    return false;
  }

  const currentProgress = parseLiveClockProgress(current);
  const nextProgress = parseLiveClockProgress(incoming);
  if (currentProgress == null || nextProgress == null) {
    return true;
  }

  return nextProgress >= currentProgress;
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
