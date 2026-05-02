// apps/api/src/controllers/standingsDataController.ts
// Serves standings by numeric leagueId (API-Football ID).
// Distinct from standingsController.ts which serves by competition name string.

import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { LEAGUE_BY_API_FOOTBALL_ID } from '../config/leagueManifest';
import { getCurrentSeason } from '../utils/seasonUtils';

export const standingsDataController = {
  async getStandings(req: Request, res: Response) {
    const leagueId = parseInt(req.params.leagueId);
    const season   = (req.query.season as string) ?? getCurrentSeason();
    const league   = LEAGUE_BY_API_FOOTBALL_ID[leagueId];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const cacheKey = `standings:${leagueId}:${season}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const rows = await prisma.teamStat.findMany({
      where: { competition: league.name, season },
      orderBy: { position: 'asc' },
    });
    const payload = { leagueId, leagueName: league.name, season, table: rows };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
    return res.json(payload);
  },
};
