// apps/api/src/jobs/liveBetTrackerJob.ts
//
// Follows, through ESPN, only the football matches that have PENDING selections in someone's
// boletins (plans #54–#57). Every minute it polls three times (every ~20 s):
//  - links each pending selection to an ESPN match (cached in Redis, no schema change);
//  - notifies kick-off, goals (with "a tua aposta está a ganhar/perder"), half-time and full-time;
//  - settles the selections when ESPN reports the match finished (90' score, corners), or VOID when
//    cancelled; anything uncertain is flagged for review instead of guessed.

import { ItemResult, NotificationType } from '@prisma/client';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { assessLive, resolveMarket, teamNamesMatch, type FixtureResult } from '../services/marketResolutionEngine';
import { ESPN_FOOTBALL_LEAGUES, fetchEspnFootballDay, fetchEspnFootballMatch } from '../services/sportsData/espnFootball';
import { toFixtureResult, toLiveSnapshot } from '../services/sportsData/settlementBridge';
import type { NormalizedMatch } from '../services/sportsData/types';
import { fetchEspnTennisDay, toTennisResult, type TennisMatch } from '../services/sportsData/espnTennis';
import { assessTennisLive, resolveTennisMarket } from '../services/tennisMarketEngine';
import { fetchEspnNbaDay, fetchEspnNbaGame, type BasketballMatch } from '../services/sportsData/espnBasketball';
import { assessBasketballLive, resolveBasketballMarket } from '../services/basketballMarketEngine';
import { fetchLiveTennisPoints, findLivePoints, type LiveTennisPoints } from '../services/sportsData/livescoreTennis';

// One LiveScore request per ~15 s, shared by every live tennis match in a tracker pass.
let pointsCache: { at: number; list: Promise<LiveTennisPoints[]> } | null = null;
function liveTennisPoints(): Promise<LiveTennisPoints[]> {
  if (!pointsCache || Date.now() - pointsCache.at > 15_000) pointsCache = { at: Date.now(), list: fetchLiveTennisPoints() };
  return pointsCache.list;
}
import { createNotifications } from '../services/social/notificationService';
import { recomputeBoletinAfterItemChange } from '../services/boletins/boletinService';

const POLLS_PER_RUN = 3;
const POLL_INTERVAL_MS = 20_000;
// 5 days: a selection whose kickoff was filled late (or a delayed result) still gets settled.
const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000;
const LOOKAHEAD_MS = 15 * 60 * 1000;
const REF_TTL_S = 7 * 24 * 60 * 60;

type PendingItem = {
  id: string;
  boletinId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  selection: string;
  kickoffAt: Date | null;
  boletin: { userId: string; name: string | null; user: { fixtureNotifPrefs: string[] } };
};

interface MatchState { status: NormalizedMatch['status']; home: number | null; away: number | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export { espnLeagueFor } from '../services/sportsData/leagueMap';
import { espnLeagueFor } from '../services/sportsData/leagueMap';
import { findItemMatches } from '../services/sportsData/itemMatch';
import { getAssets } from '../services/sportsData/assetRegistry';
export async function liveBetTrackerJob(): Promise<void> {
  for (let i = 0; i < POLLS_PER_RUN; i++) {
    try {
      await trackOnce();
    } catch (err) {
      logger.warn('[liveBetTracker] poll failed', { error: err instanceof Error ? err.message : String(err) });
    }
    if (i < POLLS_PER_RUN - 1) await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Selections saved without a kickoff (quick log, some imports) were invisible to the tracker:
 * find their game from the bet date and store its kickoff, so they get tracked, notified and
 * settled like the rest. Runs at most once every 5 minutes.
 */
async function backfillKickoffs(): Promise<void> {
  if (!(await redis.set('tracker:backfill', '1', 'EX', 300, 'NX').catch(() => null))) return;
  const items = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      // No kickoff, or a kickoff still ahead (it may be wrong: e.g. a day off the real game).
      OR: [{ kickoffAt: null }, { kickoffAt: { gt: new Date(Date.now() + 15 * 60 * 1000), lt: new Date(Date.now() + 4 * 24 * 3600e3) } }],
      sport: { in: ['FOOTBALL', 'BASKETBALL', 'TENNIS'] },
      boletin: { status: 'PENDING', createdAt: { gte: new Date(Date.now() - 10 * 24 * 3600e3) } },
    },
    select: { id: true, sport: true, competition: true, homeTeam: true, awayTeam: true, kickoffAt: true, boletin: { select: { betDate: true, createdAt: true } } },
    take: 100,
  });
  if (!items.length) return;
  const found = await findItemMatches(items.map((i) => ({
    id: i.id, sport: String(i.sport), competition: i.competition, homeTeam: i.homeTeam, awayTeam: i.awayTeam,
    kickoffAt: null, anchor: i.boletin.betDate ?? i.boletin.createdAt,
  })));
  let n = 0;
  const stored = new Map(items.map((i) => [i.id, i.kickoffAt]));
  for (const [id, m] of Object.entries(found)) {
    if (!m) continue;
    const prev = stored.get(id);
    // Keep a stored kickoff that agrees with the game (within 2 h); fix it when it's off.
    if (prev && Math.abs(prev.getTime() - new Date(m.kickoffAt).getTime()) < 2 * 3600e3) continue;
    // Only overrule a future kickoff with a game that already started (not another, earlier meeting).
    if (prev && m.status === 'SCHEDULED') continue;
    await prisma.boletinItem.update({ where: { id }, data: { kickoffAt: new Date(m.kickoffAt) } }).catch(() => undefined);
    await redis.del(`itemmatch3:${id}`).catch(() => undefined);
    n++;
  }
  if (n) logger.info('[liveBetTracker] kickoff filled from the matched game', { count: n });
}

