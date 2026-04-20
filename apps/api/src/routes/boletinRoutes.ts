import { Router, json } from 'express';
import { authenticate } from '../middleware/authenticate';
import { defaultLimiter } from '../middleware/rateLimiter';
import {
  addBoletinItemHandler,
  createBoletinHandler,
  deleteBoletinHandler,
  deleteBoletinItemHandler,
  exportBoletinsHandler,
  getBoletinHandler,
  listBoletinsHandler,
  listSharedBoletinsHandler,
  shareBoletinHandler,
  updateBoletinHandler,
  updateBoletinItemHandler,
  updateBoletinItemsHandler,
} from '../controllers/boletinController';
import { betclicApiHandler, bulkImportHandler, parsePdfHandler, scanAiHandler, scanFeedbackHandler } from '../controllers/importController';

const boletinCollectionRouter: Router = Router();
const betintelRouter: Router = Router();

boletinCollectionRouter.use(authenticate, defaultLimiter);
betintelRouter.use(authenticate, defaultLimiter);

boletinCollectionRouter.get('/', listBoletinsHandler);
boletinCollectionRouter.get('/export', exportBoletinsHandler);
boletinCollectionRouter.post('/', createBoletinHandler);
boletinCollectionRouter.post('/import/pdf', json({ limit: '15mb' }), parsePdfHandler);
boletinCollectionRouter.post('/import/scan-ai', json({ limit: '15mb' }), scanAiHandler);
boletinCollectionRouter.post('/import/scan-feedback', json({ limit: '15mb' }), scanFeedbackHandler);
boletinCollectionRouter.post('/import/betclic-api', betclicApiHandler);
boletinCollectionRouter.post('/import/bulk', bulkImportHandler);

betintelRouter.get('/shared', listSharedBoletinsHandler);
betintelRouter.get('/:id', getBoletinHandler);
betintelRouter.patch('/:id', updateBoletinHandler);
betintelRouter.patch('/:id/items', updateBoletinItemsHandler);
betintelRouter.patch('/:id/items/:itemId', updateBoletinItemHandler);
betintelRouter.post('/:id/items', addBoletinItemHandler);
betintelRouter.delete('/:id/items/:itemId', deleteBoletinItemHandler);
betintelRouter.delete('/:id', deleteBoletinHandler);
betintelRouter.post('/:id/share', shareBoletinHandler);

export { boletinCollectionRouter, betintelRouter };