import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Standings controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/**
 * Normalise season strings so both API-Football format ("2025") and the
 * legacy OpenFootball format ("2025-26") resolve to the same DB rows.
 *
 * API-Football syncs TeamStat rows with season = "2025" (single year).
 * The mobile client may send "2025-26" — we strip the suffix before querying.
 */
function normaliseSeason(season: string | undefined): string | undefined {
  if (!season) return undefined;
  return season.includes('-') ? season.split('-')[0] : season;
}

// ─── GET /api/fixtures/standings ─────────────────────────────────────────────

/**
 * Returns the league table for a given competition + season.
 * competition — exact competition name string (e.g. "Premier League")
 * season      — "2025" or "2025-26" (both accepted, normalised internally)
 */
export async function leagueTableHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { competition, season } = req.query as Record<string, string | undefined>;

    if (!competition) {
      res.status(400).json({ success: false, error: 'competition is required' });
      return;
    }

    const normSeason = normaliseSeason(season);

    const rows = await prisma.teamStat.findMany({
      where: {
        competition: { equals: competition, mode: 'insensitive' },
        ...(normSeason ? { season: normSeason } : {}),
      },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
    });

    // Compute derived fields that the mobile TeamStatData type expects
    const data = rows.map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
      bttsRate:       r.played > 0 ? r.bttsCount  / r.played : 0,
      over25Rate:     r.played > 0 ? r.over25Count / r.played : 0,
      over15Rate:     r.played > 0 ? r.over15Count / r.played : 0,
      cleanSheetRate: r.played > 0 ? r.cleanSheets / r.played : 0,
    }));

    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/team-stats ────────────────────────────────────────────

export async function teamStatsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { team, competition, season } = req.query as Record<
      string,
      string | undefined
    >;

    if (!team) {
      res.status(400).json({ success: false, error: 'team is required' });
      return;
    }

    const normSeason = normaliseSeason(season);

    const rows = await prisma.teamStat.findMany({
      where: {
        team: { contains: team, mode: 'insensitive' },
        ...(competition
          ? { competition: { contains: competition, mode: 'insensitive' } }
          : {}),
        ...(normSeason ? { season: normSeason } : {}),
      },
      orderBy: { season: 'desc' },
    });

    const data = rows.map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
      bttsRate:       r.played > 0 ? r.bttsCount  / r.played : 0,
      over25Rate:     r.played > 0 ? r.over25Count / r.played : 0,
      over15Rate:     r.played > 0 ? r.over15Count / r.played : 0,
      cleanSheetRate: r.played > 0 ? r.cleanSheets / r.played : 0,
    }));

    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/h2h ───────────────────────────────────────────────────

export async function h2hHandler(req: Request, res: Response): Promise<void> {
  try {
    const { homeTeam, awayTeam } = req.query as Record<string, string | undefined>;

    if (!homeTeam || !awayTeam) {
      res
        .status(400)
        .json({ success: false, error: 'homeTeam and awayTeam are required' });
      return;
    }

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        OR: [
          {
            homeTeam: { contains: homeTeam, mode: 'insensitive' },
            awayTeam: { contains: awayTeam, mode: 'insensitive' },
          },
          {
            homeTeam: { contains: awayTeam, mode: 'insensitive' },
            awayTeam: { contains: homeTeam, mode: 'insensitive' },
          },
        ],
      },
      orderBy: { kickoffAt: 'desc' },
      take: 20,
    });

    ok(res, fixtures);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/fixtures/competition-stats ─────────────────────────────────────

export async function competitionStatsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { competition, season } = req.query as Record<string, string | undefined>;

    if (!competition) {
      res.status(400).json({ success: false, error: 'competition is required' });
      return;
    }

    const normSeason = normaliseSeason(season);

    const fixtures = await prisma.fixture.findMany({
      where: {
        competition: { contains: competition, mode: 'insensitive' },
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
        ...(normSeason ? { season: normSeason } : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: 1000,
    });

    if (fixtures.length === 0) {
      ok(res, null);
      return;
    }

    const played = fixtures.length;
    let totalGoals = 0;
    let btts = 0;
    let over25 = 0;
    let over15 = 0;
    let biggestWin = fixtures[0]!;
    let biggestWinMargin = 0;
    let highestScoring = fixtures[0]!;
    let highestTotal = 0;

    for (const f of fixtures) {
      const hg = f.homeScore!;
      const ag = f.awayScore!;
      const total = hg + ag;
      const margin = Math.abs(hg - ag);

      totalGoals += total;
      if (hg > 0 && ag > 0) btts++;
      if (total > 2) over25++;
      if (total > 1) over15++;
      if (margin > biggestWinMargin) {
        biggestWinMargin = margin;
        biggestWin = f;
      }
      if (total > highestTotal) {
        highestTotal = total;
        highestScoring = f;
      }
    }

    const data = {
      competition,
      season: normSeason ?? (fixtures[0]?.season ?? ''),
      played,
      avgGoalsPerMatch: totalGoals / played,
      bttsRate: btts / played,
      over25Rate: over25 / played,
      over15Rate: over15 / played,
      biggestWin: {
        margin: biggestWinMargin,
        homeTeam: biggestWin.homeTeam,
        awayTeam: biggestWin.awayTeam,
        homeScore: biggestWin.homeScore!,
        awayScore: biggestWin.awayScore!,
        date: biggestWin.kickoffAt.toISOString(),
      },
      highestScoring: {
        total: highestTotal,
        homeTeam: highestScoring.homeTeam,
        awayTeam: highestScoring.awayTeam,
        homeScore: highestScoring.homeScore!,
        awayScore: highestScoring.awayScore!,
        date: highestScoring.kickoffAt.toISOString(),
      },
    };

    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
}