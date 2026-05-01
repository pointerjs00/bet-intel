import { Router } from 'express';
import { listFixturesHandler, upcomingFixturesHandler } from '../controllers/fixtureController';

export const fixtureRouter = Router();

// /api/fixtures/upcoming must be registered before /api/fixtures/:id (if added later)
fixtureRouter.get('/upcoming', upcomingFixturesHandler);
fixtureRouter.get('/', listFixturesHandler);
