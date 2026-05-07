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
import {
  fixtureStatsHandler,
  fixtureEventsHandler,
  fixtureLineupsHandler,
  fixturePredictionHandler,
  teamPlayerStatsHandler,
  topCardsHandler,
  venueHandler,
  coachHandler,
} from '../controllers/fixtureInsightController';

export const fixtureRouter = Router();

// ── Specific named routes MUST come before the parametric /:id routes ─────────

fixtureRouter.get('/upcoming',         upcomingFixturesHandler);
fixtureRouter.get('/recent',           recentFixturesHandler);
fixtureRouter.get('/standings',        leagueTableHandler);
fixtureRouter.get('/team-stats',       teamStatsHandler);
fixtureRouter.get('/h2h',             h2hHandler);
fixtureRouter.get('/competition-stats', competitionStatsHandler);
fixtureRouter.get('/player-stats',     teamPlayerStatsHandler);
fixtureRouter.get('/top-cards',        topCardsHandler);
fixtureRouter.get('/venue/:apiId',     venueHandler);
fixtureRouter.get('/coach',            coachHandler);

// ── Per-fixture insight sub-resources ─────────────────────────────────────────
fixtureRouter.get('/:id/stats',        fixtureStatsHandler);
fixtureRouter.get('/:id/events',       fixtureEventsHandler);
fixtureRouter.get('/:id/lineups',      fixtureLineupsHandler);
fixtureRouter.get('/:id/prediction',   fixturePredictionHandler);

// ── Generic list (used by boletim builder, search, etc.) ──────────────────────
fixtureRouter.get('/', listFixturesHandler);