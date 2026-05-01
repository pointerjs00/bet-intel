/**
 * Fixture ingestion service.
 *
 * Fetches fixture schedules from openfootball JSON feeds and upserts them into
 * the Fixture table. Used by the weekly refresh job and on first startup.
 *
 * Data source: https://github.com/openfootball/football.json
 * Timezone:    All kickoff times are interpreted as Europe/Lisbon local time.
 */

import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

const OPENFOOTBALL_BASE = 'https://raw.githubusercontent.com/openfootball/football.json/master/';
const FIXTURES_LAST_UPDATED_KEY = 'fixtures:last-updated-at';
const PRIMARY_SEASON = '2025-26';
const FALLBACK_SEASON = '2024-25';

// ─── League manifest ──────────────────────────────────────────────────────────

interface LeagueEntry {
  key: string;
  competition: string;
  country: string;
}

const LEAGUE_MANIFEST: LeagueEntry[] = [
  { key: 'pt.1', competition: 'Liga Portugal Betclic', country: 'Portugal' },
  { key: 'pt.2', competition: 'Liga Portugal 2',       country: 'Portugal' },
  { key: 'en.1', competition: 'Premier League',        country: 'England' },
  { key: 'en.2', competition: 'Championship',          country: 'England' },
  { key: 'es.1', competition: 'La Liga',               country: 'Spain' },
  { key: 'es.2', competition: 'La Liga 2',             country: 'Spain' },
  { key: 'de.1', competition: 'Bundesliga',            country: 'Germany' },
  { key: 'de.2', competition: '2. Bundesliga',         country: 'Germany' },
  { key: 'it.1', competition: 'Serie A',               country: 'Italy' },
  { key: 'it.2', competition: 'Serie B',               country: 'Italy' },
  { key: 'fr.1', competition: 'Ligue 1',               country: 'France' },
  { key: 'fr.2', competition: 'Ligue 2',               country: 'France' },
  { key: 'nl.1', competition: 'Eredivisie',            country: 'Netherlands' },
  { key: 'be.1', competition: 'Pro League',            country: 'Belgium' },
  { key: 'tr.1', competition: 'Süper Lig',             country: 'Turkey' },
  { key: 'cl',   competition: 'UEFA Champions League', country: 'Europe' },
  { key: 'el',   competition: 'UEFA Europa League',    country: 'Europe' },
];

// ─── openfootball JSON types ──────────────────────────────────────────────────

interface OpenFootballMatch {
  round?: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  score?: { ft?: [number, number] };
}

interface OpenFootballLeague {
  name?: string;
  matches: OpenFootballMatch[];
}

// ─── Timezone helper ──────────────────────────────────────────────────────────

/**
 * Converts a date + time string expressed in Europe/Lisbon local time to a UTC Date.
 * Lisbon is UTC+0 (winter/WET) or UTC+1 (summer/WEST). We try both offsets and
 * pick the one whose round-trip through Intl matches the intended local time.
 */
function parseAsLisbonLocal(date: string, time?: string): Date {
  const timeStr = time ?? '00:00';
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false,
  });

  // Lisbon is between UTC+0 and UTC+1 — try both
  for (const offsetHours of [1, 0]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0));
    const parts = fmt.formatToParts(candidate);
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0');
    if (get('hour') % 24 === hour && get('minute') === minute && get('day') === day) {
      return candidate;
    }
  }

  // Fallback: treat as UTC+0 (winter)
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchLeague(season: string, key: string): Promise<OpenFootballLeague | null> {
  const url = `${OPENFOOTBALL_BASE}${season}/${key}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json() as OpenFootballLeague;
  } catch {
    return null;
  }
}

// ─── Main ingestion ───────────────────────────────────────────────────────────

export interface IngestResult {
  upserted: number;
  leagues: number;
  fallbacks: number;
}

export async function ingestFixtures(): Promise<IngestResult> {
  let totalUpserted = 0;
  let leaguesFetched = 0;
  let fallbackCount = 0;

  for (const league of LEAGUE_MANIFEST) {
    let data = await fetchLeague(PRIMARY_SEASON, league.key);
    let season = PRIMARY_SEASON;

    if (!data) {
      logger.warn(`[fixtureService] ${PRIMARY_SEASON}/${league.key} not found — trying ${FALLBACK_SEASON}`);
      data = await fetchLeague(FALLBACK_SEASON, league.key);
      season = FALLBACK_SEASON;
      fallbackCount++;
    }

    if (!data) {
      logger.warn(`[fixtureService] ${league.key} unavailable for both seasons — skipping`);
      continue;
    }

    leaguesFetched++;
    let upserted = 0;

    for (const match of data.matches ?? []) {
      try {
        const kickoffAt = parseAsLisbonLocal(match.date, match.time);
        const hasScore = match.score?.ft != null;
        const homeScore = hasScore ? (match.score!.ft![0] ?? null) : null;
        const awayScore = hasScore ? (match.score!.ft![1] ?? null) : null;
        const status = hasScore ? 'FINISHED' : 'SCHEDULED';
        const round = match.round ?? '';

        await prisma.fixture.upsert({
          where: {
            fixture_unique: {
              homeTeam: match.team1,
              awayTeam: match.team2,
              season,
              round,
            },
          },
          update: { kickoffAt, homeScore, awayScore, status },
          create: {
            homeTeam: match.team1,
            awayTeam: match.team2,
            competition: league.competition,
            country: league.country,
            sport: 'FOOTBALL',
            kickoffAt,
            season,
            round,
            homeScore,
            awayScore,
            status,
          },
        });
        upserted++;
      } catch (err) {
        logger.warn(`[fixtureService] Failed to upsert ${match.team1} vs ${match.team2} (${match.round ?? '?'})`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    totalUpserted += upserted;
    logger.info(`[fixtureService] ${league.competition} (${season}): ${upserted} fixtures upserted`);
  }

  // Invalidate /fixtures/upcoming cache
  try {
    const keys = await redis.keys('fixtures:upcoming:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`[fixtureService] Invalidated ${keys.length} fixture cache keys`);
    }
  } catch {
    // Non-critical
  }

  await redis.set(FIXTURES_LAST_UPDATED_KEY, new Date().toISOString()).catch(() => {});

  logger.info(`[fixtureRefresh] ${leaguesFetched} leagues fetched, ${totalUpserted} fixtures upserted (${fallbackCount} fallbacks to ${FALLBACK_SEASON})`);
  return { upserted: totalUpserted, leagues: leaguesFetched, fallbacks: fallbackCount };
}

/**
 * Ingests fixtures only when the stored data is older than maxAgeHours.
 * Safe to call on every startup.
 */
export async function ensureFixturesFresh(maxAgeHours = 24 * 7): Promise<void> {
  try {
    const lastUpdated = await redis.get(FIXTURES_LAST_UPDATED_KEY);
    if (lastUpdated) {
      const ageMs = Date.now() - Date.parse(lastUpdated);
      if (Number.isFinite(ageMs) && ageMs < maxAgeHours * 60 * 60 * 1000) {
        logger.info('[fixtureService] Fixture data is fresh — skipping ingestion', { lastUpdated });
        return;
      }
    }
    await ingestFixtures();
  } catch (err) {
    logger.warn('[fixtureService] ensureFixturesFresh failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
