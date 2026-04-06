import { Request, Response } from 'express';
import { statsQuerySchema } from '@betintel/shared';
import {
  getPersonalStats,
  getStatsByCompetition,
  getStatsByMarket,
  getStatsByOddsRange,
  getStatsBySport,
  getStatsByTeam,
  getStatsSummary,
  getStatsTimeline,
} from '../services/stats/statsService';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Stats controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unknown stats controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

function parseStatsQuery(req: Request, res: Response): { period: 'week' | 'month' | 'year' | 'all' } | null {
  const parsed = statsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Parâmetros de estatísticas inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return null;
  }

  return parsed.data;
}

/** Handles GET /api/stats/me. */
export async function getPersonalStatsHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const stats = await getPersonalStats(requireUserId(req), parsed.period);
    ok(res, stats);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/summary. */
export async function getStatsSummaryHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const summary = await getStatsSummary(requireUserId(req), parsed.period);
    ok(res, summary);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/by-sport. */
export async function getStatsBySportHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const rows = await getStatsBySport(requireUserId(req), parsed.period);
    ok(res, rows);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/by-team. */
export async function getStatsByTeamHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const rows = await getStatsByTeam(requireUserId(req), parsed.period);
    ok(res, rows);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/by-competition. */
export async function getStatsByCompetitionHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const rows = await getStatsByCompetition(requireUserId(req), parsed.period);
    ok(res, rows);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/by-market. */
export async function getStatsByMarketHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const rows = await getStatsByMarket(requireUserId(req), parsed.period);
    ok(res, rows);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/by-odds-range. */
export async function getStatsByOddsRangeHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const rows = await getStatsByOddsRange(requireUserId(req), parsed.period);
    ok(res, rows);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/stats/me/timeline. */
export async function getStatsTimelineHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseStatsQuery(req, res);
  if (!parsed) {
    return;
  }

  try {
    const timeline = await getStatsTimeline(requireUserId(req), parsed.period);
    ok(res, timeline);
  } catch (err) {
    fail(res, err);
  }
}