/**
 * Runs one tracking round now (in the background), at most once a minute: used when the app shows a
 * finished game whose selection is still pending, so it settles without waiting for the schedule.
 */
export async function settleSoon(): Promise<void> {
  if (!(await redis.set('tracker:settle-soon', '1', 'EX', 60, 'NX').catch(() => null))) return;
  trackOnce().catch((err) => logger.warn('[liveBetTracker] on-demand round failed', { error: err instanceof Error ? err.message : String(err) }));
}

async function trackOnce(): Promise<void> {
  await backfillKickoffs().catch((err) => logger.warn('[liveBetTracker] backfill failed', { error: err instanceof Error ? err.message : String(err) }));
  await trackFootball();
  await trackTennis();
  await trackBasketball();
}

// ─── Basketball (NBA) ────────────────────────────────────────────────────────

type BasketballItem = Omit<PendingItem, 'competition'>;

async function trackBasketball(): Promise<void> {
  const now = Date.now();
  const items: BasketballItem[] = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      sport: 'BASKETBALL',
      boletin: { status: 'PENDING' },
      kickoffAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now + LOOKAHEAD_MS) },
    },
    select: {
      id: true, boletinId: true, homeTeam: true, awayTeam: true, market: true, selection: true, kickoffAt: true,
      boletin: { select: { userId: true, name: true, user: { select: { fixtureNotifPrefs: true } } } },
    },
  });
  if (!items.length) return;

  const dayCache = new Map<string, BasketballMatch[]>();
  const nbaDay = async (day: string) => {
    if (!dayCache.has(day)) dayCache.set(day, await fetchEspnNbaDay(day).catch(() => []));
    return dayCache.get(day)!;
  };
  const byMatch = new Map<string, { match: BasketballMatch; items: BasketballItem[] }>();
  for (const item of items) {
    // ESPN uses US game days: a 00:30 UTC tip-off belongs to the previous date.
    const k = item.kickoffAt!;
    // Also the day after: a kickoff saved from the bet date can be a day off the US game day.
    // ESPN's US date can be the day before the UTC kickoff, and one more back covers a kickoff saved a day late.
    const days = [-2, -1, 0, 1].map((o) => new Date(k.getTime() + o * 24 * 3600e3).toISOString().slice(0, 10));
    let found: BasketballMatch | undefined;
    for (const day of days) {
      found = (await nbaDay(day)).find((m) =>
        teamNamesMatch(m.home.name, item.homeTeam) && teamNamesMatch(m.away.name, item.awayTeam)
        || teamNamesMatch(m.home.name, item.awayTeam) && teamNamesMatch(m.away.name, item.homeTeam));
      if (found) break;
    }
    if (!found) continue;
    const entry = byMatch.get(found.providerMatchId) ?? { match: found, items: [] };
    entry.items.push(item);
    byMatch.set(found.providerMatchId, entry);
  }
  for (const { match, items: group } of byMatch.values()) {
    // The game summary adds the box score (player props); the scoreboard is the fallback.
    const started = match.status !== 'SCHEDULED' && match.status !== 'POSTPONED' && match.status !== 'CANCELLED';
    const detailed = started ? await fetchEspnNbaGame(match.providerMatchId).catch(() => null) : null;
    await handleBasketballUpdate(detailed ?? match, group);
  }
}

