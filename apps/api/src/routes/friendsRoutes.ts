import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  acceptFriendRequestHandler,
  declineFriendRequestHandler,
  getFriendFeedHandler,
  listFriendRequestsHandler,
  listFriendsHandler,
  removeFriendHandler,
  sendFriendRequestHandler,
} from '../controllers/friendsController';

const friendsRouter: Router = Router();

friendsRouter.use(authenticate, defaultLimiter);

friendsRouter.get('/', listFriendsHandler);
friendsRouter.get('/requests', listFriendRequestsHandler);
friendsRouter.get('/feed', getFriendFeedHandler);
friendsRouter.post('/request/:userId', sendFriendRequestHandler);
friendsRouter.post('/accept/:requestId', acceptFriendRequestHandler);
friendsRouter.post('/decline/:requestId', declineFriendRequestHandler);
friendsRouter.delete('/:userId', removeFriendHandler);

export { friendsRouter };