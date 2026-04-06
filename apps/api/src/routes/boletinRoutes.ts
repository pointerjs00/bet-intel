import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  addBoletinItemHandler,
  createBoletinHandler,
  deleteBoletinHandler,
  deleteBoletinItemHandler,
  getBoletinHandler,
  listBoletinsHandler,
  listSharedBoletinsHandler,
  shareBoletinHandler,
  updateBoletinHandler,
  updateBoletinItemsHandler,
} from '../controllers/boletinController';

const boletinCollectionRouter: Router = Router();
const betintelRouter: Router = Router();

boletinCollectionRouter.use(authenticate, defaultLimiter);
betintelRouter.use(authenticate, defaultLimiter);

boletinCollectionRouter.get('/', listBoletinsHandler);
boletinCollectionRouter.post('/', createBoletinHandler);

betintelRouter.get('/shared', listSharedBoletinsHandler);
betintelRouter.get('/:id', getBoletinHandler);
betintelRouter.patch('/:id', updateBoletinHandler);
betintelRouter.patch('/:id/items', updateBoletinItemsHandler);
betintelRouter.post('/:id/items', addBoletinItemHandler);
betintelRouter.delete('/:id/items/:itemId', deleteBoletinItemHandler);
betintelRouter.delete('/:id', deleteBoletinHandler);
betintelRouter.post('/:id/share', shareBoletinHandler);

export { boletinCollectionRouter, betintelRouter };