function assessBasketball(item: BasketballItem, m: BasketballMatch) {
  if (!m.score) return { ifEndedNow: null, decided: null };
  // Quarters already over: all of them at the end, 2 at half time, all but the current one live.
  const completed = m.status === 'FINISHED' ? m.periods.length : m.status === 'HALFTIME' ? 2 : Math.max(0, m.periods.length - 1);
  const r = { ...m.score, periods: m.periods, players: m.players ?? null };
  const live = assessBasketballLive(item.market, item.selection, r, completed, { home: m.home.name, away: m.away.name });
  return m.status === 'FINISHED' ? { ifEndedNow: live.ifEndedNow, decided: live.ifEndedNow } : live;
}

function basketballVerdict(item: BasketballItem, m: BasketballMatch): string | null {
  return verdictOf(assessBasketball(item, m));
}

async function handleBasketballUpdate(m: BasketballMatch, group: BasketballItem[]): Promise<void> {
  const id = m.providerMatchId;
  const key = `espn:bstate:${id}`;
  const prev = await redis.get(key).catch(() => null);
  await redis.set(key, m.status, 'EX', 3 * 24 * 60 * 60).catch(() => {});
  const score = m.score ? `${m.score.home}-${m.score.away}` : null;
  const asGroup = group as unknown as PendingItem[];
  const fakeMatch = { providerMatchId: id } as NormalizedMatch;
  const bctx: GameCtx = { home: m.home.name, away: m.away.name, score, detail: m.statusDetail, sport: 'BASKETBALL' };
  const line = (its: PendingItem[]) => {
    const parts = (its as unknown as BasketballItem[]).map((it) => { const v = basketballVerdict(it, m); return v ? `${it.selection} (${v})` : null; }).filter(Boolean);
    return parts.length ? ` · ${parts.join(', ')}` : '';
  };

  if ((m.status === 'LIVE') && (!prev || prev === 'SCHEDULED') && await once(`notif:espn:b:${id}:start`)) {
    await notify(asGroup, fakeMatch, NotificationType.MATCH_STARTING, 'GOALS', `🏀 Começou: ${m.home.name} vs ${m.away.name}`, () => 'NBA', bctx);
  }
  if (m.status === 'HALFTIME' && prev !== 'HALFTIME' && await once(`notif:espn:b:${id}:ht`)) {
    await notify(asGroup, fakeMatch, NotificationType.HALF_TIME, 'HALF_TIME', '🏀 Intervalo', (its) => `${m.home.name} ${score ?? ''} ${m.away.name}${line(its)}`, bctx);
  }

  await writeLiveItems(group.map((it) => ({ id: it.id, verdict: basketballVerdict(it, m) })), {
    status: m.status, detail: m.statusDetail, home: m.home.name, away: m.away.name, score, sport: 'BASKETBALL',
  });
  if (m.status === 'LIVE' || m.status === 'HALFTIME') {
    await notifyDecided(group, id, `${m.home.name} ${score ?? ''} ${m.away.name}`, (it) => assessBasketball(it, m).decided);
  }

  const touched = new Set<string>();
  if (m.status === 'CANCELLED') {
    for (const item of group) {
      const u = await prisma.boletinItem.updateMany({ where: { id: item.id, result: 'PENDING' }, data: { result: 'VOID', needsReview: false } });
      if (u.count) touched.add(item.boletinId);
    }
  } else if (m.status === 'POSTPONED') {
    await prisma.boletinItem.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { needsReview: true } });
  } else if (m.status === 'FINISHED' && m.score) {
    if (await once(`notif:espn:b:${id}:ft`)) {
      await notify(asGroup, fakeMatch, NotificationType.MATCH_FINISHED, 'MATCH_END', '🏁 Fim do jogo', (its) => `${m.home.name} ${score} ${m.away.name}${line(its)}`, bctx);
    }
    for (const item of group) {
      const res = resolveBasketballMarket(item.market, item.selection, { ...m.score, periods: m.periods, players: m.players ?? null }, { home: m.home.name, away: m.away.name });
      if (res === null) {
        await prisma.boletinItem.update({ where: { id: item.id }, data: { needsReview: true } });
        continue;
      }
      const u = await prisma.boletinItem.updateMany({ where: { id: item.id, result: 'PENDING' }, data: { result: res as ItemResult, needsReview: false } });
      if (u.count) touched.add(item.boletinId);
    }
  }
  for (const boletinId of touched) {
    await recomputeBoletinAfterItemChange(boletinId).catch((err) =>
      logger.warn('[liveBetTracker] recompute failed', { boletinId, error: err instanceof Error ? err.message : String(err) }));
  }
}

// ─── Tennis ──────────────────────────────────────────────────────────────────

