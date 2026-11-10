import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  listWatchedFixtures,
  watchFixture,
  unwatchFixture,
} from '../controllers/fixtureAlertController';

const fixtureAlertRouter: Router = Router();

fixtureAlertRouter.use(authenticate);

fixtureAlertRouter.get('/',             listWatchedFixtures);
fixtureAlertRouter.post('/:fixtureId',  watchFixture);
fixtureAlertRouter.delete('/:fixtureId', unwatchFixture);

export { fixtureAlertRouter };
