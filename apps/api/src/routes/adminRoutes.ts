import { Router, Request, Response } from 'express';
import { requireInternalKey } from '../middleware/requireInternalKey';
import { runHistoricalBackfill } from '../services/apifootball/historicalBackfill';
import { recomputeTeamStats } from '../services/fixtureService';
import { prisma } from '../prisma';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { fixtureStatsSyncJob } from '../jobs/fixtureStatsSyncJob';
import { fixtureEventsSyncJob } from '../jobs/fixtureEventsSyncJob';
import { fixtureLineupsSyncJob } from '../jobs/fixtureLineupsSyncJob';
import { predictionsSyncJob } from '../jobs/predictionsSyncJob';
import { playerStatsSyncJob } from '../jobs/playerStatsSyncJob';
import { venueSyncJob } from '../jobs/venueSyncJob';
import { coachSyncJob } from '../jobs/coachSyncJob';

export const adminRouter = Router();

adminRouter.use(requireInternalKey);

// POST /api/admin/backfill-fixtures
// Triggers a full historical fixture import for all leagues × seasons.
// Fire-and-forget — returns immediately while the job runs in background.
// Protected by x-internal-key header.
adminRouter.post('/backfill-fixtures', (_req: Request, res: Response) => {
  runHistoricalBackfill().catch((err: Error) => {
    logger.error('[admin] Historical backfill failed', { error: err.message });
  });

  res.json({
    success: true,
    message: 'Historical backfill started in background — monitor server logs for progress',
  });
});

// POST /api/admin/cleanup-csv-fixtures
// Deletes CSV-sourced Fixture records for leagues/seasons now covered by the
// API-Football backfill (identified by apiFootballId IS NULL AND homeTeamApiId IS NULL),
// then wipes the corresponding TeamStat rows and rebuilds them from clean data.
// Run once after the historical backfill to eliminate duplicate teams in standings.
adminRouter.post('/cleanup-csv-fixtures', async (_req: Request, res: Response) => {
  try {
    const competitionNames = LEAGUE_MANIFEST.map(l => l.name);
    // Seasons covered by the backfill (API season 2022-2025 → canonical names)
    const coveredSeasons = ['2022-23', '2023-24', '2024-25', '2025-26'];

    // CSV records have neither apiFootballId nor homeTeamApiId set
    const deletedFixtures = await prisma.fixture.deleteMany({
      where: {
        apiFootballId: null,
        homeTeamApiId: null,
        competition: { in: competitionNames },
        season: { in: coveredSeasons },
      },
    });
    logger.info(`[admin] Deleted ${deletedFixtures.count} CSV-sourced fixture records`);

    // Wipe TeamStat for covered leagues/seasons so recompute starts from a clean slate
    const deletedStats = await prisma.teamStat.deleteMany({
      where: {
        competition: { in: competitionNames },
        season: { in: coveredSeasons },
      },
    });
    logger.info(`[admin] Deleted ${deletedStats.count} stale TeamStat rows`);

    // Rebuild TeamStat from the now-clean Fixture table
    const { teams, competitions } = await recomputeTeamStats();
    logger.info(`[admin] Rebuilt TeamStat: ${teams} teams across ${competitions} competitions`);

    // Flush fixture cache so upcoming/recent also reflect clean data
    const cacheKeys = await redis.keys('fixtures:*');
    if (cacheKeys.length > 0) await redis.del(...cacheKeys);

    res.json({
      success: true,
      deletedFixtures: deletedFixtures.count,
      deletedTeamStats: deletedStats.count,
      rebuiltTeams: teams,
      rebuiltCompetitions: competitions,
    });
  } catch (err: any) {
    logger.error('[admin] CSV fixture cleanup failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/team-names
// Returns all distinct teamName values from TeamStat, grouped by competition.
// Use this to build FIXTURE_TEAM_ALIASES in the mobile app.
adminRouter.get('/team-names', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.teamStat.findMany({
      select: { teamName: true, team: true, competition: true },
      orderBy: [{ competition: 'asc' }, { teamName: 'asc' }],
    });

    const grouped: Record<string, string[]> = {};
    for (const r of rows) {
      const display = r.teamName ?? r.team;
      if (!grouped[r.competition]) grouped[r.competition] = [];
      if (!grouped[r.competition].includes(display)) {
        grouped[r.competition].push(display);
      }
    }

    res.json({ success: true, data: grouped });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/jobs/run/:jobName
// Manually triggers any insight sync job. Returns immediately; job runs in background.
const INSIGHT_JOBS: Record<string, () => Promise<void>> = {
  'fixture-stats':   fixtureStatsSyncJob,
  'fixture-events':  fixtureEventsSyncJob,
  'fixture-lineups': fixtureLineupsSyncJob,
  'predictions':     predictionsSyncJob,
  'player-stats':    playerStatsSyncJob,
  'venues':          venueSyncJob,
  'coaches':         coachSyncJob,
};

adminRouter.post('/jobs/run/:jobName', (req: Request, res: Response) => {
  const { jobName } = req.params;
  const fn = INSIGHT_JOBS[jobName];
  if (!fn) {
    res.status(404).json({ success: false, error: `Unknown job: ${jobName}. Available: ${Object.keys(INSIGHT_JOBS).join(', ')}` });
    return;
  }
  fn().catch((err: Error) => logger.error(`[admin] Job ${jobName} failed`, { error: err.message }));
  res.json({ success: true, message: `Job '${jobName}' started in background — check server logs` });
});

// DELETE /api/admin/fixtures-cache
// Flushes all Redis fixture cache keys so the next request re-runs dedup logic.
adminRouter.delete('/fixtures-cache', async (_req: Request, res: Response) => {
  try {
    const keys = await redis.keys('fixtures:*');
    if (keys.length > 0) await redis.del(...keys);
    logger.info(`[admin] Flushed ${keys.length} fixture cache keys`);
    res.json({ success: true, flushed: keys.length });
  } catch (err: any) {
    logger.error('[admin] Cache flush failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});
