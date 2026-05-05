import { Request, Response } from 'express';
import { prisma } from '../prisma';

function getUserId(req: Request): string {
  return (req as any).user.sub as string;
}

/** GET /api/fixture-alerts — list fixtureIds the user is watching */
export async function listWatchedFixtures(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);

  const watches = await prisma.fixtureWatch.findMany({
    where: { userId },
    select: { fixtureId: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: watches.map(w => w.fixtureId) });
}

/** POST /api/fixture-alerts/:fixtureId — watch a fixture */
export async function watchFixture(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
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

/** DELETE /api/fixture-alerts/:fixtureId — unwatch a fixture */
export async function unwatchFixture(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const { fixtureId } = req.params;

  await prisma.fixtureWatch.deleteMany({ where: { userId, fixtureId } });

  res.json({ success: true });
}
