import { Request, Response } from 'express';
import { z } from 'zod';
import { filterSchema } from '@betintel/shared';
import {
  getOddsFeed,
  getEventWithOdds,
  getLiveEvents,
  getActiveSites,
  getAvailableSports,
  getLeagues,
} from '../services/odds/oddsService';
import { Sport } from '@betintel/shared';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Odds controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }
  logger.error('Unknown odds controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

// ─── GET /api/odds ─────────────────────────────────────────────────────────────

/**
 * Paginated odds feed with all supported filters.
 *
 * Query params (all optional):
 *   sites      — comma-separated betting site slugs, e.g. "betclic,placard"
 *   sport      — Sport enum value, e.g. "FOOTBALL"
 *   league     — partial match, e.g. "Liga Portugal"
 *   dateFrom   — ISO 8601 datetime string
 *   dateTo     — ISO 8601 datetime string
 *   minOdds    — minimum decimal odds on any selection (e.g. 1.50)
 *   maxOdds    — maximum decimal odds on any selection (e.g. 5.00)
 *   market     — market name, e.g. "1X2"
 *   status     — "UPCOMING" | "LIVE"
 *   page       — default 1
 *   limit      — default 20, max 100
 */
export async function getOddsFeedHandler(req: Request, res: Response): Promise<void> {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Parâmetros inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await getOddsFeed(parsed.data);
    ok(res, result.events, result.meta);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/odds/events/:eventId ────────────────────────────────────────────

/** Returns a single event with all active odds across all sites. */
export async function getEventHandler(req: Request, res: Response): Promise<void> {
  const { eventId } = req.params;
  if (!eventId) {
    res.status(400).json({ success: false, error: 'ID do evento em falta' });
    return;
  }

  try {
    const event = await getEventWithOdds(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'Evento não encontrado' });
      return;
    }
    ok(res, event);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/odds/live ───────────────────────────────────────────────────────

/** Returns all currently live events with their odds. */
export async function getLiveEventsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const events = await getLiveEvents();
    ok(res, events);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/odds/sites ──────────────────────────────────────────────────────

/** Returns all active betting sites. */
export async function getSitesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const sites = await getActiveSites();
    ok(res, sites);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/odds/sports ─────────────────────────────────────────────────────

/** Returns all distinct sports that have at least one non-cancelled event. */
export async function getSportsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const sports = await getAvailableSports();
    ok(res, sports);
  } catch (err) {
    fail(res, err);
  }
}

// ─── GET /api/odds/leagues ────────────────────────────────────────────────────

/**
 * Returns distinct leagues.
 * Optional query param: `sport` — filters leagues to a specific sport.
 */
export async function getLeaguesHandler(req: Request, res: Response): Promise<void> {
  const sportSchema = z.object({
    sport: z.nativeEnum(Sport).optional(),
  });

  const parsed = sportSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Parâmetro de desporto inválido',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const leagues = await getLeagues(parsed.data.sport);
    ok(res, leagues);
  } catch (err) {
    fail(res, err);
  }
}
