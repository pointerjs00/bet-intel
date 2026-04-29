import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  getPersonalStatsHandler,
  getRecentFormHandler,
  getStatsByCompetitionHandler,
  getStatsByMarketHandler,
  getStatsByOddsRangeHandler,
  getStatsBySportHandler,
  getStatsByTeamHandler,
  getStatsSummaryHandler,
  getStatsTimelineHandler,
  getAiReviewHandler,
  getAiReviewPromptHandler,
} from '../controllers/statsController';

const statsRouter: Router = Router();

statsRouter.use(authenticate, defaultLimiter);

statsRouter.get('/me', getPersonalStatsHandler);
statsRouter.get('/me/summary', getStatsSummaryHandler);
statsRouter.get('/me/by-sport', getStatsBySportHandler);
statsRouter.get('/me/by-team', getStatsByTeamHandler);
statsRouter.get('/me/by-competition', getStatsByCompetitionHandler);
statsRouter.get('/me/by-market', getStatsByMarketHandler);
statsRouter.get('/me/by-odds-range', getStatsByOddsRangeHandler);
statsRouter.get('/me/timeline', getStatsTimelineHandler);
statsRouter.get('/me/ai-review', getAiReviewHandler);
statsRouter.get('/me/ai-review/prompt', getAiReviewPromptHandler);
statsRouter.get('/me/recent-form', getRecentFormHandler);

export { statsRouter };