type TennisItem = Omit<PendingItem, 'competition'>;

async function trackTennis(): Promise<void> {
  const now = Date.now();
  const items: TennisItem[] = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      sport: 'TENNIS',
      boletin: { status: 'PENDING' },
      kickoffAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now + LOOKAHEAD_MS) },
    },
    select: {
      id: true, boletinId: true, homeTeam: true, awayTeam: true, market: true, selection: true, kickoffAt: true,
      boletin: { select: { userId: true, name: true, user: { select: { fixtureNotifPrefs: true } } } },
    },
  });
  if (!items.length) return;

  const dayCache = new Map<string, TennisMatch[]>();
  const byMatch = new Map<string, { match: TennisMatch; items: TennisItem[] }>();
  for (const item of items) {
    const match = await findTennisMatch(item, dayCache);
    if (!match) continue;
    const entry = byMatch.get(match.providerMatchId) ?? { match, items: [] };
    entry.items.push(item);
    byMatch.set(match.providerMatchId, entry);
  }

  for (const { match: m, items: group } of byMatch.values()) {
    await handleTennisUpdate(m, group);
  }
}

async function tennisDay(tour: 'atp' | 'wta', day: string, cache: Map<string, TennisMatch[]>): Promise<TennisMatch[]> {
  const key = `${tour}|${day}`;
  if (!cache.has(key)) cache.set(key, await fetchEspnTennisDay(tour, day).catch(() => []));
  return cache.get(key)!;
}

async function findTennisMatch(item: TennisItem, cache: Map<string, TennisMatch[]>): Promise<TennisMatch | null> {
  const refKey = `espn:tref:${item.id}`;
  const cached = await redis.get(refKey).catch(() => null);
  const kickoff = item.kickoffAt!;
  const days = [kickoff, new Date(kickoff.getTime() - 24 * 60 * 60 * 1000)].map((d) => d.toISOString().slice(0, 10));
  for (const tour of ['atp', 'wta'] as const) {
    for (const day of days) {
      const found = (await tennisDay(tour, day, cache)).find((m) => {
        if (cached) return m.providerMatchId === cached;
        const direct = teamNamesMatch(m.playerA, item.homeTeam) && teamNamesMatch(m.playerB, item.awayTeam);
        const swapped = teamNamesMatch(m.playerA, item.awayTeam) && teamNamesMatch(m.playerB, item.homeTeam);
        return direct || swapped;
      });
      if (found) {
        if (!cached) await redis.set(refKey, found.providerMatchId, 'EX', REF_TTL_S).catch(() => {});
        return found;
      }
    }
  }
  return null;
}

function tennisCtx(item: TennisItem, m: TennisMatch) {
  void item;
  return { playerA: [m.playerA], playerB: [m.playerB] };
}

function assessTennis(item: TennisItem, m: TennisMatch) {
  if (m.sets.length === 0) return { ifEndedNow: null, decided: null };
  if (m.status === 'FINISHED' && m.winner) {
    const r = resolveTennisMarket(item.market, item.selection, { status: 'FINISHED', sets: m.sets, winner: m.winner }, tennisCtx(item, m));
    return { ifEndedNow: r, decided: r };
  }
  // Live: the last set in the list is the one being played.
  return assessTennisLive(item.market, item.selection, m.sets, false, tennisCtx(item, m));
}

function tennisVerdict(item: TennisItem, m: TennisMatch): string | null {
  return verdictOf(assessTennis(item, m));
}

