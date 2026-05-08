import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
  testPushHandler,
  getFixtureNotifPrefsHandler,
  updateFixtureNotifPrefsHandler,
} from '../controllers/notificationsController';

const notificationsRouter: Router = Router();

notificationsRouter.use(authenticate, defaultLimiter);

notificationsRouter.get('/', listNotificationsHandler);
notificationsRouter.post('/test-push', testPushHandler);
notificationsRouter.patch('/read-all', markAllNotificationsReadHandler);
notificationsRouter.patch('/:id/read', markNotificationReadHandler);
notificationsRouter.get('/fixture-prefs', getFixtureNotifPrefsHandler);
notificationsRouter.put('/fixture-prefs', updateFixtureNotifPrefsHandler);

export { notificationsRouter };