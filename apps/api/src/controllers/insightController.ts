// apps/api/src/controllers/insightController.ts

import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { computeFixtureInsight } from '../services/fixtureInsightService';

export const insightController = {
  async getInsight(req: Request, res: Response) {
    const { fixtureId } = req.params;
    const cacheKey = `insight:v2:${fixtureId}`;

    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) return res.status(404).json({ error: 'Fixture not found' });

    const insight = await computeFixtureInsight(fixture);

    // Only cache if we actually found historical data — zero-result insights
    // should recompute on the next request once data is available.
    const hasSamples = insight.homeTeamAtHome.sampleSize > 0 || insight.awayTeamAway.sampleSize > 0;
    if (hasSamples) {
      await redis.set(cacheKey, JSON.stringify(insight), 'EX', 6 * 3600);
    }

    return res.json(insight);
  },
};