async function handleTennisUpdate(m: TennisMatch, group: TennisItem[]): Promise<void> {
  const key = `espn:tstate:${m.providerMatchId}`;
  const prevRaw = await redis.get(key).catch(() => null);
  const prev = prevRaw ? (JSON.parse(prevRaw) as { status: string; sets: number }) : null;
  await redis.set(key, JSON.stringify({ status: m.status, sets: m.sets.length }), 'EX', 3 * 24 * 60 * 60).catch(() => {});
  const id = m.providerMatchId;
  const score = m.sets.map((s) => `${s.a}-${s.b}`).join(' ');
  const line = (its: TennisItem[]) => {
    const parts = its.map((it) => { const v = tennisVerdict(it, m); return v ? `${it.selection} (${v})` : null; }).filter(Boolean);
    return parts.length ? ` · ${parts.join(', ')}` : '';
  };
  const asGroup = group as unknown as PendingItem[];
  const fakeMatch = { providerMatchId: id } as NormalizedMatch;
  const tctx: GameCtx = { home: m.playerA, away: m.playerB, score: score || null, detail: m.round || m.statusDetail, sport: 'TENNIS' };

  if (m.status === 'LIVE' && (!prev || prev.status === 'SCHEDULED') && await once(`notif:espn:t:${id}:start`)) {
    await notify(asGroup, fakeMatch, NotificationType.MATCH_STARTING, 'GOALS', `🎾 Começou: ${m.playerA} vs ${m.playerB}`,
      () => `${m.tournament.name} · ${m.round}`, tctx);
  }
  if (m.status === 'LIVE' && prev && m.sets.length > prev.sets && prev.sets > 0 && await once(`notif:espn:t:${id}:set:${prev.sets}`)) {
    const done = m.sets[prev.sets - 1]!;
    const who = done.a > done.b ? m.playerA : m.playerB;
    await notify(asGroup, fakeMatch, NotificationType.HALF_TIME, 'HALF_TIME', `🎾 ${who} ganhou o ${prev.sets}.º set`,
      (its) => `${m.playerA} ${score} ${m.playerB}${line(its as unknown as TennisItem[])}`, tctx);
  }

  // Plan #59: points of the game in progress and the server come from LiveScore (ESPN has sets only).
  let liveScore = score;
  let liveDetail = m.statusDetail;
  if (m.status === 'LIVE') {
    const pts = findLivePoints(await liveTennisPoints(), m.playerA, m.playerB);
    if (pts) {
      if (pts.pointsA !== null && pts.pointsB !== null) liveScore = `${score} (${pts.pointsA}-${pts.pointsB})`.trim();
      if (pts.server) liveDetail = `${m.statusDetail} · serve ${pts.server === 'A' ? m.playerA : m.playerB}`;
    }
  }

  await writeLiveItems(group.map((it) => ({ id: it.id, verdict: tennisVerdict(it, m) })), {
    status: m.status, detail: liveDetail, home: m.playerA, away: m.playerB, score: liveScore || null, sport: 'TENNIS',
  });
  if (m.status === 'LIVE') {
    await notifyDecided(group as unknown as PendingItem[], id, `${m.playerA} ${score} ${m.playerB}`, (it) => assessTennis(it as unknown as TennisItem, m).decided);
  }

  const result = toTennisResult(m);
  if (!result) return;
  if (m.status === 'FINISHED' && await once(`notif:espn:t:${id}:ft`)) {
    await notify(asGroup, fakeMatch, NotificationType.MATCH_FINISHED, 'MATCH_END', '🏁 Fim do encontro',
      (its) => `${m.playerA} ${score} ${m.playerB}${line(its as unknown as TennisItem[])}`, tctx);
  }

  const touched = new Set<string>();
  for (const item of group) {
    const resolution = resolveTennisMarket(item.market, item.selection, result, tennisCtx(item, m));
    if (resolution === null) {
      await prisma.boletinItem.update({ where: { id: item.id }, data: { needsReview: true } });
      continue;
    }
    const updated = await prisma.boletinItem.updateMany({
      where: { id: item.id, result: 'PENDING' },
      data: { result: resolution as ItemResult, needsReview: false },
    });
    if (updated.count) touched.add(item.boletinId);
  }
  for (const boletinId of touched) {
    await recomputeBoletinAfterItemChange(boletinId).catch((err) =>
      logger.warn('[liveBetTracker] recompute failed', { boletinId, error: err instanceof Error ? err.message : String(err) }));
  }
}

// ─── Football ────────────────────────────────────────────────────────────────

