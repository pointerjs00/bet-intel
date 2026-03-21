import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  createBoletinHandler,
  deleteBoletinHandler,
  getBoletinHandler,
  listBoletinsHandler,
  listSharedBoletinsHandler,
  shareBoletinHandler,
  updateBoletinHandler,
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
betintelRouter.delete('/:id', deleteBoletinHandler);
betintelRouter.post('/:id/share', shareBoletinHandler);

export { boletinCollectionRouter, betintelRouter };