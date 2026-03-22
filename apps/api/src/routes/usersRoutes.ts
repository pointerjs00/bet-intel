import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  checkUsernameAvailabilityHandler,
  getMeHandler,
  getPublicProfileHandler,
  searchUsersHandler,
  updateMeHandler,
} from '../controllers/usersController';

const usersRouter: Router = Router();

usersRouter.use(defaultLimiter);

usersRouter.get('/check-username', checkUsernameAvailabilityHandler);
usersRouter.get('/search', authenticate, searchUsersHandler);
usersRouter.get('/me', authenticate, getMeHandler);
usersRouter.patch('/me', authenticate, updateMeHandler);
usersRouter.get('/:username', getPublicProfileHandler);

export { usersRouter };