async function trackFootball(): Promise<void> {
  const now = Date.now();
  const items: PendingItem[] = await prisma.boletinItem.findMany({
    where: {
      result: 'PENDING',
      sport: 'FOOTBALL',
      boletin: { status: 'PENDING' },
      kickoffAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now + LOOKAHEAD_MS) },
    },
    select: {
      id: true, boletinId: true, homeTeam: true, awayTeam: true, competition: true, market: true, selection: true, kickoffAt: true,
      boletin: { select: { userId: true, name: true, user: { select: { fixtureNotifPrefs: true } } } },
    },
  });
  if (!items.length) return;

  // Group selections by match.
  const groups = new Map<string, PendingItem[]>();
  for (const item of items) {
    const league = espnLeagueFor(item.competition);
    if (!league || !item.kickoffAt) continue;
    const key = `${league}|${item.kickoffAt.toISOString().slice(0, 10)}|${norm(item.homeTeam)}|${norm(item.awayTeam)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  // Resolve each name-group to an ESPN match, then merge groups that point to the same match
  // (e.g. "Brighton" and "Brighton & Hove Albion" written differently on two boletins).
  const dayCache = new Map<string, NormalizedMatch[]>();
  const byMatch = new Map<string, { league: string; ref: string; items: PendingItem[] }>();
  for (const [key, group] of groups) {
    const [league] = key.split('|') as [string];
    const ref = await resolveEspnRef(key, league, group[0]!, dayCache);
    if (!ref) continue;
    const entry = byMatch.get(`${league}|${ref}`) ?? { league, ref, items: [] };
    entry.items.push(...group);
    byMatch.set(`${league}|${ref}`, entry);
  }

  for (const { league, ref, items: group } of byMatch.values()) {
    const kickoff = Math.min(...group.map((it) => it.kickoffAt!.getTime()));
    if (kickoff > now + 2 * 60 * 1000) continue; // not started yet
    const match = await fetchEspnFootballMatch(league, ref);
    if (!match) continue;
    await handleMatchUpdate(match, group);
  }
}

async function resolveEspnRef(key: string, league: string, sample: PendingItem, dayCache: Map<string, NormalizedMatch[]>): Promise<string | null> {
  const cached = await redis.get(`espn:ref:${key}`).catch(() => null);
  if (cached) return cached === 'none' ? null : cached;

  const kickoff = sample.kickoffAt!;
  // ESPN days are US-based: also look at the previous day for late kick-offs.
  const days = [kickoff, new Date(kickoff.getTime() - 24 * 60 * 60 * 1000)].map((d) => d.toISOString().slice(0, 10));
  for (const day of days) {
    const ck = `${league}|${day}`;
    if (!dayCache.has(ck)) dayCache.set(ck, await fetchEspnFootballDay(league, day).catch(() => []));
    const found = dayCache.get(ck)!.find((m) =>
      teamNamesMatch(m.home.name, sample.homeTeam) && teamNamesMatch(m.away.name, sample.awayTeam)
      && Math.abs(new Date(m.kickoffAt).getTime() - kickoff.getTime()) < 3 * 60 * 60 * 1000);
    if (found) {
      await redis.set(`espn:ref:${key}`, found.providerMatchId, 'EX', REF_TTL_S).catch(() => {});
      return found.providerMatchId;
    }
  }
  // Remember misses for an hour so unknown matches don't cost a request every poll.
  await redis.set(`espn:ref:${key}`, 'none', 'EX', 60 * 60).catch(() => {});
  return null;
}

/** Live state per selection, read by GET /api/boletins/live (app "A decorrer" section). */
export const LIVE_ITEM_KEY = (itemId: string) => `live:item:${itemId}`;

async function writeLiveItems(
  items: Array<{ id: string; verdict: string | null }>,
  match: { status: string; detail: string; home: string; away: string; score: string | null; sport: string },
): Promise<void> {
  const at = new Date().toISOString();
  await Promise.all(items.map((it) => redis.set(LIVE_ITEM_KEY(it.id), JSON.stringify({ ...match, verdict: it.verdict, updatedAt: at }), 'EX', 4 * 60 * 60).catch(() => {})));
}

async function once(key: string): Promise<boolean> {
  const ok = await redis.set(key, '1', 'EX', 3 * 24 * 60 * 60, 'NX').catch(() => null);
  return ok === 'OK';
}

export type Verdict = 'ganha' | 'perdida' | 'a ganhar' | 'a perder';

/** "ganha"/"perdida" once nothing can change it, otherwise "a ganhar"/"a perder" as if it ended now. */
export function verdictOf(a: { ifEndedNow: string | null; decided: string | null }): Verdict | null {
  if (a.decided === 'WON') return 'ganha';
  if (a.decided === 'LOST') return 'perdida';
  if (a.ifEndedNow === 'WON') return 'a ganhar';
  if (a.ifEndedNow === 'LOST') return 'a perder';
  return null;
}

/** Live assessment of a football selection from the current match (score, stats, scorers, cards). */
function assessFootball(item: PendingItem, m: NormalizedMatch) {
  const live = toLiveSnapshot(m);
  if (!live) return { ifEndedNow: null, decided: null };
  return assessLive(item.market, item.selection, live.fixture, live.phase, { homeNames: [item.homeTeam, m.home.name], awayNames: [item.awayTeam, m.away.name] });
}

function liveVerdict(item: PendingItem, m: NormalizedMatch): Verdict | null {
  return verdictOf(assessFootball(item, m));
}

function verdictLine(items: PendingItem[], m: NormalizedMatch): string {
  const parts = items.map((it) => {
    const v = liveVerdict(it, m);
    return v ? `${v === 'a ganhar' || v === 'ganha' ? '✅' : '❌'} ${it.selection}: ${v}` : null;
  }).filter(Boolean);
  return parts.length ? ' · ' + parts.join(' · ') : '';
}

/**
 * Tells the user, once per selection, when a bet is decided before the end
 * ("Mais de 2,5 golos já está ganha", "Gyökeres marcou: seleção ganha").
 */
async function notifyDecided<T extends { id: string; selection: string; boletinId: string; boletin: PendingItem['boletin'] }>(
  group: T[],
  matchId: string,
  scoreLine: string,
  decidedOf: (it: T) => string | null,
): Promise<void> {
  const fresh: Array<{ it: T; won: boolean }> = [];
  for (const it of group) {
    const d = decidedOf(it);
    if ((d === 'WON' || d === 'LOST') && await once(`notif:decided:${it.id}`)) fresh.push({ it, won: d === 'WON' });
  }
  if (!fresh.length) return;
  const byUser = new Map<string, typeof fresh>();
  for (const f of fresh) byUser.set(f.it.boletin.userId, [...(byUser.get(f.it.boletin.userId) ?? []), f]);
  const inputs = [...byUser.entries()]
    .filter(([, fs]) => (fs[0]!.it.boletin.user.fixtureNotifPrefs ?? []).includes('GOALS'))
    .map(([userId, fs]) => {
      const won = fs.filter((f) => f.won);
      const lost = fs.filter((f) => !f.won);
      const title = won.length && !lost.length ? `✅ ${won.length === 1 ? 'Seleção ganha' : `${won.length} seleções ganhas`} antes do fim`
        : lost.length && !won.length ? `❌ ${lost.length === 1 ? 'Seleção perdida' : `${lost.length} seleções perdidas`}`
          : '⚖️ Seleções decididas';
      const body = `${fs.map((f) => `${f.it.selection} (${f.won ? 'ganha' : 'perdida'})`).join(', ')} · ${scoreLine}`;
      return { userId, type: NotificationType.BOLETIN_RESULT, title, body, data: { boletinId: fs[0]!.it.boletinId, espnMatchId: matchId, type: 'BET_DECIDED' } };
    });
  if (inputs.length) await createNotifications(inputs);
}

/** Game data sent with every live notification: shown in the app list with the crests. */
interface GameCtx { home: string; away: string; score: string | null; detail: string; sport: string }

let crestCache: { at: number; teams: Record<string, string>; players: Record<string, string> } | null = null;
async function crests(): Promise<{ teams: Record<string, string>; players: Record<string, string> }> {
  if (!crestCache || Date.now() - crestCache.at > 10 * 60_000) crestCache = { at: Date.now(), ...(await getAssets().catch(() => ({ teams: {}, players: {} }))) };
  return crestCache;
}

async function notify(
  group: PendingItem[],
  m: NormalizedMatch,
  type: NotificationType,
  pref: string,
  title: string,
  body: (userItems: PendingItem[]) => string,
  ctx?: GameCtx,
): Promise<void> {
  const game = ctx ?? (m.home ? { home: m.home.name, away: m.away.name, score: m.score ? `${m.score.home}-${m.score.away}` : null, detail: m.statusDetail, sport: 'FOOTBALL' } : null);
  const a = game ? await crests() : null;
  const logo = (n: string) => a?.teams[n] ?? a?.players[n] ?? null;
  const gameData = game ? { ...game, homeLogo: logo(game.home), awayLogo: logo(game.away), image: logo(game.home) ?? logo(game.away) } : {};
  const byUser = new Map<string, PendingItem[]>();
  for (const it of group) byUser.set(it.boletin.userId, [...(byUser.get(it.boletin.userId) ?? []), it]);
  const inputs = [...byUser.entries()]
    .filter(([, its]) => (its[0]!.boletin.user.fixtureNotifPrefs ?? []).includes(pref))
    .map(([userId, its]) => ({
      userId, type, title, body: body(its),
      data: { boletinId: its[0]!.boletinId, espnMatchId: m.providerMatchId, type: String(type), ...Object.fromEntries(Object.entries(gameData).filter(([, v]) => v != null)) },
    }));
  if (inputs.length) await createNotifications(inputs);
}

async function handleMatchUpdate(m: NormalizedMatch, group: PendingItem[]): Promise<void> {
  const stateKey = `espn:state:${m.providerMatchId}`;
  const prevRaw = await redis.get(stateKey).catch(() => null);
  const prev: MatchState | null = prevRaw ? (JSON.parse(prevRaw) as MatchState) : null;
  const next: MatchState = { status: m.status, home: m.score?.home ?? null, away: m.score?.away ?? null };
  await redis.set(stateKey, JSON.stringify(next), 'EX', 3 * 24 * 60 * 60).catch(() => {});
  const id = m.providerMatchId;
  const title = `${m.home.name} ${next.home ?? 0}–${next.away ?? 0} ${m.away.name}`;

  const isLive = m.status === 'LIVE' || m.status === 'HALFTIME';
  if (isLive && (!prev || prev.status === 'SCHEDULED') && await once(`notif:espn:${id}:start`)) {
    await notify(group, m, NotificationType.MATCH_STARTING, 'GOALS', `Começou: ${m.home.name} vs ${m.away.name}`,
      (its) => `Tens ${its.length} seleç${its.length === 1 ? 'ão' : 'ões'} neste jogo.`);
  }

  if (prev && next.home !== null && next.away !== null && prev.home !== null && prev.away !== null
      && (next.home > prev.home || next.away > prev.away)
      && await once(`notif:espn:${id}:goal:${next.home}-${next.away}`)) {
    const scorer = next.home > prev.home ? m.home.name : m.away.name;
    const lastGoal = [...m.incidents].reverse().find((i) => /GOAL/.test(i.type) && i.type !== 'PENALTY_MISSED');
    await notify(group, m, NotificationType.GOAL_SCORED, 'GOALS', `⚽ Golo! ${scorer}${lastGoal?.minute ? ` (${lastGoal.minute})` : ''}`,
      (its) => `${title}${m.statusDetail ? ` · ${m.statusDetail}` : ''}${verdictLine(its, m)}`);
  }

  if (m.status === 'HALFTIME' && prev?.status !== 'HALFTIME' && await once(`notif:espn:${id}:ht`)) {
    await notify(group, m, NotificationType.HALF_TIME, 'HALF_TIME', '🕐 Intervalo', (its) => `${title}${verdictLine(its, m)}`);
  }

  // Red cards (preference RED_CARD), once per card.
  if (isLive) {
    const reds = m.incidents.filter((i) => i.type === 'RED' || i.type === 'SECOND_YELLOW');
    for (const red of reds) {
      if (!(await once(`notif:espn:${id}:red:${red.player ?? ''}:${red.minute}`))) continue;
      const team = red.side === 'home' ? m.home.name : red.side === 'away' ? m.away.name : '';
      await notify(group, m, NotificationType.RED_CARD, 'RED_CARD', `🟥 Vermelho${red.player ? `: ${red.player}` : ''}${red.minute ? ` (${red.minute})` : ''}`,
        (its) => `${team ? `${team} · ` : ''}${title}${verdictLine(its, m)}`);
    }
  }

  await writeLiveItems(group.map((it) => ({ id: it.id, verdict: liveVerdict(it, m) })), {
    status: m.status, detail: m.statusDetail, home: m.home.name, away: m.away.name,
    score: m.score ? `${m.score.home}-${m.score.away}` : null, sport: 'FOOTBALL',
  });

  // Bets decided before the final whistle (an over line passed, a scorer who scored…).
  if (isLive) await notifyDecided(group, id, title, (it) => assessFootball(it, m).decided);

  const fixture = toFixtureResult(m);
  if (!fixture) return; // still playing or scheduled

  if (m.status === 'FINISHED' && await once(`notif:espn:${id}:ft`)) {
    await notify(group, m, NotificationType.MATCH_FINISHED, 'MATCH_END', '🏁 Fim do jogo', (its) => `${title}${verdictLine(its, m)}`);
  }
  await settleGroup(group, m, fixture);
}

async function settleGroup(group: PendingItem[], m: NormalizedMatch, fixture: FixtureResult): Promise<void> {
  const touched = new Set<string>();
  for (const item of group) {
    const resolution = resolveMarket(item.market, item.selection, fixture, {
      homeNames: [item.homeTeam, m.home.name], awayNames: [item.awayTeam, m.away.name],
    });
    if (resolution === null) {
      await prisma.boletinItem.update({ where: { id: item.id }, data: { needsReview: true } });
      continue;
    }
    // Only settle if still pending (another job may have done it meanwhile).
    const updated = await prisma.boletinItem.updateMany({
      where: { id: item.id, result: 'PENDING' },
      data: { result: resolution as ItemResult, needsReview: false },
    });
    if (updated.count) touched.add(item.boletinId);
  }
  for (const boletinId of touched) {
    await recomputeBoletinAfterItemChange(boletinId).catch((err) =>
      logger.warn('[liveBetTracker] recompute failed', { boletinId, error: err instanceof Error ? err.message : String(err) }));
  }
  if (touched.size) logger.info(`[liveBetTracker] settled ${m.home.name} v ${m.away.name}: ${touched.size} boletins updated`);
}
