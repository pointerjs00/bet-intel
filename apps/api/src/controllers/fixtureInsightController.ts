// apps/api/src/controllers/fixtureInsightController.ts
// Serves per-fixture insight data: stats, events, lineups, predictions.
// Also serves team-level player stats and top-cards leaderboard.

import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason } from '../utils/seasonUtils';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    logger.error('Fixture insight controller error', { error: err.message });
  }
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

// ─── GET /api/fixtures/:id/stats ─────────────────────────────────────────────

export async function fixtureStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const cacheKey = `fixture:stats:${id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const stats = await (prisma as any).fixtureStats.findUnique({ where: { fixtureId: id } });
    redis.setex(cacheKey, 3600, JSON.stringify(stats)).catch(() => {});
    ok(res, stats);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/:id/events ────────────────────────────────────────────

export async function fixtureEventsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const cacheKey = `fixture:events:${id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const events = await (prisma as any).fixtureEvent.findMany({
      where: { fixtureId: id },
      orderBy: [{ minute: 'asc' }, { extraMinute: 'asc' }],
    });
    redis.setex(cacheKey, 3600, JSON.stringify(events)).catch(() => {});
    ok(res, events);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/:id/lineups ───────────────────────────────────────────

export async function fixtureLineupsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const cacheKey = `fixture:lineups:${id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const lineups = await (prisma as any).fixtureLineup.findMany({ where: { fixtureId: id } });
    redis.setex(cacheKey, 3600, JSON.stringify(lineups)).catch(() => {});
    ok(res, lineups);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/:id/prediction ────────────────────────────────────────

export async function fixturePredictionHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const cacheKey = `fixture:prediction:${id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const prediction = await (prisma as any).fixturePrediction.findUnique({ where: { fixtureId: id } });
    redis.setex(cacheKey, 3600, JSON.stringify(prediction)).catch(() => {});
    ok(res, prediction);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/player-stats?team=<normKey>&league=<id>&season=<s> ────

export async function teamPlayerStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { team, league, season } = req.query as Record<string, string | undefined>;
    if (!team) { res.status(400).json({ success: false, error: 'team param required' }); return; }

    const resolvedSeason = season ?? getCurrentSeason();
    const teamNormKey = normaliseTeamName(team);
    const cacheKey = `players:${teamNormKey}:${league ?? 'all'}:${resolvedSeason}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const players = await (prisma as any).playerStat.findMany({
      where: {
        teamNormKey,
        season: resolvedSeason,
        ...(league ? { leagueId: parseInt(league, 10) } : {}),
      },
      orderBy: { rating: 'desc' },
    });

    redis.setex(cacheKey, 3600, JSON.stringify(players)).catch(() => {});
    ok(res, players);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/top-cards?league=<id>&season=<s>&limit=<n> ─────────────

export async function topCardsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { league, season, limit } = req.query as Record<string, string | undefined>;
    const resolvedSeason = season ?? getCurrentSeason();
    const take = Math.min(parseInt(limit ?? '20', 10), 50);

    const cacheKey = `topCards:${league ?? 'all'}:${resolvedSeason}:${take}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const players = await (prisma as any).playerStat.findMany({
      where: {
        season: resolvedSeason,
        ...(league ? { leagueId: parseInt(league, 10) } : {}),
      },
      orderBy: { yellowCards: 'desc' },
      take,
      select: {
        playerName: true, playerImageUrl: true,
        teamName: true, teamNormKey: true,
        leagueName: true, position: true,
        yellowCards: true, yellowRed: true, redCards: true,
        appearances: true,
      },
    });

    redis.setex(cacheKey, 3600, JSON.stringify(players)).catch(() => {});
    ok(res, players);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/venue/:apiId ──────────────────────────────────────────

export async function venueHandler(req: Request, res: Response): Promise<void> {
  try {
    const apiId = parseInt(req.params.apiId, 10);
    if (isNaN(apiId)) { res.status(400).json({ success: false, error: 'Invalid venue id' }); return; }

    const cacheKey = `venue:${apiId}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const venue = await (prisma as any).venue.findUnique({ where: { apiId } });
    redis.setex(cacheKey, 86400, JSON.stringify(venue)).catch(() => {});
    ok(res, venue);
  } catch (err) { fail(res, err); }
}

// ─── GET /api/fixtures/coach?team=<normKey> ───────────────────────────────────

export async function coachHandler(req: Request, res: Response): Promise<void> {
  try {
    const { team } = req.query as Record<string, string | undefined>;
    if (!team) { res.status(400).json({ success: false, error: 'team param required' }); return; }

    const teamNormKey = normaliseTeamName(team);
    const cacheKey = `coach:${teamNormKey}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) { ok(res, JSON.parse(cached)); return; }

    const coach = await (prisma as any).coach.findFirst({ where: { teamNormKey } });
    redis.setex(cacheKey, 3600, JSON.stringify(coach)).catch(() => {});
    ok(res, coach);
  } catch (err) { fail(res, err); }
}
