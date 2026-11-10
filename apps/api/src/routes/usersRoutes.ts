import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  checkUsernameAvailabilityHandler,
  deleteAvatarHandler,
  getMeHandler,
  getPublicProfileHandler,
  searchUsersHandler,
  updateMeHandler,
  uploadAvatarHandler,
} from '../controllers/usersController';

const usersRouter: Router = Router();

usersRouter.get('/check-username', checkUsernameAvailabilityHandler);
usersRouter.get('/search', authenticate, searchUsersHandler);
usersRouter.get('/me', authenticate, getMeHandler);
usersRouter.patch('/me', authenticate, updateMeHandler);
usersRouter.post('/me/avatar', authenticate, uploadAvatarHandler);
usersRouter.delete('/me/avatar', authenticate, deleteAvatarHandler);
usersRouter.get('/:username', getPublicProfileHandler);

export { usersRouter };