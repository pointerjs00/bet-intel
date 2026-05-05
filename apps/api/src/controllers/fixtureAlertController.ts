import { Request, Response } from 'express';
import { prisma } from '../prisma';

/** GET /api/fixtures/alerts — list fixtureIds the user is watching */
export async function listWatchedFixtures(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.id as string;

  const watches = await prisma.fixtureWatch.findMany({
    where: { userId },
    select: { fixtureId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: watches.map(w => w.fixtureId) });
}

/** POST /api/fixtures/alerts/:fixtureId — watch a fixture */
export async function watchFixture(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.id as string;
  const { fixtureId } = req.params;

  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId }, select: { id: true } });
  if (!fixture) {
    res.status(404).json({ success: false, error: 'Fixture not found' });
    return;
  }

  await prisma.fixtureWatch.upsert({
    where: { userId_fixtureId: { userId, fixtureId } },
    create: { userId, fixtureId },
    update: {},
  });

  res.json({ success: true });
}

/** DELETE /api/fixtures/alerts/:fixtureId — unwatch a fixture */
export async function unwatchFixture(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.id as string;
  const { fixtureId } = req.params;

  await prisma.fixtureWatch.deleteMany({ where: { userId, fixtureId } });

  res.json({ success: true });
}
