import { Router } from 'express';
import {
  getOddsFeedHandler,
  getEventHandler,
  getLiveEventsHandler,
  getSitesHandler,
  getSportsHandler,
  getLeaguesHandler,
} from '../controllers/oddsController';

const router: Router = Router();

// All odds routes are public (no authentication required).
// Rate limiting is applied globally in index.ts via app.use(defaultLimiter).

/** GET /api/odds — paginated feed with full filter support */
router.get('/', getOddsFeedHandler);

/** GET /api/odds/live — live events */
router.get('/live', getLiveEventsHandler);

/** GET /api/odds/sites — active betting sites */
router.get('/sites', getSitesHandler);

/** GET /api/odds/sports — available sports */
router.get('/sports', getSportsHandler);

/** GET /api/odds/leagues — leagues (?sport=FOOTBALL optional) */
router.get('/leagues', getLeaguesHandler);

/** GET /api/odds/events/:eventId — single event with cross-site odds */
router.get('/events/:eventId', getEventHandler);

export { router as oddsRouter };
