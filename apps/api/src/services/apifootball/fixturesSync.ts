// apps/api/src/services/apifootball/fixturesSync.ts
//
// Fetches upcoming and recent fixtures from API-Football and upserts them
// into the Fixture table. After each sync, recomputes TeamStat rows so that
// league tables stay up to date.

import { prisma } from '../../prisma';
import { apiFootball } from '../apiFootballClient';
import { LEAGUE_MANIFEST } from '../../config/leagueManifest';
import { normaliseTeamName } from '../../utils/nameNormalisation';
import { canonicalToApiFootballSeason, getCurrentSeason } from '../../utils/seasonUtils';
import { logger } from '../../utils/logger';
import { runJob } from '../../utils/runJob';
// Bridge: recompute standings from finished fixtures until standingsSync.ts is built
import { recomputeTeamStats } from '../fixtureService';

const LIVE_STATUSES     = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO', 'CANC']);

function mapStatus(short: string): 'SCHEDULED' | 'LIVE' | 'FINISHED' {
  if (LIVE_STATUSES.has(short))     return 'LIVE';
  if (FINISHED_STATUSES.has(short)) return 'FINISHED';
  return 'SCHEDULED';
}

async function upsertFixture(f: any, leagueName: string, season: string): Promise<boolean> {
  const homeTeam  = f.teams.home.name as string;
  const awayTeam  = f.teams.away.name as string;
  const kickoffAt = new Date(f.fixture.date);
  const status    = mapStatus(f.fixture.status?.short ?? 'NS');
  const round     = (f.league?.round as string | null) ?? null;
  const apiId     = f.fixture.id as number;

  const shared = {
    homeTeamNormKey:  normaliseTeamName(homeTeam),
    awayTeamNormKey:  normaliseTeamName(awayTeam),
    homeTeamApiId:    f.teams.home.id as number,
    awayTeamApiId:    f.teams.away.id as number,
    kickoffAt,
    round,
    status,
    homeScore:        (f.goals?.home   as number | null) ?? null,
    awayScore:        (f.goals?.away   as number | null) ?? null,
    htHomeScore:      (f.score?.halftime?.home as number | null) ?? null,
    htAwayScore:      (f.score?.halftime?.away as number | null) ?? null,
    venueName:        (f.fixture.venue?.name   as string | null) ?? null,
    venueId:          (f.fixture.venue?.id     as number | null) ?? null,
    refereeName:      (f.fixture.referee       as string | null) ?? null,
    elapsedMinutes:   (f.fixture.status?.elapsed as number | null) ?? null,
  };

  try {
    // Fast path: fixture already known by apiFootballId
    await prisma.fixture.upsert({
      where:  { apiFootballId: apiId },
      update: shared,
      create: {
        apiFootballId: apiId,
        homeTeam,
        awayTeam,
        competition: leagueName,
        country:     f.league?.country ?? '',
        sport:       'FOOTBALL',
        season,
        ...shared,
      },
    });
    return true;
  } catch {
    // Slow path: a record without apiFootballId exists for the same match — link it
    const kickoffDate = kickoffAt.toISOString().split('T')[0];
    const existing = await prisma.fixture.findFirst({
      where: {
        homeTeamNormKey: normaliseTeamName(homeTeam),
        awayTeamNormKey: normaliseTeamName(awayTeam),
        kickoffAt: {
          gte: new Date(`${kickoffDate}T00:00:00Z`),
          lte: new Date(`${kickoffDate}T23:59:59Z`),
        },
        apiFootballId: null,
      },
    });

    if (existing) {
      await prisma.fixture.update({
        where: { id: existing.id },
        data:  { apiFootballId: apiId, ...shared },
      });
      return true;
    }

    try {
      await prisma.fixture.create({
        data: {
          apiFootballId: apiId,
          homeTeam,
          awayTeam,
          competition: leagueName,
          country:     f.league?.country ?? '',
          sport:       'FOOTBALL',
          season,
          ...shared,
        },
      });
      return true;
    } catch (innerErr: any) {
      logger.warn(`[fixturesSync] Skipping fixture ${apiId} (${homeTeam} v ${awayTeam}): ${innerErr.message}`);
      return false;
    }
  }
}

async function syncLeague(
  leagueId: number,
  leagueName: string,
  apiSeason: number,
  season: string,
): Promise<{ upserted: number; calls: number }> {
  const [upcomingResp, recentResp] = await Promise.all([
    apiFootball.get<any>('/fixtures', { league: leagueId, season: apiSeason, next: 14 }),
    apiFootball.get<any>('/fixtures', { league: leagueId, season: apiSeason, last: 3  }),
  ]);

  const all: any[] = [
    ...(upcomingResp?.response ?? []),
    ...(recentResp?.response  ?? []),
  ];

  // Deduplicate by fixture ID
  const seen = new Set<number>();
  const unique = all.filter((f) => {
    if (seen.has(f.fixture.id)) return false;
    seen.add(f.fixture.id);
    return true;
  });

  let upserted = 0;
  for (const f of unique) {
    const ok = await upsertFixture(f, leagueName, season);
    if (ok) upserted++;
  }

  return { upserted, calls: 2 };
}

export async function fixturesSyncJob(): Promise<void> {
  await runJob('fixturesSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let totalUpserted = 0;
    let totalCalls    = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        const { upserted, calls } = await syncLeague(
          league.apiFootballId,
          league.name,
          apiSeason,
          season,
        );
        totalUpserted += upserted;
        totalCalls    += calls;
        logger.info(`[fixturesSync] ${league.name}: ${upserted} fixtures synced`);
        await new Promise((r) => setTimeout(r, 250));
      } catch (err: any) {
        logger.warn(`[fixturesSync] Skipping ${league.name}: ${err.message}`);
      }
    }

    // ── Recompute TeamStat standings from finished fixtures ──────────────────
    // This keeps league tables populated until the dedicated API-Football
    // standings sync (standingsSync.ts) is built and running.
    try {
      logger.info('[fixturesSync] Recomputing team stats from finished fixtures…');
      const { teams, competitions } = await recomputeTeamStats();
      logger.info(`[fixturesSync] TeamStat recompute done: ${teams} teams, ${competitions} competitions`);
    } catch (err: any) {
      logger.warn(`[fixturesSync] TeamStat recompute failed (non-fatal): ${err.message}`);
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: totalUpserted, apiCallsMade: totalCalls, apiCallsRemaining: remaining };
  });
}

// Startup helper
export async function ensureFixturesFresh(): Promise<void> {
  const count = await prisma.fixture.count({ where: { status: 'SCHEDULED' } });
  if (count > 0) {
    logger.info(`[fixturesSync] ${count} scheduled fixtures already in DB — skipping startup sync`);
    return;
  }
  logger.info('[fixturesSync] No scheduled fixtures found — running startup sync');
  await fixturesSyncJob();
}