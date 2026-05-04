// apps/api/src/routes/footballDataRoutes.ts

import { Router, Request, Response } from 'express';
import { insightController }        from '../controllers/insightController';
import { matchStatsController }     from '../controllers/matchStatsController';
import { standingsDataController }  from '../controllers/standingsDataController';
import { injuriesController }       from '../controllers/injuriesController';
import { topScorersController }     from '../controllers/topScorersController';
import { triggerFixtureRefresh }    from '../jobs/fixtureRefreshJob';
import { standingsSyncJob }         from '../jobs/standingsSyncJob';
import { injuriesSyncJob }          from '../jobs/injuriesSyncJob';
import { topScorersSyncJob }        from '../jobs/topScorersSyncJob';
import { logger }                   from '../utils/logger';

export const footballDataRouter = Router();

// ─── Read endpoints ───────────────────────────────────────────────────────────

footballDataRouter.get('/fixtures/:fixtureId/insight', insightController.getInsight);
footballDataRouter.get('/fixtures/:fixtureId/stats',   matchStatsController.getMatchStats);
footballDataRouter.get('/standings/:leagueId',         standingsDataController.getStandings);
footballDataRouter.get('/teams/:teamSlug/injuries',    injuriesController.getTeamInjuries);
footballDataRouter.get('/leagues/:leagueId/topscorers', topScorersController.getTopScorers);

// ─── Admin sync triggers ──────────────────────────────────────────────────────

footballDataRouter.post('/sync/fixtures', async (_req: Request, res: Response) => {
  try {
    const job = await triggerFixtureRefresh();
    res.json({ ok: true, jobId: job.id, message: 'Fixture sync enqueued' });
  } catch (err: any) {
    logger.error('[sync/fixtures] trigger failed', { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

footballDataRouter.post('/sync/standings', async (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Standings sync started' });
  standingsSyncJob().catch((err: any) =>
    logger.error('[sync/standings] job failed', { error: err.message })
  );
});

footballDataRouter.post('/sync/injuries', async (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Injuries sync started' });
  injuriesSyncJob().catch((err: any) =>
    logger.error('[sync/injuries] job failed', { error: err.message })
  );
});

footballDataRouter.post('/sync/topscorers', async (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Top scorers sync started' });
  topScorersSyncJob().catch((err: any) =>
    logger.error('[sync/topscorers] job failed', { error: err.message })
  );
});
