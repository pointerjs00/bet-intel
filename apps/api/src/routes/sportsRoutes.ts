// Free sports data for the app's Jogos screen (redesign D8 / plan #60), served from ESPN
// through the normalised model and cached in Redis.
//   GET /api/sports/football/day?date=YYYY-MM-DD   → matches of the 11 followed competitions
//   GET /api/sports/football/match/:league/:id      → one match with stats and incidents

import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { teamNamesMatch } from '../services/marketResolutionEngine';
import { ESPN_FOOTBALL_LEAGUES, fetchEspnFootballDay, fetchEspnFootballMatch } from '../services/sportsData/espnFootball';
import type { NormalizedMatch } from '../services/sportsData/types';
import { getAssets } from '../services/sportsData/assetRegistry';
import { fetchEspnPreview } from '../services/sportsData/espnPreview';
import { getProviderHealth } from '../services/sportsData/providerHealth';

export const sportsRouter: Router = Router();
sportsRouter.use(authenticate);

/** Display order of the competitions on the Jogos screen. */
const LEAGUES = Object.entries(ESPN_FOOTBALL_LEAGUES).map(([name, slug]) => ({ name, slug }));

async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* cache is best-effort */ }
  const value = await load();
  redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch(() => {});
  return value;
}

/** Last result per data provider (plan #61). */
sportsRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({ success: true, data: await getProviderHealth() });
});

/** Crest and player-photo URLs by display name, collected from ESPN (see assetRegistry). */
sportsRouter.get('/assets', async (_req: Request, res: Response) => {
  res.json({ success: true, data: await getAssets() });
});

function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
}

sportsRouter.get('/football/day', async (req: Request, res: Response) => {
  const date = isValidDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  const isToday = date === new Date().toISOString().slice(0, 10);
  try {
    const groups = await Promise.all(LEAGUES.map(async (lg) => {
      const matches = await cached(`sports:fb:day:${lg.slug}:${date}`, isToday ? 60 : 600, () =>
        fetchEspnFootballDay(lg.slug, date).catch((err) => {
          logger.warn('[sports] ESPN day failed', { league: lg.slug, date, error: err instanceof Error ? err.message : String(err) });
          return [] as NormalizedMatch[];
        }));
      return { league: lg.name, slug: lg.slug, matches };
    }));

    // Flag matches the user has pending bets on.
    const dayStart = new Date(`${date}T00:00:00Z`).getTime();
    const pending = await prisma.boletinItem.findMany({
      where: {
        result: 'PENDING',
        sport: 'FOOTBALL',
        boletin: { userId: req.user!.sub },
        kickoffAt: { gte: new Date(dayStart - 12 * 3600e3), lte: new Date(dayStart + 36 * 3600e3) },
      },
      select: { homeTeam: true, awayTeam: true },
    });

    const data = groups
      .filter((g) => g.matches.length > 0)
      .map((g) => ({
        ...g,
        matches: g.matches.map((m) => ({
          ...m,
          incidents: [],
          hasBet: pending.some((p) => teamNamesMatch(p.homeTeam, m.home.name) && teamNamesMatch(p.awayTeam, m.away.name)),
        })),
      }));
    res.json({ success: true, data: { date, groups: data } });
  } catch (err) {
    logger.error('[sports] day failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ success: false, error: 'Não foi possível obter os jogos agora.' });
  }
});

/** Standings, last-5 form and head-to-head for one match (replaces the API-Football insights). */
sportsRouter.get('/football/preview/:league/:id', async (req: Request, res: Response) => {
  const { league, id } = req.params;
  if (!Object.values(ESPN_FOOTBALL_LEAGUES).includes(league!) || !/^\d+$/.test(id!)) {
    res.status(400).json({ success: false, error: 'Jogo inválido' });
    return;
  }
  try {
    const data = await cached(`sports:fb:preview:${league}:${id}`, 3 * 3600, () => fetchEspnPreview(league!, id!));
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[sports] preview failed', { league, id, error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ success: false, error: 'Não foi possível obter a antevisão agora.' });
  }
});

sportsRouter.get('/football/match/:league/:id', async (req: Request, res: Response) => {
  const { league, id } = req.params;
  if (!Object.values(ESPN_FOOTBALL_LEAGUES).includes(league!) || !/^\d+$/.test(id!)) {
    res.status(400).json({ success: false, error: 'Jogo inválido' });
    return;
  }
  try {
    const key = `sports:fb:match:${league}:${id}`;
    let match = await cached(key, 30, () => fetchEspnFootballMatch(league!, id!));
    // Finished matches don't change: keep them for a day.
    if (match?.status === 'FINISHED') redis.expire(key, 24 * 3600).catch(() => {});
    if (!match) {
      res.status(404).json({ success: false, error: 'Jogo não encontrado' });
      return;
    }
    const ourName = LEAGUES.find((l) => l.slug === league)?.name;
    match = {
      ...match,
      competition: { ...match.competition, name: ourName ?? match.competition.name },
      incidents: [...match.incidents].sort((a, b) => (a.clockSeconds ?? 0) - (b.clockSeconds ?? 0)),
    };
    res.json({ success: true, data: match });
  } catch (err) {
    logger.error('[sports] match failed', { league, id, error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ success: false, error: 'Não foi possível obter o jogo agora.' });
  }
});
