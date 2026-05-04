import { Router } from 'express';
import {
  listFixturesHandler,
  upcomingFixturesHandler,
  recentFixturesHandler,
} from '../controllers/fixtureController';
import {
  leagueTableHandler,
  teamStatsHandler,
  h2hHandler,
  competitionStatsHandler,
} from '../controllers/standingsController';

export const fixtureRouter = Router();

// ── Specific named routes MUST come before the parametric /:id routes ─────────

fixtureRouter.get('/upcoming',         upcomingFixturesHandler);
fixtureRouter.get('/recent',           recentFixturesHandler);   // ← NEW
fixtureRouter.get('/standings',        leagueTableHandler);
fixtureRouter.get('/team-stats',       teamStatsHandler);
fixtureRouter.get('/h2h',              h2hHandler);
fixtureRouter.get('/competition-stats', competitionStatsHandler);

// ── Generic list (used by boletim builder, search, etc.) ──────────────────────
fixtureRouter.get('/', listFixturesHandler);