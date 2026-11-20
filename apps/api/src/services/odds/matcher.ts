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

const VARIANT_TOKENS = new Set([
  'b', 'ii', 'iii', 'w', 'women', 'feminino', 'feminina', 'fem', 'femenino', 'reserves', 'reservas', 'reserve', 'castilla', 'youth', 'juniores', 'junior',
]);
/** Words that make a name a different club when only one of the two names has them. */
const OTHER_CLUB_TOKENS = new Set(['miami', 'braga', 'city', 'united', 'utd', 'gijon', 'lisboa', 'madrid', 'milan', 'sporting', 'real', 'athletic', 'atletico', 'olympique']);
/**
 * English suffixes houses often drop ("Leeds" = "Leeds United", "Coventry" = "Coventry City"). They only
 * separate clubs when the rest of the name is a city with two clubs, so a side that differs only by them
 * is accepted when the other side matches without any conflict (a team never plays two games at once).
 */
const SUFFIX_CLUB_TOKENS = new Set(['city', 'united', 'utd']);
const NOISE_TOKENS = new Set(['fc', 'cf', 'sc', 'ac', 'sl', 'cp', 'sad', 'club', 'de', 'the', 'fk', 'sk']);

function plainTokens(name: string): string[] {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(?:u|sub)[\s-]?(\d{2})\b/g, 'u$1').replace(/[-–.&]/g, ' ');
  return n.split(/\s+/).filter(Boolean);
}
const isVariant = (t: string) => VARIANT_TOKENS.has(t) || /^u\d{2}$/.test(t);

/** True when two names that pass teamNamesMatch are really different teams (reserves, women, other club). */
export function variantConflict(a: string, b: string): boolean {
  return conflictOf(a, b) !== null;
}

/** 'variant' / 'club' for a real conflict, 'suffix' when the names differ only by city/united/utd, else null. */
function conflictOf(a: string, b: string): 'variant' | 'club' | 'suffix' | null {
  const ta = plainTokens(a), tb = plainTokens(b);
  const va = ta.filter(isVariant).sort().join(','), vb = tb.filter(isVariant).sort().join(',');
  if (va !== vb) return 'variant';
  const ra = new Set(ta.filter((t) => !isVariant(t) && !NOISE_TOKENS.has(t)));
  const rb = new Set(tb.filter((t) => !isVariant(t) && !NOISE_TOKENS.has(t)));
  const extra = (x: Set<string>, y: Set<string>) => [...x].filter((t) => !y.has(t));
  const ea = extra(ra, rb), eb = extra(rb, ra);
  // Only a name that adds words to the other can be another club.
  const added = ea.length && !eb.length ? ea : eb.length && !ea.length ? eb : [];
  if (added.some((t) => OTHER_CLUB_TOKENS.has(t) && !SUFFIX_CLUB_TOKENS.has(t))) return 'club';
  if (added.some((t) => SUFFIX_CLUB_TOKENS.has(t))) return 'suffix';
  return null;
}

/** 2 = same side, 1 = same side but for a dropped city/united/utd suffix, 0 = different. */
function sideScore(sport: OddsSport, a: string, b: string): 0 | 1 | 2 {
  if (!teamNamesMatch(a, b)) return 0;
  if (sport === 'TENNIS') return 2;
  const c = conflictOf(a, b);
  return c === null ? 2 : c === 'suffix' ? 1 : 0;
}

/** Both sides match, and at most one of them only through a dropped suffix. */
const samePair = (sport: OddsSport, h1: string, a1: string, h2: string, a2: string) => {
  const x = sideScore(sport, h1, h2);
  const y = sideScore(sport, a1, a2);
  return x > 0 && y > 0 && x + y >= 3;
};

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
    const straight = samePair(ev.sport, ev.home, ev.away, c.home, c.away);
    const swapped = ev.sport === 'TENNIS' && samePair(ev.sport, ev.home, ev.away, c.away, c.home);
    if (straight || swapped) hits.push({ c, diff });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.diff - b.diff);
  if (hits.length > 1 && hits[0]!.diff === hits[1]!.diff) return null;
  return hits[0]!.c;
}

/** The event's BetRadar id when it is a real one (houses send 0 / empty when they have none). */
export function radarOf(ev: SourceEvent): string | null {
  const r = ev.extraIds?.betRadarId;
  return r && /^[1-9]\d*$/.test(r) ? r : null;
}

/**
 * Canonical event key: `espn:{sport}:{id}` with a match; else `bet:{sport}:{betRadarId}`;
 * else `n:{sport}:{YYYY-MM-DD}:{teamKey(home)}:{teamKey(away)}` (UTC date; tennis sorts the players).
 * Null when there is no match, no BetRadar id and the start date is invalid.
 */
export function eventKey(ev: SourceEvent, match: Candidate | null): string | null {
  if (match) return `espn:${ev.sport}:${match.providerMatchId}`;
  const radar = radarOf(ev);
  if (radar) return `bet:${ev.sport}:${radar}`;
  const t = Date.parse(ev.startsAt);
  if (Number.isNaN(t)) return null;
  const day = new Date(t).toISOString().slice(0, 10);
  const keys = [teamKey(ev.home), teamKey(ev.away)];
  if (ev.sport === 'TENNIS') keys.sort();
  return `n:${ev.sport}:${day}:${keys[0]}:${keys[1]}`;
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
  if (Number.isNaN(d0.getTime())) return [];
  const days = (sport === 'FOOTBALL' ? [-1, 0, 1] : [0, 1]).map((o) => new Date(d0.getTime() + o * 24 * 3600e3).toISOString().slice(0, 10));
  const out: Candidate[] = [];
  if (sport === 'FOOTBALL') {
    const leagues = Object.values(ESPN_FOOTBALL_LEAGUES);
    const jobs = days.flatMap((day) => leagues.map((lg) => async () => {
      const list = await cache.get<NormalizedMatch[]>(`fb|${lg}|${day}`, () => fetchEspnFootballDay(lg, day));
      out.push(...list.map((m) => footballCandidate(m, lg)));
    }));
    // At most 5 league requests in flight (low-traffic rule).
    let next = 0;
    await Promise.all(Array.from({ length: 5 }, async () => { while (next < jobs.length) await jobs[next++]!(); }));
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
