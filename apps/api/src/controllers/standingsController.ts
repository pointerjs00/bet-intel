import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

const COMPETITION_ALIASES: Record<string, string> = {
  'Champions League':       'UEFA Champions League',
  'Europa League':          'UEFA Europa League',
  'Conference League':      'UEFA Conference League',
};

function resolveCompetition(name: string): string {
  return COMPETITION_ALIASES[name] ?? name;
}

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Standings controller error', { error: err.message, stack: err.stack });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

// ─── GET /api/fixtures/standings ─────────────────────────────────────────────

/**
 * Returns the league table for a given competition + season.
 *
 * Season is passed through as-is — no normalisation.
 * DB stores "2025-26" (set by getCurrentSeason() in fixturesSync / fixtureService).
 * The mobile client sends "2025-26" (CURRENT_SEASON constant in teamStatsService).
 * They match exactly — no conversion needed.
 *
 * If no season is provided, we find the most recent season for that competition
 * so the query never returns empty just because of a missing param.
 */

export async function leagueTableHandler(req: Request, res: Response): Promise<void> {
  try {
    const { competition, season } = req.query as Record<string, string | undefined>;

    console.log('[leagueTable] incoming request:', { competition, season, headers: req.headers['user-agent'] });

    if (!competition) {
      res.status(400).json({ success: false, error: 'competition is required' });
      return;
    }

    const resolvedCompetition = resolveCompetition(competition);
    console.log('[leagueTable] resolved competition:', resolvedCompetition);

    let resolvedSeason = season;
    if (!resolvedSeason) {
      const latest = await prisma.teamStat.findFirst({
        where: { competition: { equals: resolvedCompetition, mode: 'insensitive' } },
        orderBy: { season: 'desc' },
        select: { season: true },
      });
      resolvedSeason = latest?.season;
      console.log('[leagueTable] auto-detected season:', resolvedSeason);
    }

    const rows = await prisma.teamStat.findMany({
      where: {
        competition: { equals: resolvedCompetition, mode: 'insensitive' },
        ...(resolvedSeason ? { season: resolvedSeason } : {}),
      },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
    });

    console.log('[leagueTable] rows returned:', rows.length);

    const data = rows.map((r) => ({
      ...r,
      team: r.teamName ?? r.team,
      goalDifference: r.goalsFor - r.goalsAgainst,
      bttsRate:       r.played > 0 ? r.bttsCount  / r.played : 0,
      over25Rate:     r.played > 0 ? r.over25Count / r.played : 0,
      over15Rate:     r.played > 0 ? r.over15Count / r.played : 0,
      cleanSheetRate: r.played > 0 ? r.cleanSheets / r.played : 0,
    }));

    ok(res, data);
  } catch (err) {
    console.log('[leagueTable] error:', err);
    fail(res, err);
  }
}

// ─── GET /api/fixtures/team-stats ────────────────────────────────────────────

export async function teamStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { team, competition, season } = req.query as Record<string, string | undefined>;

    if (!team) {
      res.status(400).json({ success: false, error: 'team is required' });
      return;
    }

    const rows = await prisma.teamStat.findMany({
      where: {
        team: { contains: team, mode: 'insensitive' },
        ...(competition
          ? { competition: { contains: competition, mode: 'insensitive' } }
          : {}),
        ...(season ? { season } : {}),
      },
      orderBy: { season: 'desc' },
    });

    const data = rows.map((r) => ({
      ...r,
      team: r.teamName ?? r.team,
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
      res.status(400).json({ success: false, error: 'homeTeam and awayTeam are required' });
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

export async function competitionStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { competition, season } = req.query as Record<string, string | undefined>;

    if (!competition) {
      res.status(400).json({ success: false, error: 'competition is required' });
      return;
    }

    const fixtures = await prisma.fixture.findMany({
      where: {
        competition: { contains: competition, mode: 'insensitive' },
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
        ...(season ? { season } : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: 1000,
    });

    if (fixtures.length === 0) {
      ok(res, null);
      return;
    }

    const played = fixtures.length;
    let totalGoals = 0, btts = 0, over25 = 0, over15 = 0;
    let biggestWin = fixtures[0]!, biggestWinMargin = 0;
    let highestScoring = fixtures[0]!, highestTotal = 0;

    for (const f of fixtures) {
      const hg = f.homeScore!;
      const ag = f.awayScore!;
      const total = hg + ag;
      const margin = Math.abs(hg - ag);
      totalGoals += total;
      if (hg > 0 && ag > 0) btts++;
      if (total > 2) over25++;
      if (total > 1) over15++;
      if (margin > biggestWinMargin) { biggestWinMargin = margin; biggestWin = f; }
      if (total > highestTotal)      { highestTotal = total;       highestScoring = f; }
    }

    ok(res, {
      competition,
      season: season ?? fixtures[0]?.season ?? '',
      played,
      avgGoalsPerMatch: totalGoals / played,
      bttsRate:  btts  / played,
      over25Rate: over25 / played,
      over15Rate: over15 / played,
      biggestWin: {
        margin: biggestWinMargin,
        homeTeam: biggestWin.homeTeam, awayTeam: biggestWin.awayTeam,
        homeScore: biggestWin.homeScore!, awayScore: biggestWin.awayScore!,
        date: biggestWin.kickoffAt.toISOString(),
      },
      highestScoring: {
        total: highestTotal,
        homeTeam: highestScoring.homeTeam, awayTeam: highestScoring.awayTeam,
        homeScore: highestScoring.homeScore!, awayScore: highestScoring.awayScore!,
        date: highestScoring.kickoffAt.toISOString(),
      },
    });
  } catch (err) {
    fail(res, err);
  }
}