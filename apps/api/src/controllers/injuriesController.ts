// apps/api/src/controllers/injuriesController.ts

import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveAlias } from '../utils/teamAliases';
import { getCurrentSeason } from '../utils/seasonUtils';

export const injuriesController = {
  async getTeamInjuries(req: Request, res: Response) {
    const teamSlug    = req.params.teamSlug;
    const leagueId    = parseInt(req.query.leagueId as string);
    const season      = (req.query.season as string) ?? getCurrentSeason();
    const teamNormKey = resolveAlias(normaliseTeamName(teamSlug.replace(/-/g, ' ')));

    const cacheKey = `injuries:${teamNormKey}:${leagueId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const injuries = await prisma.playerAvailability.findMany({
      where: { teamNormKey, leagueId, season },
      orderBy: { playerName: 'asc' },
    });
    const payload = { teamSlug, leagueId, season, injuries };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
    return res.json(payload);
  },
};
