// ESPN public site API adapter for football (no key). See ESTUDO_FONTES_DADOS.md.
//
//   scoreboard: https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates=YYYYMMDD
//   summary:    https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={id}
//
// Date ranges return HTTP 400 for soccer: request one day per call.
// The mappers are pure functions so they can be tested against recorded responses.

import type { MatchIncident, MatchStatus, MatchTeamStats, NormalizedMatch, ScorePair } from './types';
import { recordAssets } from './assetRegistry';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const USER_AGENT = 'BetIntel/1.0 (personal use)';

/** ESPN league slugs for the competitions the app follows. */
export const ESPN_FOOTBALL_LEAGUES: Record<string, string> = {
  'Liga Portugal Betclic': 'por.1',
  'Premier League': 'eng.1',
  'La Liga': 'esp.1',
  Bundesliga: 'ger.1',
  'Serie A': 'ita.1',
  'Ligue 1': 'fra.1',
  Eredivisie: 'ned.1',
  'Süper Lig': 'tur.1',
  'UEFA Champions League': 'uefa.champions',
  'UEFA Europa League': 'uefa.europa',
  'UEFA Conference League': 'uefa.europa.conf',
};

// ─── Raw shapes (only the fields we read) ────────────────────────────────────

interface EspnStatusType { name?: string; state?: string; shortDetail?: string; detail?: string; completed?: boolean }
interface EspnCompetitor {
  homeAway?: 'home' | 'away';
  score?: string | number;
  team?: { id?: string; displayName?: string; logo?: string };
  linescores?: Array<{ displayValue?: string; value?: number }>;
}
interface EspnCompetition {
  id?: string;
  date?: string;
  status?: { type?: EspnStatusType; displayClock?: string };
  competitors?: EspnCompetitor[];
  venue?: { fullName?: string };
}
interface EspnEvent { id?: string; date?: string; competitions?: EspnCompetition[] }
interface EspnScoreboard { leagues?: Array<{ id?: string; name?: string; slug?: string }>; events?: EspnEvent[] }
interface EspnKeyEvent {
  type?: { text?: string; type?: string };
  text?: string;
  clock?: { value?: number; displayValue?: string };
  team?: { id?: string };
  participants?: Array<{ athlete?: { displayName?: string } }>;
}
interface EspnSummary {
  header?: { id?: string; league?: { id?: string; name?: string; slug?: string }; competitions?: EspnCompetition[] };
  boxscore?: { teams?: Array<{ team?: { id?: string }; statistics?: Array<{ name?: string; displayValue?: string }> }> };
  keyEvents?: EspnKeyEvent[];
  gameInfo?: { venue?: { fullName?: string } };
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────

/** Maps ESPN's status to ours. Unknown "post" states are treated as FINISHED only when ESPN says completed. */
export function mapEspnStatus(type: EspnStatusType | undefined): MatchStatus {
  const name = type?.name ?? '';
  if (/POSTPONED/.test(name)) return 'POSTPONED';
  if (/CANCELED|CANCELLED/.test(name)) return 'CANCELLED';
  if (/ABANDONED/.test(name)) return 'ABANDONED';
  if (/SUSPENDED|DELAYED/.test(name)) return 'SUSPENDED';
  if (/HALFTIME/.test(name)) return 'HALFTIME';
  if (type?.state === 'in') return 'LIVE';
  if (type?.state === 'post') return type.completed === false ? 'SUSPENDED' : 'FINISHED';
  return 'SCHEDULED';
}

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

function periodGoals(c: EspnCompetitor | undefined): number[] {
  return (c?.linescores ?? []).map((l) => toNum(l.value ?? l.displayValue) ?? 0);
}

function scoresFrom(home: EspnCompetitor | undefined, away: EspnCompetitor | undefined, status: MatchStatus, statusName: string) {
  const h = toNum(home?.score);
  const a = toNum(away?.score);
  const score: ScorePair | null = status === 'SCHEDULED' || h === null || a === null ? null : { home: h, away: a };
  const hp = periodGoals(home);
  const ap = periodGoals(away);
  const halfTime: ScorePair | null = hp.length >= 1 && ap.length >= 1 ? { home: hp[0]!, away: ap[0]! } : null;
  const wentToExtraTime = /AET|PEN|EXTRA|OVERTIME/.test(statusName) || hp.length > 2;
  let regularTime: ScorePair | null = null;
  if (score && !wentToExtraTime) regularTime = score;
  else if (hp.length >= 2 && ap.length >= 2) regularTime = { home: hp[0]! + hp[1]!, away: ap[0]! + ap[1]! };
  return { score, halfTime, regularTime, wentToExtraTime };
}

function emptyStats(): MatchTeamStats {
  return { corners: null, yellowCards: null, redCards: null, shots: null, shotsOnTarget: null, possession: null, fouls: null };
}

function mapTeamStats(list: Array<{ name?: string; displayValue?: string }> | undefined): MatchTeamStats {
  const s = emptyStats();
  for (const x of list ?? []) {
    const v = toNum(x.displayValue);
    switch (x.name) {
      case 'wonCorners': s.corners = v; break;
      case 'yellowCards': s.yellowCards = v; break;
      case 'redCards': s.redCards = v; break;
      case 'totalShots': s.shots = v; break;
      case 'shotsOnTarget': s.shotsOnTarget = v; break;
      case 'possessionPct': s.possession = v; break;
      case 'foulsCommitted': s.fouls = v; break;
      default: break;
    }
  }
  return s;
}

function incidentType(k: EspnKeyEvent): MatchIncident['type'] | null {
  const t = `${k.type?.type ?? ''} ${k.type?.text ?? ''}`.toLowerCase();
  if (/own goal/.test(t)) return 'OWN_GOAL';
  if (/penalty/.test(t) && /miss|saved/.test(t)) return 'PENALTY_MISSED';
  if (/penalty/.test(t) && /goal|scored/.test(t)) return 'PENALTY_GOAL';
  if (/goal/.test(t)) return 'GOAL';
  if (/second yellow|yellow-red|yellow red/.test(t)) return 'SECOND_YELLOW';
  if (/red/.test(t)) return 'RED';
  if (/yellow/.test(t)) return 'YELLOW';
  if (/substitution/.test(t)) return 'SUB';
  if (/var/.test(t)) return 'VAR';
  return null;
}

// ─── Public mappers ──────────────────────────────────────────────────────────

/** Maps a scoreboard response (one league, one day) to normalised matches. */
export function mapEspnScoreboard(json: EspnScoreboard): NormalizedMatch[] {
  const league = json.leagues?.[0];
  return (json.events ?? []).flatMap((ev) => {
    const comp = ev.competitions?.[0];
    if (!comp || !ev.id) return [];
    return [mapCompetition(ev.id, comp, { id: league?.id, name: league?.name, slug: league?.slug }, comp.venue?.fullName ?? null)];
  });
}

/** Maps a match summary (details + stats + key events) to one normalised match. */
export function mapEspnSummary(json: EspnSummary): NormalizedMatch | null {
  const comp = json.header?.competitions?.[0];
  const id = json.header?.id ?? comp?.id;
  if (!comp || !id) return null;
  const match = mapCompetition(id, comp, json.header?.league ?? {}, json.gameInfo?.venue?.fullName ?? null);

  const homeId = match.home.providerId;
  const teams = json.boxscore?.teams ?? [];
  const homeStats = teams.find((t) => t.team?.id === homeId);
  const awayStats = teams.find((t) => t.team?.id !== homeId);
  if (homeStats || awayStats) match.stats = { home: mapTeamStats(homeStats?.statistics), away: mapTeamStats(awayStats?.statistics) };

  match.incidents = (json.keyEvents ?? []).flatMap((k): MatchIncident[] => {
    const type = incidentType(k);
    if (!type) return [];
    const side = k.team?.id ? (k.team.id === homeId ? 'home' : 'away') : null;
    return [{
      type,
      minute: k.clock?.displayValue ?? '',
      clockSeconds: toNum(k.clock?.value),
      side,
      player: k.participants?.[0]?.athlete?.displayName ?? null,
      assist: type === 'GOAL' ? k.participants?.[1]?.athlete?.displayName ?? null : null,
    }];
  });
  return match;
}

function mapCompetition(
  id: string,
  comp: EspnCompetition,
  league: { id?: string; name?: string; slug?: string },
  venue: string | null,
): NormalizedMatch {
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  const status = mapEspnStatus(comp.status?.type);
  const scores = scoresFrom(home, away, status, comp.status?.type?.name ?? '');
  return {
    provider: 'espn',
    providerMatchId: id,
    sport: 'FOOTBALL',
    competition: { providerId: league.id ?? '', name: league.name ?? '', slug: league.slug ?? null },
    kickoffAt: new Date(comp.date ?? '').toISOString(),
    status,
    statusDetail: comp.status?.type?.shortDetail ?? comp.status?.displayClock ?? '',
    home: { providerId: home?.team?.id ?? '', name: home?.team?.displayName ?? '' },
    away: { providerId: away?.team?.id ?? '', name: away?.team?.displayName ?? '' },
    ...scores,
    stats: null,
    incidents: [],
    venue,
  };
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Matches of one league on one day (date as YYYY-MM-DD or YYYYMMDD). */
export async function fetchEspnFootballDay(leagueSlug: string, date: string): Promise<NormalizedMatch[]> {
  const d = date.replace(/-/g, '');
  const json = await getJson<EspnScoreboard>(`${BASE}/${leagueSlug}/scoreboard?dates=${d}`);
  const logos: Record<string, string> = {};
  for (const ev of json.events ?? []) {
    for (const c of ev.competitions?.[0]?.competitors ?? []) {
      const name = c.team?.displayName;
      const logo = c.team?.logo ?? (c.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${c.team.id}.png` : undefined);
      if (name && logo) logos[name] = logo;
    }
  }
  recordAssets(logos, {});
  return mapEspnScoreboard(json);
}

/** Full detail of one match (stats and incidents included). */
export async function fetchEspnFootballMatch(leagueSlug: string, eventId: string): Promise<NormalizedMatch | null> {
  return mapEspnSummary(await getJson<EspnSummary>(`${BASE}/${leagueSlug}/summary?event=${encodeURIComponent(eventId)}`));
}
