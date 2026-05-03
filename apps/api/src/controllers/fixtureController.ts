import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Fixture controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/** GET /api/fixtures — paginated fixture list with optional filters. */
export async function listFixturesHandler(req: Request, res: Response): Promise<void> {
  try {
    const {
      competition,
      from,
      to,
      team,
      sport = 'FOOTBALL',
      season, // ← no longer default to '2025-26'
    } = req.query as Record<string, string | undefined>;

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const fixtures = await prisma.fixture.findMany({
      where: {
        sport: sport ?? 'FOOTBALL',
        ...(season ? { season } : {}), // ← only filter season if explicitly provided
        kickoffAt: { gte: fromDate, lte: toDate },
        ...(competition ? { competition: { contains: competition, mode: 'insensitive' } } : {}),
        ...(team ? {
          OR: [
            { homeTeam: { contains: team, mode: 'insensitive' } },
            { awayTeam: { contains: team, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000, // ← was 200
    });

    ok(res, fixtures);
  } catch (err) {
    fail(res, err);
  }
}

/** GET /api/fixtures/upcoming — upcoming fixtures within N days, Redis-cached for 1 h. */
export async function upcomingFixturesHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawDays = parseInt((req.query.days as string) ?? '7', 10);
    // ← raise cap from 30 to 365, upcoming fixtures are only ~4916 rows total
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 7;
    const team = req.query.team as string | undefined;

    const cacheKey = `fixtures:upcoming:${days}:${team ?? ''}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      ok(res, JSON.parse(cached));
      return;
    }

    const now = new Date();
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: 'SCHEDULED',
        kickoffAt: { gte: now, lte: until },
        ...(team ? {
          OR: [
            { homeTeam: { contains: team, mode: 'insensitive' } },
            { awayTeam: { contains: team, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000, // ← was 100
    });

    redis.setex(cacheKey, 3600, JSON.stringify(fixtures)).catch(() => {});
    ok(res, fixtures);
  } catch (err) {
    fail(res, err);
  }
}
