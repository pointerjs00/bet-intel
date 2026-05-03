// apps/api/src/services/patchSecondaryLeagueFixturesService.ts
//
// Patches kickoff times for secondary leagues that football-data.co.uk
// doesn't provide times for. Uses API-Football (already integrated).
//
// Affected leagues: La Liga 2, Serie B, 2. Bundesliga, Süper Lig, Ligue 2, Pro League
// Run: once to backfill, then weekly via a scheduled job.

import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const API_FOOTBALL_KEY  = process.env.API_FOOTBALL_KEY ?? '';

// ─── Leagues to patch ─────────────────────────────────────────────────────────
// Only leagues that have midnight placeholder kickoff times in our DB.
// API-Football season = start year of the season (2025 for 2025-26).

const SECONDARY_LEAGUES: Array<{
  apiFootballId: number;
  name: string;           // must match Fixture.competition exactly
  country: string;
  season: number;         // API-Football season year
  dbSeason: string;       // Fixture.season value in our DB
}> = [
  { apiFootballId: 141, name: 'La Liga 2',  country: 'Spain',       season: 2025, dbSeason: '2025-26' },
  { apiFootballId: 135, name: 'Serie B',    country: 'Italy',       season: 2025, dbSeason: '2025-26' },
  { apiFootballId: 78,  name: '2. Bundesliga', country: 'Germany',  season: 2025, dbSeason: '2025-26' },
  { apiFootballId: 203, name: 'Süper Lig',  country: 'Turkey',      season: 2025, dbSeason: '2025-26' },
  { apiFootballId: 65,  name: 'Ligue 2',    country: 'France',      season: 2025, dbSeason: '2025-26' },
  { apiFootballId: 144, name: 'Pro League', country: 'Belgium',     season: 2025, dbSeason: '2025-26' },
];

// ─── API-Football types ───────────────────────────────────────────────────────

interface ApiFixture {
  fixture: {
    id: number;
    date: string;       // ISO 8601 with timezone, e.g. "2025-08-15T19:30:00+02:00"
    status: { short: string }; // NS, FT, LIVE, etc.
  };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

interface ApiResponse {
  response: ApiFixture[];
  errors: unknown;
}

// ─── Fetch from API-Football ──────────────────────────────────────────────────

async function fetchLeagueFixtures(
  leagueId: number,
  season: number,
): Promise<ApiFixture[]> {
  const url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY,
        'x-rapidapi-key': API_FOOTBALL_KEY,
      },
    });

    if (!res.ok) {
      logger.warn(`[patchFixtures] API-Football ${leagueId} returned ${res.status}`);
      return [];
    }

    const json = (await res.json()) as ApiResponse;

    if (json.errors && Object.keys(json.errors as object).length > 0) {
      logger.warn(`[patchFixtures] API-Football errors for league ${leagueId}`, json.errors);
      return [];
    }

    return json.response ?? [];
  } catch (err) {
    logger.error(`[patchFixtures] Fetch failed for league ${leagueId}`, err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Map API-Football status → our status ────────────────────────────────────

function mapStatus(short: string): string {
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(short)) return 'FINISHED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'LIVE';
  if (['CANC', 'ABD', 'TBD'].includes(short)) return 'SCHEDULED'; // keep as scheduled
  return 'SCHEDULED';
}

// ─── Patch one league ─────────────────────────────────────────────────────────

async function patchLeague(league: typeof SECONDARY_LEAGUES[number]): Promise<{
  fetched: number;
  matched: number;
  updated: number;
  skipped: number;
}> {
  const stats = { fetched: 0, matched: 0, updated: 0, skipped: 0 };

  const apiFixtures = await fetchLeagueFixtures(league.apiFootballId, league.season);
  stats.fetched = apiFixtures.length;

  if (apiFixtures.length === 0) return stats;

  // Load our DB fixtures for this league/season in one query
  const dbFixtures = await prisma.fixture.findMany({
    where: {
      competition: league.name,
      season: league.dbSeason,
    },
    select: {
      id: true,
      homeTeamNormKey: true,
      awayTeamNormKey: true,
      kickoffAt: true,
      homeScore: true,
      awayScore: true,
      status: true,
    },
  });

  // Index by normKey pair for O(1) lookup
  const dbIndex = new Map<string, typeof dbFixtures[number]>();
  for (const f of dbFixtures) {
    const key = `${f.homeTeamNormKey}||${f.awayTeamNormKey}`;
    dbIndex.set(key, f);
  }

  for (const apif of apiFixtures) {
    const homeNorm = normaliseTeamName(apif.teams.home.name);
    const awayNorm = normaliseTeamName(apif.teams.away.name);
    const key = `${homeNorm}||${awayNorm}`;

    const dbFixture = dbIndex.get(key);
    if (!dbFixture) {
      stats.skipped++;
      continue;
    }

    stats.matched++;

    const apiDate = new Date(apif.fixture.date);
    if (isNaN(apiDate.getTime())) {
      stats.skipped++;
      continue;
    }

    // Check if kickoff is a midnight placeholder (00:00 UTC)
    const currentKickoff = dbFixture.kickoffAt;
    const isPlaceholder =
      currentKickoff.getUTCHours() === 0 &&
      currentKickoff.getUTCMinutes() === 0;

    // Also update scores and status if the match is finished
    const apiStatus = mapStatus(apif.fixture.status.short);
    const hasNewScore =
      apif.goals.home !== null &&
      apif.goals.away !== null &&
      (dbFixture.homeScore !== apif.goals.home || dbFixture.awayScore !== apif.goals.away);

    // Skip if nothing to update
    if (!isPlaceholder && !hasNewScore && dbFixture.status === apiStatus) {
      stats.skipped++;
      continue;
    }

    await prisma.fixture.update({
      where: { id: dbFixture.id },
      data: {
        ...(isPlaceholder ? { kickoffAt: apiDate } : {}),
        ...(hasNewScore
          ? { homeScore: apif.goals.home, awayScore: apif.goals.away }
          : {}),
        ...(dbFixture.status !== apiStatus ? { status: apiStatus } : {}),
      },
    });

    stats.updated++;
  }

  return stats;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runPatchSecondaryLeagueFixtures(): Promise<void> {
  if (!API_FOOTBALL_KEY) {
    logger.error('[patchFixtures] API_FOOTBALL_KEY is not set — aborting');
    return;
  }

  logger.info('[patchFixtures] Starting secondary league fixture patch');

  let totalUpdated = 0;

  for (const league of SECONDARY_LEAGUES) {
    logger.info(`[patchFixtures] Processing ${league.name} (${league.country})`);

    const stats = await patchLeague(league);

    logger.info(
      `[patchFixtures] ${league.name}: fetched=${stats.fetched} matched=${stats.matched} updated=${stats.updated} skipped=${stats.skipped}`,
    );

    totalUpdated += stats.updated;

    // Be polite to the API — 1 request per league, but add a small delay
    await new Promise((r) => setTimeout(r, 1_500));
  }

  logger.info(`[patchFixtures] Done — ${totalUpdated} fixtures updated across ${SECONDARY_LEAGUES.length} leagues`);
}