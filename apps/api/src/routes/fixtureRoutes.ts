import { Router } from 'express';
import { listFixturesHandler, upcomingFixturesHandler } from '../controllers/fixtureController';
import {
  leagueTableHandler,
  teamStatsHandler,
  h2hHandler,
  competitionStatsHandler,
} from '../controllers/standingsController';

export const fixtureRouter = Router();

// Specific routes before parametric ones
fixtureRouter.get('/upcoming', upcomingFixturesHandler);
fixtureRouter.get('/standings', leagueTableHandler);
fixtureRouter.get('/team-stats', teamStatsHandler);
fixtureRouter.get('/h2h', h2hHandler);
fixtureRouter.get('/competition-stats', competitionStatsHandler);
fixtureRouter.get('/', listFixturesHandler);
