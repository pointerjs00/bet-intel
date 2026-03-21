import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  getPersonalStatsHandler,
  getStatsByMarketHandler,
  getStatsByOddsRangeHandler,
  getStatsBySiteHandler,
  getStatsBySportHandler,
  getStatsSummaryHandler,
  getStatsTimelineHandler,
} from '../controllers/statsController';

const statsRouter: Router = Router();

statsRouter.use(authenticate, defaultLimiter);

statsRouter.get('/me', getPersonalStatsHandler);
statsRouter.get('/me/summary', getStatsSummaryHandler);
statsRouter.get('/me/by-sport', getStatsBySportHandler);
statsRouter.get('/me/by-site', getStatsBySiteHandler);
statsRouter.get('/me/by-market', getStatsByMarketHandler);
statsRouter.get('/me/by-odds-range', getStatsByOddsRangeHandler);
statsRouter.get('/me/timeline', getStatsTimelineHandler);

export { statsRouter };