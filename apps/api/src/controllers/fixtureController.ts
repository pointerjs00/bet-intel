import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

// When both a CSV-sourced record (no apiFootballId) and an API-Football record
// exist for the same match, keep only the API-Football one.
function deduplicateFixtures(fixtures: any[]): any[] {
  const best = new Map<string, any>();
  for (const f of fixtures) {
    const homeNorm = f.homeTeamNormKey ?? f.homeTeam.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const awayNorm = f.awayTeamNormKey ?? f.awayTeam.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const dateStr = (f.kickoffAt as Date).toISOString().slice(0, 10);
    const key = `${homeNorm}|${awayNorm}|${dateStr}`;
    const existing = best.get(key);
    if (!existing || (f.apiFootballId != null && existing.apiFootballId == null)) {
      best.set(key, f);
    }
  }
  return Array.from(best.values());
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Fixture controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/**
 * Normalise season strings so both API-Football format ("2025") and the
 * legacy OpenFootball format ("2025-26") resolve to the same DB rows.
 * DB rows from API-Football are stored with season = "2025".
 */
function normaliseSeason(season: string | undefined): string | undefined {
  if (!season) return undefined;
  return season.includes('-') ? season.split('-')[0] : season;
}

// ─── GET /api/fixtures ────────────────────────────────────────────────────────

/**
 * Paginated fixture list with optional filters.
 * Used by the boletim builder and search flows — NOT by the fixtures screen
 * (which uses /upcoming and /recent instead).
 */
export async function listFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      competition,
      from,
      to,
      team,
      sport,
      season,
      status,
    } = req.query as Record<string, string | undefined>;

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Parse status filter — accepts comma-separated list e.g. "FINISHED,LIVE"
    const statusFilter = status
      ? status.split(',').map((s) => s.trim().toUpperCase())
      : undefined;

    const fixtures = await prisma.fixture.findMany({
      where: {
        sport: sport ?? 'FOOTBALL',
        // Only filter by season if explicitly provided — normalise format
        ...(season ? { season: normaliseSeason(season) } : {}),
        kickoffAt: { gte: fromDate, lte: toDate },
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(competition
          ? { competition: { contains: competition, mode: 'insensitive' } }
          : {}),
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000,
    });

    ok(res, deduplicateFixtures(fixtures));
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/upcoming ───────────────────────────────────────────────

/**
 * Upcoming SCHEDULED fixtures for the next N days.
 * Redis-cached for 1 hour per (days, team) combo.
 * Called by useUpcomingFixtures(14) from the fixtures screen.
 */
export async function upcomingFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawDays = parseInt((req.query.days as string) ?? '14', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 14;
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
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5000,
    });

    const deduped = deduplicateFixtures(fixtures);
    redis.setex(cacheKey, 3600, JSON.stringify(deduped)).catch(() => {});
    ok(res, deduped);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/recent ─────────────────────────────────────────────────

/**
 * Recently FINISHED or LIVE fixtures for the past N days.
 * Explicitly excludes SCHEDULED status so there is zero overlap with /upcoming.
 * Redis-cached for 15 minutes (scores change, but not constantly).
 * Called by useRecentFixtures(3) from the fixtures screen.
 */
export async function recentFixturesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawDays = parseInt((req.query.days as string) ?? '3', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 30) : 3;
    const team = req.query.team as string | undefined;

    const cacheKey = `fixtures:recent:${days}:${team ?? ''}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      ok(res, JSON.parse(cached));
      return;
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();

    const fixtures = await prisma.fixture.findMany({
      where: {
        // Explicitly only FINISHED and LIVE — never SCHEDULED
        status: { in: ['FINISHED', 'LIVE'] },
        kickoffAt: { gte: since, lte: now },
        ...(team
          ? {
              OR: [
                { homeTeam: { contains: team, mode: 'insensitive' } },
                { awayTeam: { contains: team, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: 500,
    });

    // 15 min cache — recent results settle quickly
    const deduped = deduplicateFixtures(fixtures);
    redis.setex(cacheKey, 900, JSON.stringify(deduped)).catch(() => {});
    ok(res, deduped);
  } catch (err) {
    fail(res, err);
  }
}