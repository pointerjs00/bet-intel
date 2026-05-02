// apps/api/src/controllers/topScorersController.ts

import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { LEAGUE_BY_API_FOOTBALL_ID } from '../config/leagueManifest';
import { getCurrentSeason } from '../utils/seasonUtils';

export const topScorersController = {
  async getTopScorers(req: Request, res: Response) {
    const leagueId = parseInt(req.params.leagueId);
    const type     = (req.query.type as string) === 'assists' ? 'assists' : 'goals';
    const season   = (req.query.season as string) ?? getCurrentSeason();
    const league   = LEAGUE_BY_API_FOOTBALL_ID[leagueId];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const cacheKey = `topscorers:${leagueId}:${season}:${type}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const scorers = await prisma.topScorer.findMany({
      where: { leagueId, season, type },
      orderBy: { rank: 'asc' },
      take: 20,
    });
    const payload = { leagueId, leagueName: league.name, season, type, scorers };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
    return res.json(payload);
  },
};
