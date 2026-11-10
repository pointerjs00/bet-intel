import { Router } from 'express';
import { requireInternalKey } from '../middleware/requireInternalKey';
import {
  listCompetitionsHandler,
  listMarketsHandler,
  listTeamsHandler,
  refreshATPRankingsHandler,
  refreshWTARankingsHandler,
} from '../controllers/referenceController';

const referenceRouter: Router = Router();

referenceRouter.get('/competitions', listCompetitionsHandler);
referenceRouter.get('/teams', listTeamsHandler);
referenceRouter.get('/markets', listMarketsHandler);
// Admin-only: these start Puppeteer / external scraping jobs.
referenceRouter.post('/atp-rankings/refresh', requireInternalKey, refreshATPRankingsHandler);
referenceRouter.post('/wta-rankings/refresh', requireInternalKey, refreshWTARankingsHandler);

export { referenceRouter };
