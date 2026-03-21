import { Router } from 'express';
import {
  getOddsFeedHandler,
  getEventHandler,
  getLiveEventsHandler,
  getSitesHandler,
  getSportsHandler,
  getLeaguesHandler,
} from '../controllers/oddsController';
import { defaultLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

// All odds routes are public (no authentication required) — rate limited by the global defaultLimiter
// which is already applied at the app level, but we add it here explicitly for clarity and
// to allow easy per-route tightening later.

/** GET /api/odds — paginated feed with full filter support */
router.get('/', defaultLimiter, getOddsFeedHandler);

/** GET /api/odds/live — live events */
router.get('/live', defaultLimiter, getLiveEventsHandler);

/** GET /api/odds/sites — active betting sites */
router.get('/sites', defaultLimiter, getSitesHandler);

/** GET /api/odds/sports — available sports */
router.get('/sports', defaultLimiter, getSportsHandler);

/** GET /api/odds/leagues — leagues (?sport=FOOTBALL optional) */
router.get('/leagues', defaultLimiter, getLeaguesHandler);

/** GET /api/odds/events/:eventId — single event with cross-site odds */
router.get('/events/:eventId', defaultLimiter, getEventHandler);

export { router as oddsRouter };
