// apps/api/src/routes/footballDataRoutes.ts

import { Router } from 'express';
import { insightController }        from '../controllers/insightController';
import { matchStatsController }     from '../controllers/matchStatsController';
import { standingsDataController }  from '../controllers/standingsDataController';
import { injuriesController }       from '../controllers/injuriesController';
import { topScorersController }     from '../controllers/topScorersController';

export const footballDataRouter = Router();

// Fixture insight (parametric — must come after specific fixture routes)
footballDataRouter.get('/fixtures/:fixtureId/insight', insightController.getInsight);
footballDataRouter.get('/fixtures/:fixtureId/stats',   matchStatsController.getMatchStats);

// Standings by API-Football league ID
footballDataRouter.get('/standings/:leagueId', standingsDataController.getStandings);

// Team injuries
footballDataRouter.get('/teams/:teamSlug/injuries', injuriesController.getTeamInjuries);

// League top scorers / assists
footballDataRouter.get('/leagues/:leagueId/topscorers', topScorersController.getTopScorers);
