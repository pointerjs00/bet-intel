// apps/api/src/controllers/insightController.ts

import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { computeFixtureInsight } from '../services/fixtureInsightService';

export const insightController = {
  async getInsight(req: Request, res: Response) {
    const { fixtureId } = req.params;
    const cacheKey = `insight:${fixtureId}`;

    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) return res.status(404).json({ error: 'Fixture not found' });

    const statCount = await prisma.matchStat.count();
    if (statCount === 0) {
      return res.json({
        fixtureId,
        message: 'Historical data not yet available for this competition.',
        homeTeamAtHome: null,
        awayTeamAway: null,
      });
    }

    const insight = await computeFixtureInsight(fixture);
    await redis.set(cacheKey, JSON.stringify(insight), 'EX', 6 * 3600);

    return res.json(insight);
  },
};
