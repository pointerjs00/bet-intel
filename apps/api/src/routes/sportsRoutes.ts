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
import { ESPN_FOOTBALL_LEAGUES, NATIONAL_TEAM_LEAGUES, fetchEspnFootballDay, fetchEspnFootballMatch } from '../services/sportsData/espnFootball';
import { countryToPt } from '../utils/countryNames';
import { fetchEspnNbaDay } from '../services/sportsData/espnBasketball';
import { fetchEspnTennisDay } from '../services/sportsData/espnTennis';
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

/** National teams: ESPN's English names → Portuguese (what the app and bookmakers use). */
function toPtNames(m: NormalizedMatch): NormalizedMatch {
  return { ...m, home: { ...m.home, name: countryToPt(m.home.name) }, away: { ...m.away, name: countryToPt(m.away.name) } };
}

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
      return { league: lg.name, slug: lg.slug, matches: NATIONAL_TEAM_LEAGUES.has(lg.slug) ? matches.map(toPtNames) : matches };
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

/**
 * Simple match shape for basketball and tennis on the Jogos screen (football keeps its richer one).
 * `line` is the per-period detail: NBA quarters or tennis sets ("6-4 3-6 2-1").
 */
interface SimpleMatch {
  providerMatchId: string;
  kickoffAt: string;
  status: string;
  statusDetail: string;
  home: { name: string };
  away: { name: string };
  score: { home: number; away: number } | null;
  line: string | null;
  hasBet: boolean;
}

async function pendingNames(userId: string, sport: 'BASKETBALL' | 'TENNIS', date: string) {
  const dayStart = new Date(`${date}T00:00:00Z`).getTime();
  return prisma.boletinItem.findMany({
    where: {
      result: 'PENDING', sport, boletin: { userId },
      kickoffAt: { gte: new Date(dayStart - 12 * 3600e3), lte: new Date(dayStart + 36 * 3600e3) },
    },
    select: { homeTeam: true, awayTeam: true },
  });
}

const hasBetOn = (pending: Array<{ homeTeam: string; awayTeam: string }>, a: string, b: string) =>
  pending.some((p) => (teamNamesMatch(p.homeTeam, a) && teamNamesMatch(p.awayTeam, b)) || (teamNamesMatch(p.homeTeam, b) && teamNamesMatch(p.awayTeam, a)));

sportsRouter.get('/basketball/day', async (req: Request, res: Response) => {
  const date = isValidDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  const isToday = date === new Date().toISOString().slice(0, 10);
  try {
    const games = await cached(`sports:nba:day:${date}`, isToday ? 30 : 600, () => fetchEspnNbaDay(date));
    const pending = await pendingNames(req.user!.sub, 'BASKETBALL', date);
    const matches: SimpleMatch[] = games.map((g) => ({
      providerMatchId: g.providerMatchId,
      kickoffAt: g.startAt,
      status: g.status,
      statusDetail: g.statusDetail,
      home: { name: g.home.name },
      away: { name: g.away.name },
      score: g.score,
      line: g.periods.length ? g.periods.map((p) => `${p.home}-${p.away}`).join(' ') : null,
      hasBet: hasBetOn(pending, g.home.name, g.away.name),
    }));
    res.json({ success: true, data: { date, groups: matches.length ? [{ league: 'NBA', slug: 'nba', matches }] : [] } });
  } catch (err) {
    logger.error('[sports] nba day failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ success: false, error: 'Não foi possível obter os jogos agora.' });
  }
});

sportsRouter.get('/tennis/day', async (req: Request, res: Response) => {
  const date = isValidDate(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
  const isToday = date === new Date().toISOString().slice(0, 10);
  try {
    const [atp, wta] = await Promise.all((['atp', 'wta'] as const).map((tour) =>
      cached(`sports:tennis:day:${tour}:${date}`, isToday ? 60 : 900, () => fetchEspnTennisDay(tour, date).catch(() => []))));
    const pending = await pendingNames(req.user!.sub, 'TENNIS', date);
    // ESPN returns a tournament's whole draw on each day; keep the matches of the requested day.
    const sameDay = (iso: string) => iso.slice(0, 10) === date;
    const groups = new Map<string, { league: string; slug: string; matches: SimpleMatch[] }>();
    for (const m of [...(atp ?? []), ...(wta ?? [])]) {
      if (m.doubles || !sameDay(m.startAt) && m.status !== 'LIVE') continue;
      const slug = `${m.tour}-${m.tournament.providerId}`;
      const g = groups.get(slug) ?? { league: `${m.tour.toUpperCase()} · ${m.tournament.name}`, slug, matches: [] };
      const setsA = m.sets.filter((s) => s.a > s.b).length;
      const setsB = m.sets.filter((s) => s.b > s.a).length;
      g.matches.push({
        providerMatchId: m.providerMatchId,
        kickoffAt: m.startAt,
        status: m.status,
        statusDetail: m.round || m.statusDetail,
        home: { name: m.playerA },
        away: { name: m.playerB },
        score: m.sets.length ? { home: setsA, away: setsB } : null,
        line: m.sets.length ? m.sets.map((s) => `${s.a}-${s.b}`).join(' ') : null,
        hasBet: hasBetOn(pending, m.playerA, m.playerB),
      });
      groups.set(slug, g);
    }
    const data = [...groups.values()].map((g) => ({ ...g, matches: g.matches.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)) }));
    res.json({ success: true, data: { date, groups: data } });
  } catch (err) {
    logger.error('[sports] tennis day failed', { error: err instanceof Error ? err.message : String(err) });
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
    let data = await cached(`sports:fb:preview:${league}:${id}`, 3 * 3600, () => fetchEspnPreview(league!, id!));
    if (NATIONAL_TEAM_LEAGUES.has(league!)) {
      data = {
        ...data,
        standings: data.standings ? { ...data.standings, rows: data.standings.rows.map((r) => ({ ...r, team: countryToPt(r.team) })) } : null,
        h2h: data.h2h.map((g) => ({ ...g, home: countryToPt(g.home), away: countryToPt(g.away) })),
      };
    }
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
    if (NATIONAL_TEAM_LEAGUES.has(league!)) match = toPtNames(match);
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
