import type { Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

function ok(res: Response, data: unknown) {
  return res.json({ success: true, data });
}

function fail(res: Response, err: unknown, context: string) {
  logger.error(`[Standings] ${context}`, { error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

// Longest token with 4+ chars from a name, accent-stripped, for fuzzy DB search
function primaryToken(name: string): string {
  const tokens = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return tokens.sort((a, b) => b.length - a.length)[0] ?? name.toLowerCase();
}

// ─── GET /api/fixtures/standings ─────────────────────────────────────────────

export async function leagueTableHandler(req: Request, res: Response) {
  try {
    const competition = String(req.query.competition ?? '');
    const season = String(req.query.season ?? '2025-26');
    if (!competition) return res.status(400).json({ success: false, error: 'competition required' });

    const rows = await prisma.teamStat.findMany({
      where: {
        competition: { contains: competition, mode: 'insensitive' },
        season,
      },
      orderBy: [{ points: 'desc' }, { goalsFor: 'desc' }],
    });

    const data = rows.map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
      bttsRate: r.played > 0 ? Math.round((r.bttsCount / r.played) * 100) : 0,
      over25Rate: r.played > 0 ? Math.round((r.over25Count / r.played) * 100) : 0,
    }));

    return ok(res, data);
  } catch (err) {
    return fail(res, err, 'leagueTableHandler');
  }
}

// ─── GET /api/fixtures/team-stats ────────────────────────────────────────────

export async function teamStatsHandler(req: Request, res: Response) {
  try {
    const team = String(req.query.team ?? '');
    const competition = String(req.query.competition ?? '');
    const season = String(req.query.season ?? '2025-26');
    if (!team) return res.status(400).json({ success: false, error: 'team required' });

    const token = primaryToken(team);
    const where: Record<string, unknown> = {
      team: { contains: token, mode: 'insensitive' },
    };
    if (competition) where.competition = { contains: competition, mode: 'insensitive' };
    if (season) where.season = season;

    const rows = await prisma.teamStat.findMany({
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const data = rows.map((r) => ({
      ...r,
      goalDifference: r.goalsFor - r.goalsAgainst,
      bttsRate: r.played > 0 ? Math.round((r.bttsCount / r.played) * 100) : 0,
      over25Rate: r.played > 0 ? Math.round((r.over25Count / r.played) * 100) : 0,
      over15Rate: r.played > 0 ? Math.round((r.over15Count / r.played) * 100) : 0,
      cleanSheetRate: r.played > 0 ? Math.round((r.cleanSheets / r.played) * 100) : 0,
    }));

    return ok(res, data);
  } catch (err) {
    return fail(res, err, 'teamStatsHandler');
  }
}

// ─── GET /api/fixtures/h2h ───────────────────────────────────────────────────

export async function h2hHandler(req: Request, res: Response) {
  try {
    const homeTeam = String(req.query.homeTeam ?? '');
    const awayTeam = String(req.query.awayTeam ?? '');
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ success: false, error: 'homeTeam and awayTeam required' });
    }

    const htok = primaryToken(homeTeam);
    const atok = primaryToken(awayTeam);

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        OR: [
          {
            homeTeam: { contains: htok, mode: 'insensitive' },
            awayTeam: { contains: atok, mode: 'insensitive' },
          },
          {
            homeTeam: { contains: atok, mode: 'insensitive' },
            awayTeam: { contains: htok, mode: 'insensitive' },
          },
        ],
      },
      orderBy: { kickoffAt: 'desc' },
      take: 10,
    });

    return ok(res, fixtures);
  } catch (err) {
    return fail(res, err, 'h2hHandler');
  }
}

// ─── GET /api/fixtures/competition-stats ─────────────────────────────────────

export async function competitionStatsHandler(req: Request, res: Response) {
  try {
    const competition = String(req.query.competition ?? '');
    const season = String(req.query.season ?? '2025-26');
    if (!competition) return res.status(400).json({ success: false, error: 'competition required' });

    const fixtures = await prisma.fixture.findMany({
      where: {
        competition: { contains: competition, mode: 'insensitive' },
        season,
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: { homeScore: true, awayScore: true, homeTeam: true, awayTeam: true, kickoffAt: true },
    });

    if (fixtures.length === 0) return ok(res, null);

    let totalGoals = 0, bttsCount = 0, over25Count = 0, over15Count = 0;
    let biggestWin = { margin: 0, homeTeam: '', awayTeam: '', homeScore: 0, awayScore: 0, date: '' };
    let highestScoring = { total: 0, homeTeam: '', awayTeam: '', homeScore: 0, awayScore: 0, date: '' };

    for (const f of fixtures) {
      const hg = f.homeScore!;
      const ag = f.awayScore!;
      const total = hg + ag;
      totalGoals += total;
      if (hg > 0 && ag > 0) bttsCount++;
      if (total > 2) over25Count++;
      if (total > 1) over15Count++;

      const margin = Math.abs(hg - ag);
      if (margin > biggestWin.margin) {
        biggestWin = { margin, homeTeam: f.homeTeam, awayTeam: f.awayTeam, homeScore: hg, awayScore: ag, date: f.kickoffAt.toISOString() };
      }
      if (total > highestScoring.total) {
        highestScoring = { total, homeTeam: f.homeTeam, awayTeam: f.awayTeam, homeScore: hg, awayScore: ag, date: f.kickoffAt.toISOString() };
      }
    }

    const played = fixtures.length;
    return ok(res, {
      competition,
      season,
      played,
      avgGoalsPerMatch: Math.round((totalGoals / played) * 100) / 100,
      bttsRate: Math.round((bttsCount / played) * 100),
      over25Rate: Math.round((over25Count / played) * 100),
      over15Rate: Math.round((over15Count / played) * 100),
      biggestWin,
      highestScoring,
    });
  } catch (err) {
    return fail(res, err, 'competitionStatsHandler');
  }
}
