import { Router } from 'express';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  listCompetitionsHandler,
  listMarketsHandler,
  listTeamsHandler,
  refreshATPRankingsHandler,
  refreshWTARankingsHandler,
} from '../controllers/referenceController';

const referenceRouter: Router = Router();

referenceRouter.use(defaultLimiter);

referenceRouter.get('/competitions', listCompetitionsHandler);
referenceRouter.get('/teams', listTeamsHandler);
referenceRouter.get('/markets', listMarketsHandler);
referenceRouter.post('/atp-rankings/refresh', refreshATPRankingsHandler);
referenceRouter.post('/wta-rankings/refresh', refreshWTARankingsHandler);

export { referenceRouter };
