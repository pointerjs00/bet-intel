// apps/api/src/controllers/matchStatsController.ts

import type { Request, Response } from 'express';
import { prisma } from '../prisma';

export const matchStatsController = {
  async getMatchStats(req: Request, res: Response) {
    const { fixtureId } = req.params;
    const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId } });
    if (!fixture) return res.status(404).json({ error: 'Fixture not found' });

    const stat = await prisma.matchStat.findFirst({ where: { fixtureId } });
    return res.json({ fixtureId, stat: stat ?? null });
  },
};
