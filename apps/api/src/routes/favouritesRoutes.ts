import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  bulkSetFavouritesHandler,
  listFavouritesHandler,
  toggleFavouriteHandler,
} from '../controllers/favouritesController';

const favouritesRouter: Router = Router();

favouritesRouter.use(authenticate, defaultLimiter);

favouritesRouter.get('/', listFavouritesHandler);
favouritesRouter.post('/toggle', toggleFavouriteHandler);
favouritesRouter.put('/bulk', bulkSetFavouritesHandler);

export { favouritesRouter };
