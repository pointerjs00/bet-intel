// Finds the real match behind a boletim selection (ESPN: football, NBA, ATP/WTA) and returns its
// score and state, for the boletim detail and the team history. Cached per selection.

import { redis } from '../../utils/redis';
import { teamNamesMatch } from '../marketResolutionEngine';
import { countryToPt } from '../../utils/countryNames';
import { fetchEspnFootballDay, NATIONAL_TEAM_LEAGUES } from './espnFootball';
import { fetchEspnNbaDay } from './espnBasketball';
import { fetchEspnTennisDay } from './espnTennis';
import { espnLeagueFor } from './leagueMap';

export interface ItemMatch {
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';
  providerMatchId: string;
  /** ESPN league slug (football) — opens the match detail. */
  league: string | null;
  status: string;
  statusDetail: string;
  kickoffAt: string;
  home: string;
  away: string;
  score: { home: number; away: number } | null;
  halfTime: { home: number; away: number } | null;
  /** NBA quarters or tennis sets ("6-4 3-6 7-5"). */
  line: string | null;
}

export interface ItemRef {
  id: string;
  sport: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date | null;
  /** When the kickoff is unknown: the bet date, to search the following days. */
  anchor?: Date | null;
}

const days = (d: Date) => [d, new Date(d.getTime() - 24 * 3600e3), new Date(d.getTime() + 24 * 3600e3)].map((x) => x.toISOString().slice(0, 10));
const sameMatch = (a: string, b: string, home: string, away: string) =>
  (teamNamesMatch(a, home) && teamNamesMatch(b, away)) || (teamNamesMatch(a, away) && teamNamesMatch(b, home));

/** Memoises provider calls within one request (several selections often share a day). */
export class DayCache {
  private map = new Map<string, Promise<unknown>>();
  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.map.has(key)) this.map.set(key, load().catch(() => [] as unknown as T));
    return this.map.get(key) as Promise<T>;
  }
}

/** Days to search: around the kickoff, or from the day before the bet to 3 days after it. */
function searchDays(item: ItemRef): string[] {
  if (item.kickoffAt) return days(item.kickoffAt);
  const a = item.anchor!;
  return [-1, 0, 1, 2, 3].map((o) => new Date(a.getTime() + o * 24 * 3600e3).toISOString().slice(0, 10));
}

async function lookup(item: ItemRef, cache: DayCache): Promise<ItemMatch | null> {
  if (!item.kickoffAt && !item.anchor) return null;
  const when = item.kickoffAt ?? item.anchor!;
  // Unknown kickoff: any game of these teams from the bet date on (bets are placed before the game).
  const near = (iso: string) => item.kickoffAt
    ? Math.abs(new Date(iso).getTime() - when.getTime()) < 36 * 3600e3
    : new Date(iso).getTime() >= when.getTime() - 24 * 3600e3 && new Date(iso).getTime() <= when.getTime() + 4 * 24 * 3600e3;

  if (item.sport === 'FOOTBALL') {
    const league = espnLeagueFor(item.competition);
    if (!league) return null;
    for (const day of searchDays(item)) {
      const list = await cache.get(`fb|${league}|${day}`, () => fetchEspnFootballDay(league, day));
      const m = list.find((x) => near(x.kickoffAt) && sameMatch(x.home.name, x.away.name, item.homeTeam, item.awayTeam));
      if (m) {
        const pt = NATIONAL_TEAM_LEAGUES.has(league);
        return {
          sport: 'FOOTBALL', providerMatchId: m.providerMatchId, league, status: m.status, statusDetail: m.statusDetail, kickoffAt: m.kickoffAt,
          home: pt ? countryToPt(m.home.name) : m.home.name, away: pt ? countryToPt(m.away.name) : m.away.name,
          score: m.score, halfTime: m.halfTime, line: null,
        };
      }
    }
    return null;
  }

  if (item.sport === 'BASKETBALL') {
    for (const day of searchDays(item)) {
      const list = await cache.get(`nba|${day}`, () => fetchEspnNbaDay(day));
      const m = list.find((x) => near(x.startAt) && sameMatch(x.home.name, x.away.name, item.homeTeam, item.awayTeam));
      if (m) {
        return {
          sport: 'BASKETBALL', providerMatchId: m.providerMatchId, league: 'nba', status: m.status, statusDetail: m.statusDetail, kickoffAt: m.startAt,
          home: m.home.name, away: m.away.name, score: m.score, halfTime: null,
          line: m.periods.length ? m.periods.map((p) => `${p.home}-${p.away}`).join(' ') : null,
        };
      }
    }
    return null;
  }

  if (item.sport === 'TENNIS') {
    for (const tour of ['atp', 'wta'] as const) {
      for (const day of searchDays(item)) {
        const list = await cache.get(`t|${tour}|${day}`, () => fetchEspnTennisDay(tour, day));
        const m = list.find((x) => !x.doubles && near(x.startAt) && sameMatch(x.playerA, x.playerB, item.homeTeam, item.awayTeam));
        if (m) {
          const a = m.sets.filter((s) => s.a > s.b).length;
          const b = m.sets.filter((s) => s.b > s.a).length;
          return {
            sport: 'TENNIS', providerMatchId: m.providerMatchId, league: m.tour, status: m.status, statusDetail: m.round || m.statusDetail, kickoffAt: m.startAt,
            home: m.playerA, away: m.playerB, score: m.sets.length ? { home: a, away: b } : null, halfTime: null,
            line: m.sets.length ? m.sets.map((s) => `${s.a}-${s.b}`).join(' ') : null,
          };
        }
      }
    }
  }
  return null;
}

const DONE = new Set(['FINISHED', 'CANCELLED', 'POSTPONED', 'RETIRED', 'WALKOVER', 'ABANDONED']);

/** Real match for each selection (null when not found or not covered). Finished matches are cached for 30 days. */
export async function findItemMatches(items: ItemRef[], cache = new DayCache()): Promise<Record<string, ItemMatch | null>> {
  const out: Record<string, ItemMatch | null> = {};
  await Promise.all(items.map(async (item) => {
    const key = `itemmatch:${item.id}`;
    const hit = await redis.get(key).catch(() => null);
    if (hit) { out[item.id] = hit === 'none' ? null : (JSON.parse(hit) as ItemMatch); return; }
    const m = await lookup(item, cache).catch(() => null);
    out[item.id] = m;
    const ttl = !m ? 6 * 3600 : DONE.has(m.status) ? 30 * 24 * 3600 : 60;
    await redis.set(key, m ? JSON.stringify(m) : 'none', 'EX', ttl).catch(() => {});
  }));
  return out;
}
