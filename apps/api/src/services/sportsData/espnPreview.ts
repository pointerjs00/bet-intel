// Pre-match context from the ESPN summary (plan #58: replaces the API-Football standings,
// form and head-to-head). Pure mapper, tested against a recorded response shape.

import { tracked } from './providerHealth';

export interface PreviewStandingRow {
  rank: number;
  team: string;
  logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDiff: string;
  points: number;
}

export interface PreviewH2H { date: string; home: string; away: string; homeScore: number; awayScore: number; competition: string }

export interface MatchPreview {
  standings: { title: string; rows: PreviewStandingRow[] } | null;
  /** Last results, newest first, from each team's point of view ('W' | 'D' | 'L'). */
  form: { home: string[]; away: string[] };
  h2h: PreviewH2H[];
}

interface RawStat { name?: string; value?: number; displayValue?: string }
interface RawSummary {
  header?: { competitions?: Array<{ competitors?: Array<{ homeAway?: string; team?: { id?: string } }> }> };
  standings?: { header?: string; groups?: Array<{ standings?: { entries?: Array<{ team?: string; id?: string; logo?: Array<{ href?: string }>; stats?: RawStat[] }> } }> };
  lastFiveGames?: Array<{ team?: { id?: string }; events?: Array<{ gameResult?: string }> }>;
  seasonseries?: Array<{ type?: string; events?: Array<{ date?: string; competitionName?: string; competitors?: Array<{ homeAway?: string; score?: string; team?: { displayName?: string } }> }> }> | { type?: string; events?: unknown[] };
}

const stat = (stats: RawStat[] | undefined, name: string): RawStat | undefined => stats?.find((s) => s.name === name);
const num = (s: RawStat | undefined) => Number(s?.value ?? s?.displayValue ?? 0) || 0;

export function mapEspnPreview(json: RawSummary): MatchPreview {
  const comp = json.header?.competitions?.[0];
  const homeId = comp?.competitors?.find((c) => c.homeAway === 'home')?.team?.id;
  const awayId = comp?.competitors?.find((c) => c.homeAway === 'away')?.team?.id;

  const entries = json.standings?.groups?.[0]?.standings?.entries ?? [];
  const rows: PreviewStandingRow[] = entries.map((e, i) => ({
    rank: num(stat(e.stats, 'rank')) || i + 1,
    team: e.team ?? '',
    logo: e.logo?.[0]?.href ?? (e.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${e.id}.png` : null),
    played: num(stat(e.stats, 'gamesPlayed')),
    won: num(stat(e.stats, 'wins')),
    drawn: num(stat(e.stats, 'ties')),
    lost: num(stat(e.stats, 'losses')),
    goalDiff: stat(e.stats, 'pointDifferential')?.displayValue ?? '0',
    points: num(stat(e.stats, 'points')),
  })).sort((a, b) => a.rank - b.rank);

  const formOf = (id: string | undefined) =>
    (json.lastFiveGames?.find((t) => t.team?.id === id)?.events ?? []).map((e) => e.gameResult ?? '').filter((r) => r === 'W' || r === 'D' || r === 'L');

  const series = Array.isArray(json.seasonseries) ? json.seasonseries.find((s) => s.type === 'head-to-head') : json.seasonseries;
  const h2hEvents = (series?.events ?? []) as Array<{ date?: string; competitionName?: string; competitors?: Array<{ homeAway?: string; score?: string; team?: { displayName?: string } }> }>;
  const h2h: PreviewH2H[] = h2hEvents.map((ev) => {
    const h = ev.competitors?.find((c) => c.homeAway === 'home');
    const a = ev.competitors?.find((c) => c.homeAway === 'away');
    return {
      date: ev.date ?? '',
      home: h?.team?.displayName ?? '',
      away: a?.team?.displayName ?? '',
      homeScore: Number(h?.score ?? 0),
      awayScore: Number(a?.score ?? 0),
      competition: (ev.competitionName ?? '').replace(/^\d{4}-\d{2}\s+/, ''),
    };
  }).filter((x) => x.home && x.away);

  return {
    standings: rows.length > 0 ? { title: json.standings?.header ?? '', rows } : null,
    form: { home: formOf(homeId), away: formOf(awayId) },
    h2h,
  };
}

export async function fetchEspnPreview(leagueSlug: string, eventId: string): Promise<MatchPreview> {
  return tracked('espn-preview', () => fetchPreviewRaw(leagueSlug, eventId));
}

async function fetchPreviewRaw(leagueSlug: string, eventId: string): Promise<MatchPreview> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/summary?event=${encodeURIComponent(eventId)}`, {
    headers: { 'User-Agent': 'BetIntel/1.0 (personal use)', Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ESPN preview ${res.status}`);
  return mapEspnPreview((await res.json()) as RawSummary);
}
