// Matches a bookmaker event to the ESPN match behind it, and builds the canonical event key.
// The pure part (matchEvent, eventKey, toCandidate*) never touches network or Redis;
// candidatesFor is the thin I/O part.

import { teamKey, teamNamesMatch } from '../marketResolutionEngine';
import { DayCache } from '../sportsData/itemMatch';
import { ESPN_FOOTBALL_LEAGUES, NATIONAL_TEAM_LEAGUES, fetchEspnFootballDay } from '../sportsData/espnFootball';
import { fetchEspnNbaDay, type BasketballMatch } from '../sportsData/espnBasketball';
import { fetchEspnTennisDay, type TennisMatch } from '../sportsData/espnTennis';
import { countryToPt } from '../../utils/countryNames';
import type { NormalizedMatch } from '../sportsData/types';
import type { OddsSport, SourceEvent } from './types';

/** An ESPN match reduced to what the matcher needs. */
export interface Candidate {
  providerMatchId: string;
  league: string | null;
  home: string;
  away: string;
  /** ISO 8601, UTC. */
  startsAt: string;
  /** When present, must equal the event's sport. */
  sport?: OddsSport;
}

/** Maximum kickoff difference between a house event and an ESPN match. */
export const MATCH_WINDOW_MS = 30 * 60_000;

/**
 * The ESPN match for a house event: same sport, kickoff within 30 min, both team names matching
 * (tennis also accepts swapped order). Several hits: the closest kickoff wins; a tie gives null.
 */
export function matchEvent(ev: SourceEvent, candidates: Candidate[]): Candidate | null {
  const t = Date.parse(ev.startsAt);
  if (Number.isNaN(t)) return null;
  const hits: Array<{ c: Candidate; diff: number }> = [];
  for (const c of candidates) {
    if (c.sport && c.sport !== ev.sport) continue;
    const diff = Math.abs(Date.parse(c.startsAt) - t);
    if (!(diff <= MATCH_WINDOW_MS)) continue;
    const straight = teamNamesMatch(ev.home, c.home) && teamNamesMatch(ev.away, c.away);
    const swapped = ev.sport === 'TENNIS' && teamNamesMatch(ev.home, c.away) && teamNamesMatch(ev.away, c.home);
    if (straight || swapped) hits.push({ c, diff });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.diff - b.diff);
  if (hits.length > 1 && hits[0]!.diff === hits[1]!.diff) return null;
  return hits[0]!.c;
}

/**
 * Canonical event key: `espn:{sport}:{id}` with a match; else `bet:{sport}:{betRadarId}`;
 * else `n:{sport}:{YYYY-MM-DDTHH}:{teamKey(home)}:{teamKey(away)}` (hour in UTC).
 */
export function eventKey(ev: SourceEvent, match: Candidate | null): string {
  if (match) return `espn:${ev.sport}:${match.providerMatchId}`;
  const radar = ev.extraIds?.betRadarId;
  if (radar) return `bet:${ev.sport}:${radar}`;
  const hour = new Date(ev.startsAt).toISOString().slice(0, 13);
  return `n:${ev.sport}:${hour}:${teamKey(ev.home)}:${teamKey(ev.away)}`;
}

/** Football match → candidate (national teams get their Portuguese names, as houses use them). */
export function footballCandidate(m: NormalizedMatch, leagueSlug: string | null): Candidate {
  const pt = leagueSlug != null && NATIONAL_TEAM_LEAGUES.has(leagueSlug);
  return {
    providerMatchId: m.providerMatchId, league: leagueSlug, sport: 'FOOTBALL', startsAt: m.kickoffAt,
    home: pt ? countryToPt(m.home.name) : m.home.name, away: pt ? countryToPt(m.away.name) : m.away.name,
  };
}

/** NBA game → candidate. */
export function basketballCandidate(m: BasketballMatch): Candidate {
  return { providerMatchId: m.providerMatchId, league: 'nba', sport: 'BASKETBALL', startsAt: m.startAt, home: m.home.name, away: m.away.name };
}

/** Singles tennis match → candidate (doubles are not compared). */
export function tennisCandidate(m: TennisMatch): Candidate | null {
  if (m.doubles) return null;
  return { providerMatchId: m.providerMatchId, league: m.tour, sport: 'TENNIS', startsAt: m.startAt, home: m.playerA, away: m.playerB };
}

/** ESPN matches of the given day and the next one, for one sport. Failed days yield nothing (DayCache). */
export async function candidatesFor(sport: OddsSport, dateIso: string, cache: DayCache = new DayCache()): Promise<Candidate[]> {
  const d0 = new Date(dateIso);
  const days = [0, 1].map((o) => new Date(d0.getTime() + o * 24 * 3600e3).toISOString().slice(0, 10));
  const out: Candidate[] = [];
  if (sport === 'FOOTBALL') {
    const leagues = Object.values(ESPN_FOOTBALL_LEAGUES);
    const lists = await Promise.all(days.flatMap((day) => leagues.map(async (lg) => {
      const list = await cache.get<NormalizedMatch[]>(`fb|${lg}|${day}`, () => fetchEspnFootballDay(lg, day));
      return list.map((m) => footballCandidate(m, lg));
    })));
    for (const l of lists) out.push(...l);
  } else if (sport === 'BASKETBALL') {
    // NBA lists games on the US date: a 01:00 UTC tip-off sits on the previous day.
    const nbaDays = [-1, 0, 1].map((o) => new Date(d0.getTime() + o * 24 * 3600e3).toISOString().slice(0, 10));
    for (const day of nbaDays) {
      const list = await cache.get<BasketballMatch[]>(`nba|${day}`, () => fetchEspnNbaDay(day));
      out.push(...list.map(basketballCandidate));
    }
  } else {
    for (const tour of ['atp', 'wta'] as const) {
      for (const day of days) {
        const list = await cache.get<TennisMatch[]>(`t|${tour}|${day}`, () => fetchEspnTennisDay(tour, day));
        for (const m of list) { const c = tennisCandidate(m); if (c) out.push(c); }
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(`${c.sport}|${c.providerMatchId}`) ? false : (seen.add(`${c.sport}|${c.providerMatchId}`), true)));
}
