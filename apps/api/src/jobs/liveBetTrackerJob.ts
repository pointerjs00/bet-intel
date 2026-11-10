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
import { resolveMarket, teamNamesMatch, type FixtureResult } from '../services/marketResolutionEngine';
import { ESPN_FOOTBALL_LEAGUES, fetchEspnFootballDay, fetchEspnFootballMatch } from '../services/sportsData/espnFootball';
import { toFixtureResult } from '../services/sportsData/settlementBridge';
import type { NormalizedMatch } from '../services/sportsData/types';
import { fetchEspnTennisDay, toTennisResult, type TennisMatch } from '../services/sportsData/espnTennis';
import { resolveTennisMarket } from '../services/tennisMarketEngine';
import { createNotifications } from '../services/social/notificationService';
import { recomputeBoletinAfterItemChange } from '../services/boletins/boletinService';

const POLLS_PER_RUN = 3;
const POLL_INTERVAL_MS = 20_000;
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
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

/** Maps a competition name as stored on a boletim item to an ESPN league slug. */
export function espnLeagueFor(competition: string): string | null {
  const c = norm(competition);
  if (/\b(2\.?|ii)\b|liga 2|segunda|serie b|ligue 2|championship|primera rfef/.test(c)) return null;
  if (/liga portugal|primeira liga|liga betclic/.test(c)) return 'por.1';
  if (/premier league/.test(c) && !/russian|scottish|ukrain/.test(c)) return 'eng.1';
  if (/^la ?liga|laliga/.test(c)) return 'esp.1';
  if (/^bundesliga/.test(c)) return 'ger.1';
  if (/^serie a$|serie a italia|italian serie a/.test(c)) return 'ita.1';
  if (/^ligue 1/.test(c)) return 'fra.1';
  if (/eredivisie/.test(c)) return 'ned.1';
  if (/super lig/.test(c)) return 'tur.1';
  if (/champions league|liga dos campeoes/.test(c)) return 'uefa.champions';
  if (/europa league|liga europa/.test(c)) return 'uefa.europa';
  if (/conference league|liga conferencia/.test(c)) return 'uefa.europa.conf';
  const exact = ESPN_FOOTBALL_LEAGUES[competition];
  return exact ?? null;
}

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

async function trackOnce(): Promise<void> {
  await trackFootball();
  await trackTennis();
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

function tennisVerdict(item: TennisItem, m: TennisMatch): string | null {
  if (m.sets.length === 0) return null;
  // Provisional: treat the current leader in sets as the winner.
  const setsA = m.sets.filter((s) => s.a > s.b).length;
  const setsB = m.sets.filter((s) => s.b > s.a).length;
  const finished = m.status === 'FINISHED';
  const winner = m.winner ?? (setsA > setsB ? 'A' : setsB > setsA ? 'B' : null);
  if (!winner) return null;
  const r = resolveTennisMarket(item.market, item.selection, { status: 'FINISHED', sets: m.sets, winner }, tennisCtx(item, m));
  if (r === 'WON') return finished ? 'ganha' : 'a ganhar';
  if (r === 'LOST') return finished ? 'perdida' : 'a perder';
  return null;
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

  if (m.status === 'LIVE' && (!prev || prev.status === 'SCHEDULED') && await once(`notif:espn:t:${id}:start`)) {
    await notify(asGroup, fakeMatch, NotificationType.MATCH_STARTING, 'GOALS', `🎾 Começou: ${m.playerA} vs ${m.playerB}`,
      () => `${m.tournament.name} · ${m.round}`);
  }
  if (m.status === 'LIVE' && prev && m.sets.length > prev.sets && prev.sets > 0 && await once(`notif:espn:t:${id}:set:${prev.sets}`)) {
    const done = m.sets[prev.sets - 1]!;
    const who = done.a > done.b ? m.playerA : m.playerB;
    await notify(asGroup, fakeMatch, NotificationType.HALF_TIME, 'HALF_TIME', `🎾 ${who} ganhou o ${prev.sets}.º set`,
      (its) => `${m.playerA} ${score} ${m.playerB}${line(its as unknown as TennisItem[])}`);
  }

  await writeLiveItems(group.map((it) => ({ id: it.id, verdict: tennisVerdict(it, m) })), {
    status: m.status, detail: m.statusDetail, home: m.playerA, away: m.playerB, score: score || null, sport: 'TENNIS',
  });

  const result = toTennisResult(m);
  if (!result) return;
  if (m.status === 'FINISHED' && await once(`notif:espn:t:${id}:ft`)) {
    await notify(asGroup, fakeMatch, NotificationType.MATCH_FINISHED, 'MATCH_END', '🏁 Fim do encontro',
      (its) => `${m.playerA} ${score} ${m.playerB}${line(its as unknown as TennisItem[])}`);
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

/** Provisional verdict of a selection as if the match ended now. */
function liveVerdict(item: PendingItem, m: NormalizedMatch): 'a ganhar' | 'a perder' | null {
  if (!m.score) return null;
  const fixture: FixtureResult = {
    homeScore: m.score.home, awayScore: m.score.away,
    htHomeScore: m.halfTime?.home ?? null, htAwayScore: m.halfTime?.away ?? null,
    statusShort: 'FT', homeCorners: m.stats?.home.corners ?? null, awayCorners: m.stats?.away.corners ?? null,
  };
  const r = resolveMarket(item.market, item.selection, fixture, { homeNames: [item.homeTeam, m.home.name], awayNames: [item.awayTeam, m.away.name] });
  return r === 'WON' ? 'a ganhar' : r === 'LOST' ? 'a perder' : null;
}

function verdictLine(items: PendingItem[], m: NormalizedMatch): string {
  const finished = m.status === 'FINISHED';
  const parts = items.map((it) => {
    const v = liveVerdict(it, m);
    if (!v) return null;
    const label = finished ? (v === 'a ganhar' ? 'ganha' : 'perdida') : v;
    return `${it.selection} (${label})`;
  }).filter(Boolean);
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

async function notify(
  group: PendingItem[],
  m: NormalizedMatch,
  type: NotificationType,
  pref: string,
  title: string,
  body: (userItems: PendingItem[]) => string,
): Promise<void> {
  const byUser = new Map<string, PendingItem[]>();
  for (const it of group) byUser.set(it.boletin.userId, [...(byUser.get(it.boletin.userId) ?? []), it]);
  const inputs = [...byUser.entries()]
    .filter(([, its]) => (its[0]!.boletin.user.fixtureNotifPrefs ?? []).includes(pref))
    .map(([userId, its]) => ({
      userId, type, title, body: body(its),
      data: { boletinId: its[0]!.boletinId, espnMatchId: m.providerMatchId, type: String(type) },
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
      (its) => `${title}${verdictLine(its, m)}`);
  }

  if (m.status === 'HALFTIME' && prev?.status !== 'HALFTIME' && await once(`notif:espn:${id}:ht`)) {
    await notify(group, m, NotificationType.HALF_TIME, 'HALF_TIME', '🕐 Intervalo', (its) => `${title}${verdictLine(its, m)}`);
  }

  await writeLiveItems(group.map((it) => {
    const v = liveVerdict(it, m);
    return { id: it.id, verdict: v && m.status === 'FINISHED' ? (v === 'a ganhar' ? 'ganha' : 'perdida') : v };
  }), {
    status: m.status, detail: m.statusDetail, home: m.home.name, away: m.away.name,
    score: m.score ? `${m.score.home}-${m.score.away}` : null, sport: 'FOOTBALL',
  });

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
