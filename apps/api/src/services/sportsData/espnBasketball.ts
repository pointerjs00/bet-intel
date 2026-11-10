// ESPN public site API adapter for the NBA (no key).
//   https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD
// Dates are US (Eastern) game days: a 19:30 ET tip-off is 00:30 UTC the next day, so callers
// look at the kick-off day and the day before.

import { recordAssets } from './assetRegistry';
import { ProviderFormatError, tracked } from './providerHealth';

export type BasketballStatus = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export interface BasketballMatch {
  provider: 'espn';
  providerMatchId: string;
  league: 'nba';
  startAt: string;
  status: BasketballStatus;
  /** "Q3 4:21", "Halftime", "Final/OT". */
  statusDetail: string;
  home: { name: string; abbreviation: string; logo: string | null };
  away: { name: string; abbreviation: string; logo: string | null };
  /** Current or final score, overtime included. */
  score: { home: number; away: number } | null;
  /** Points per period (4 quarters, then overtimes). */
  periods: Array<{ home: number; away: number }>;
  /** Box score per player (only from the game summary). */
  players?: BasketballPlayer[] | null;
}

export interface BasketballPlayer {
  name: string;
  side: 'home' | 'away';
  played: boolean;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

interface RawBoxPlayers {
  team?: { id?: string };
  statistics?: Array<{ labels?: string[]; athletes?: Array<{ athlete?: { displayName?: string }; stats?: string[]; didNotPlay?: boolean }> }>;
}
type RawCompetition = NonNullable<RawEvent['competitions']>[number] & { date?: string };
interface RawSummary {
  header?: { competitions?: RawCompetition[] };
  boxscore?: { players?: RawBoxPlayers[] };
}

/** Player lines of an ESPN NBA box score. */
export function mapNbaPlayers(players: RawBoxPlayers[] | undefined, homeTeamId: string | undefined): BasketballPlayer[] | null {
  const out: BasketballPlayer[] = [];
  for (const team of players ?? []) {
    const side: 'home' | 'away' = team.team?.id === homeTeamId ? 'home' : 'away';
    const block = team.statistics?.[0];
    const labels = block?.labels ?? [];
    const col = (stats: string[], label: string) => stats[labels.indexOf(label)] ?? '';
    const n = (v: string) => Number(v.split('-')[0]) || 0; // "2-5" (made-attempted) → 2
    for (const a of block?.athletes ?? []) {
      const name = a.athlete?.displayName;
      if (!name) continue;
      const stats = a.stats ?? [];
      const minutes = col(stats, 'MIN');
      out.push({
        name,
        side,
        played: !a.didNotPlay && stats.length > 0 && minutes !== '0' && minutes !== '',
        points: n(col(stats, 'PTS')),
        rebounds: n(col(stats, 'REB')),
        assists: n(col(stats, 'AST')),
        threes: n(col(stats, '3PT')),
        steals: n(col(stats, 'STL')),
        blocks: n(col(stats, 'BLK')),
        turnovers: n(col(stats, 'TO')),
      });
    }
  }
  return out.length ? out : null;
}

interface RawCompetitor {
  id?: string;
  homeAway?: string;
  score?: string;
  team?: { id?: string; displayName?: string; abbreviation?: string; logo?: string };
  linescores?: Array<{ value?: number; displayValue?: string }>;
}
interface RawEvent {
  id?: string;
  date?: string;
  competitions?: Array<{
    status?: { type?: { name?: string; state?: string; completed?: boolean; shortDetail?: string } };
    competitors?: RawCompetitor[];
  }>;
}
interface RawScoreboard { events?: RawEvent[] }

export function mapBasketballStatus(t: { name?: string; state?: string; completed?: boolean } | undefined): BasketballStatus {
  const name = t?.name ?? '';
  if (/POSTPONED/.test(name)) return 'POSTPONED';
  if (/CANCEL/.test(name)) return 'CANCELLED';
  if (/HALFTIME/.test(name)) return 'HALFTIME';
  if (t?.state === 'in') return 'LIVE';
  if (t?.state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

export function mapEspnBasketballScoreboard(json: RawScoreboard): BasketballMatch[] {
  const out: BasketballMatch[] = [];
  for (const ev of json.events ?? []) {
    const comp = ev.competitions?.[0];
    const h = comp?.competitors?.find((c) => c.homeAway === 'home');
    const a = comp?.competitors?.find((c) => c.homeAway === 'away');
    if (!ev.id || !h?.team?.displayName || !a?.team?.displayName) continue;
    const status = mapBasketballStatus(comp?.status?.type);
    const hp = h.linescores ?? [];
    const ap = a.linescores ?? [];
    const started = status !== 'SCHEDULED' && status !== 'POSTPONED' && status !== 'CANCELLED';
    out.push({
      provider: 'espn',
      providerMatchId: ev.id,
      league: 'nba',
      startAt: new Date(ev.date ?? '').toISOString(),
      status,
      statusDetail: comp?.status?.type?.shortDetail ?? '',
      home: { name: h.team.displayName, abbreviation: h.team.abbreviation ?? '', logo: h.team.logo ?? null },
      away: { name: a.team.displayName, abbreviation: a.team.abbreviation ?? '', logo: a.team.logo ?? null },
      score: started ? { home: Number(h.score ?? 0), away: Number(a.score ?? 0) } : null,
      // The scoreboard gives `value`, the game summary only `displayValue`.
      periods: hp.map((p, i) => ({ home: p.value ?? (Number(p.displayValue) || 0), away: ap[i]?.value ?? (Number(ap[i]?.displayValue) || 0) })),
    });
  }
  return out;
}

/** One NBA game with its box score (for player props). */
export async function fetchEspnNbaGame(eventId: string): Promise<BasketballMatch | null> {
  const json = await tracked('espn-basketball', async () => {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(eventId)}`, {
      headers: { 'User-Agent': 'BetIntel/1.0 (personal use)', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ESPN NBA summary ${res.status}`);
    return (await res.json()) as RawSummary;
  });
  return mapEspnNbaSummary(json, eventId);
}

/** Maps an NBA game summary: the header gives score and status, the box score the players. */
export function mapEspnNbaSummary(json: RawSummary, eventId: string): BasketballMatch | null {
  const comp = json.header?.competitions?.[0];
  if (!comp) return null;
  const [m] = mapEspnBasketballScoreboard({ events: [{ id: eventId, date: comp.date, competitions: [comp] }] });
  if (!m) return null;
  const homeId = comp.competitors?.find((c) => c.homeAway === 'home')?.team?.id ?? comp.competitors?.find((c) => c.homeAway === 'home')?.id;
  return { ...m, players: mapNbaPlayers(json.boxscore?.players, homeId) };
}

/** NBA games of one US game day (YYYY-MM-DD). */
export async function fetchEspnNbaDay(date: string): Promise<BasketballMatch[]> {
  const json = await tracked('espn-basketball', async () => {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date.replace(/-/g, '')}`, {
      headers: { 'User-Agent': 'BetIntel/1.0 (personal use)', Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ESPN NBA ${res.status}`);
    const j = (await res.json()) as RawScoreboard;
    if (!Array.isArray(j.events)) throw new ProviderFormatError('ESPN NBA scoreboard without events[]');
    return j;
  });
  const matches = mapEspnBasketballScoreboard(json);
  const logos: Record<string, string> = {};
  for (const m of matches) {
    if (m.home.logo) logos[m.home.name] = m.home.logo.replace('/scoreboard/', '/');
    if (m.away.logo) logos[m.away.name] = m.away.logo.replace('/scoreboard/', '/');
  }
  recordAssets(logos, {});
  return matches;
}
