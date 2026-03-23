/**
 * Event Status Service — authoritative match status from API-Football.
 *
 * This service is the single source of truth for UPCOMING → LIVE → FINISHED
 * transitions and live scores. It polls the API-Football REST API every 30
 * seconds for matches in a ±3-hour window around the current time, maps their
 * fixture status to our DB enum, and writes + broadcasts any changes.
 *
 * By keeping status ownership here (not in the scrapers) we eliminate the
 * class of bugs where HTML artefacts (e.g. "90+3'" elapsed-time text) caused
 * scrapers to mis-promote finished matches as LIVE.
 *
 * API-Football docs: https://www.api-football.com/documentation-v3
 * Relevant endpoint: GET /fixtures?live=all  and  GET /fixtures?date=YYYY-MM-DD
 *
 * Free plan: 100 req/day / 10 req/min — enough for testing.
 * Pro plan:  unlimited → set API_FOOTBALL_KEY env var.
 * If the key is absent the service logs a warning and does nothing (all status
 * logic falls back to the safety-net in updateEventStatuses()).
 */

import https from 'https';
import { EventStatus, Sport as PrismaSport } from '@prisma/client';
import { prisma } from '../../prisma';
import { logger } from '../../utils/logger';
import { invalidateOddsCache, updateEventStatuses } from '../odds/oddsService';
import { emitEventStatusChange } from '../../sockets/index';
import type { EventStatus as SharedEventStatus } from '@betintel/shared';

// ─── API-Football types (subset) ─────────────────────────────────────────────

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string; // ISO 8601
    status: {
      short: string; // NS, 1H, HT, 2H, ET, P, FT, AET, PEN, SUSP, INT, ABD, AWD, WO, LIVE
      elapsed: number | null;
    };
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  league: {
    id: number;
    name: string;
    country: string;
  };
}

interface ApiFootballResponse {
  response: ApiFootballFixture[];
}

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps API-Football short status codes to our DB EventStatus enum.
 * Returns null for statuses we should not act on (e.g. unknown codes).
 */
