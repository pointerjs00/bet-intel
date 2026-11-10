import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  bulkSetFavouritesHandler,
  listFavouritesHandler,
  toggleFavouriteHandler,
} from '../controllers/favouritesController';

const favouritesRouter: Router = Router();

favouritesRouter.use(authenticate);

favouritesRouter.get('/', listFavouritesHandler);
favouritesRouter.post('/toggle', toggleFavouriteHandler);
favouritesRouter.put('/bulk', bulkSetFavouritesHandler);

export { favouritesRouter };