function mapApiStatus(short: string): EventStatus | null {
  switch (short) {
    case 'NS':   // Not Started
    case 'TBD':  // Time To Be Defined
      return EventStatus.UPCOMING;

    case '1H':   // First Half
    case 'HT':   // Halftime
    case '2H':   // Second Half
    case 'ET':   // Extra Time
    case 'P':    // Penalty In Progress
    case 'BT':   // Break Time (between ET halves)
    case 'LIVE': // Generic live
      return EventStatus.LIVE;

    case 'FT':   // Full Time
    case 'AET':  // After Extra Time
    case 'PEN':  // After Penalties
    case 'AWD':  // Technical loss (awarded)
    case 'WO':   // Walkover
      return EventStatus.FINISHED;

    case 'SUSP': // Suspended
    case 'INT':  // Interrupted
    case 'PST':  // Postponed
    case 'CANC': // Cancelled
    case 'ABD':  // Abandoned
      return EventStatus.CANCELLED;

    default:
      return null;
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function apiGet(path: string, apiKey: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'v3.football.api-sports.io',
      path,
      method: 'GET',
      headers: {
        'x-apisports-key': apiKey,
        'Accept': 'application/json',
      },
      timeout: 15_000,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(new Error(`JSON parse failed: ${String(e)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API-Football request timed out'));
    });

    req.end();
  });
}

// ─── Name normalisation (mirrors scraperRegistry.normaliseTeamName) ───────────

function normaliseName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Common noise tokens stripped before fuzzy team-name comparison.
 * Covers club type designations and common prepositions used in official names
 * that betting sites abbreviate away (e.g. "Club Atlético Boca Juniors" → "boca juniors").
 */
const NOISE_TOKENS = new Set([
  'club', 'atletico', 'atletica', 'atlético', 'atlética',
  'fc', 'cf', 'ac', 'sc', 'rc', 'rcd', 'ssd', 'asd', 'fk', 'sk', 'bk',
  'sporting', 'association', 'associazione', 'calcio', 'football',
  'de', 'del', 'la', 'las', 'los', 'el', 'do', 'da', 'dos', 'das', 'van',
]);

/**
 * Strips diacritics, punctuation, and noise tokens so that API-Football's
 * official club names can be compared against abbreviated scraped names.
 * Example: "Club Atlético Boca Juniors" → "boca juniors"
 *          "Instituto AC de Córdoba" → "instituto cordoba"
 */
function normaliseNameFuzzy(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (é→e, ó→o, ü→u)
    .replace(/[^a-z0-9\s]/g, ' ')    // punctuation → space
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_TOKENS.has(w))
    .join(' ')
    .trim();
}

async function findEventForFixture(fixture: ApiFootballFixture) {
  const existingByFixtureId = await prisma.sportEvent.findUnique({
    where: { apiFootballFixtureId: fixture.fixture.id },
    select: {
      id: true,
      apiFootballFixtureId: true,
      status: true,
      homeScore: true,
      awayScore: true,
    },
  });

  if (existingByFixtureId) {
    return { event: existingByFixtureId, matchedByFixtureId: true };
  }

  const fixtureDate = new Date(fixture.fixture.date);
  const windowStart = new Date(fixtureDate.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(fixtureDate.getTime() + 30 * 60 * 1000);
  const homeNorm = normaliseName(fixture.teams.home.name);
  const awayNorm = normaliseName(fixture.teams.away.name);

  const matchedByHeuristic = await prisma.sportEvent.findFirst({
    where: {
      sport: PrismaSport.FOOTBALL,
      homeTeam: { equals: homeNorm, mode: 'insensitive' },
      awayTeam: { equals: awayNorm, mode: 'insensitive' },
      eventDate: { gte: windowStart, lte: windowEnd },
      status: {
        notIn: [EventStatus.CANCELLED, EventStatus.POSTPONED],
      },
    },
    select: {
      id: true,
      apiFootballFixtureId: true,
      status: true,
      homeScore: true,
      awayScore: true,
    },
  });

  if (matchedByHeuristic) {
    return { event: matchedByHeuristic, matchedByFixtureId: false };
  }

  // ── Second pass: JS-side fuzzy match ─────────────────────────────────────
  // API-Football uses full official names ("Club Atlético Boca Juniors") while
  // scrapers store abbreviated names ("Boca Juniors"). Strip noise tokens and
  // compare with a substring containment check.
  const homeStripped = normaliseNameFuzzy(fixture.teams.home.name);
  const awayStripped = normaliseNameFuzzy(fixture.teams.away.name);

  if (!homeStripped || !awayStripped) return null;

  const candidates = await prisma.sportEvent.findMany({
    where: {
      sport: PrismaSport.FOOTBALL,
      eventDate: { gte: windowStart, lte: windowEnd },
      status: { notIn: [EventStatus.CANCELLED, EventStatus.POSTPONED] },
    },
    select: {
      id: true,
      homeTeam: true,
      awayTeam: true,
      apiFootballFixtureId: true,
      status: true,
      homeScore: true,
      awayScore: true,
    },
  });

  for (const candidate of candidates) {
    const dbHome = normaliseNameFuzzy(candidate.homeTeam);
    const dbAway = normaliseNameFuzzy(candidate.awayTeam);
    if (
      dbHome.length > 1 && dbAway.length > 1 &&
      (homeStripped.includes(dbHome) || dbHome.includes(homeStripped)) &&
      (awayStripped.includes(dbAway) || dbAway.includes(awayStripped))
    ) {
      logger.debug('Team name fuzzy match (API-Football → DB)', {
        apiHome: fixture.teams.home.name,
        dbHome: candidate.homeTeam,
        apiAway: fixture.teams.away.name,
        dbAway: candidate.awayTeam,
      });
      return { event: candidate, matchedByFixtureId: false };
    }
  }

  return null;
}

// ─── Core polling logic ───────────────────────────────────────────────────────

/**
 * Fetches fixtures from API-Football and upserts match status + scores into DB.
 * Emits Socket.io `event:statusChange` for every row that actually changed.
 *
 * Strategy:
 * 1. Fetch all LIVE fixtures from API-Football (GET /fixtures?live=all).
 * 2. Fetch fixtures for today + tomorrow (covers upcoming + recently-started).
 * 3. For each fixture, match by `apiFootballFixtureId` first; fall back to one
 *    bootstrap heuristic (team names + kick-off ±30 min) and persist the
 *    fixture ID so future syncs are exact.
 * 4. If status or score changed → update DB, invalidate cache, emit socket event.
 */
export async function syncEventStatuses(): Promise<{ updated: number; errors: number }> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;
  const pendingBroadcasts: Array<{
    eventId: string;
    status: SharedEventStatus;
    homeScore: number | null;
    awayScore: number | null;
  }> = [];

  try {
    // Fetch all currently-live fixtures
    const liveData = await apiGet('/fixtures?live=all', apiKey) as ApiFootballResponse;
    const fixtures: ApiFootballFixture[] = liveData.response ?? [];

    // Also fetch today + tomorrow to catch upcoming→live transitions we may
    // have missed, and to confirm finished matches in the live window
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const [todayData, tomorrowData] = await Promise.all([
      apiGet(`/fixtures?date=${today}&timezone=UTC`, apiKey) as Promise<ApiFootballResponse>,
      apiGet(`/fixtures?date=${tomorrow}&timezone=UTC`, apiKey) as Promise<ApiFootballResponse>,
    ]);

    const allFixtures = [
      ...fixtures,
      ...(todayData.response ?? []),
      ...(tomorrowData.response ?? []),
    ];

    // Deduplicate by fixture ID
    const seen = new Set<number>();
    const deduped = allFixtures.filter((f) => {
      if (seen.has(f.fixture.id)) return false;
      seen.add(f.fixture.id);
      return true;
    });

    for (const fixture of deduped) {
      const newStatus = mapApiStatus(fixture.fixture.status.short);
      if (newStatus === null) continue;

      const matchResult = await findEventForFixture(fixture);
      if (!matchResult) continue;

      const dbEvent = matchResult.event;

      const homeScore = fixture.goals.home;
      const awayScore = fixture.goals.away;

      const statusChanged = dbEvent.status !== newStatus;
      const homeScoreChanged = homeScore !== null && homeScore !== dbEvent.homeScore;
      const awayScoreChanged = awayScore !== null && awayScore !== dbEvent.awayScore;
      const fixtureIdChanged = dbEvent.apiFootballFixtureId !== fixture.fixture.id;

      if (!statusChanged && !homeScoreChanged && !awayScoreChanged && !fixtureIdChanged) continue;

      try {
        await prisma.sportEvent.update({
          where: { id: dbEvent.id },
          data: {
            apiFootballFixtureId: fixture.fixture.id,
            status: newStatus,
            ...(homeScore !== null ? { homeScore } : {}),
            ...(awayScore !== null ? { awayScore } : {}),
          },
        });

        updated++;

        pendingBroadcasts.push({
          eventId: dbEvent.id,
          status: newStatus as unknown as SharedEventStatus,
          homeScore: homeScore ?? dbEvent.homeScore,
          awayScore: awayScore ?? dbEvent.awayScore,
        });

        logger.debug('Event status synced from API-Football', {
          eventId: dbEvent.id,
          fixtureId: fixture.fixture.id,
          apiStatus: fixture.fixture.status.short,
          matchedByFixtureId: matchResult.matchedByFixtureId,
          newStatus,
          homeScore,
          awayScore,
        });
      } catch (err) {
        errors++;
        logger.warn('Failed to update event status from API-Football', {
          eventId: dbEvent.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors++;
    logger.error('API-Football status sync failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (pendingBroadcasts.length > 0) {
    await invalidateOddsCache();
    for (const payload of pendingBroadcasts) {
      emitEventStatusChange(payload);
    }
  }

  if (updated > 0) {
    logger.info('Event status sync complete', { updated, errors });
  }

  return { updated, errors };
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

let _pollInterval: NodeJS.Timeout | null = null;
let _safetyNetInterval: NodeJS.Timeout | null = null;

/**
 * Runs the time-based LIVE/FINISHED safety-net cleanup every 60 seconds,
 * independently of the API-Football polling loop and Bull jobs.
 * This ensures stuck-LIVE events are cleaned up even when Bull stalls.
 */
function startSafetyNetInterval(): void {
  if (_safetyNetInterval) return;

  _safetyNetInterval = setInterval(() => {
    updateEventStatuses().catch((err: unknown) =>
      logger.error('Safety-net status cleanup failed', { error: err }),
    );
  }, 60_000);
}

function stopSafetyNetInterval(): void {
  if (_safetyNetInterval) {
    clearInterval(_safetyNetInterval);
    _safetyNetInterval = null;
  }
}

/**
 * Starts the 30-second polling loop.
 * Call once at app startup after the Socket.io server is initialised.
 * If API_FOOTBALL_KEY is not set, logs a warning and returns — no polling.
 * The time-based safety-net cleanup runs independently regardless.
 */
export function startEventStatusPolling(): void {
  // Always start the time-based safety-net cleanup (LIVE→FINISHED, UPCOMING→LIVE)
  // so it runs even when API_FOOTBALL_KEY isn't set or Bull jobs are stalled.
  startSafetyNetInterval();

  if (!process.env.API_FOOTBALL_KEY) {
    logger.warn(
      'API_FOOTBALL_KEY is not set — real-time match status polling is disabled. ' +
      'Status transitions will fall back to the time-based safety net in updateEventStatuses(). ' +
      'Set API_FOOTBALL_KEY in .env to enable authoritative status tracking.',
    );
    return;
  }

  if (_pollInterval) return; // already running

  // Run immediately on start to warm up
  syncEventStatuses().catch((err: unknown) =>
    logger.error('Initial event status sync failed', { error: err }),
  );

  _pollInterval = setInterval(() => {
    syncEventStatuses().catch((err: unknown) =>
      logger.error('Event status sync failed', { error: err }),
    );
  }, 30_000); // 30 seconds

  logger.info('Event status polling started (30s interval, API-Football)');
}

/**
 * Stops the polling loop. Called during graceful shutdown.
 */
export function stopEventStatusPolling(): void {
  stopSafetyNetInterval();

  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
    logger.info('Event status polling stopped');
  }
}
