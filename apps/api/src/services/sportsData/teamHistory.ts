// Team search and team history (all matches since 2020 in the followed competitions, from ESPN
// team schedules) joined with the user's own selections on those matches.

import { prisma } from '../../prisma';
import { redis } from '../../utils/redis';
import { teamNamesMatch } from '../marketResolutionEngine';
import { countryToPt } from '../../utils/countryNames';
import { ESPN_FOOTBALL_LEAGUES } from './espnFootball';
import { TEAM_INDEX_KEY, type IndexedTeam } from '../../jobs/sportAssetsJob';
import { matchScore } from './searchRank';

const FIRST_SEASON = 2019; // ESPN season 2019 = 2019/20 (football), so matches from 2020 are covered
const LEAGUE_NAME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ESPN_FOOTBALL_LEAGUES).map(([name, slug]) => [slug, name])),
  nba: 'NBA',
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function allTeams(): Promise<IndexedTeam[]> {
  const raw = await redis.hgetall(TEAM_INDEX_KEY).catch(() => ({} as Record<string, string>));
  return Object.values(raw).map((v) => JSON.parse(v) as IndexedTeam);
}

export interface SearchHit { kind: 'team' | 'name'; sport: string; id: string | null; name: string; logo: string | null; leagues: string[]; bets: number }

/**
 * Teams (ESPN index) and names from the user's own bets (tennis players, other leagues) matching
 * the query, best match first. An empty query returns the teams the user bets on most.
 */
export async function searchTeams(userId: string, q: string): Promise<SearchHit[]> {
  const empty = norm(q) === '';
  const items = await prisma.boletinItem.findMany({ where: { boletin: { userId } }, select: { sport: true, homeTeam: true, awayTeam: true } });
  const counts = new Map<string, { sport: string; n: number }>();
  for (const it of items) {
    for (const name of [it.homeTeam, it.awayTeam]) {
      if (!empty && matchScore(name, q) === 0) continue;
      const c = counts.get(name) ?? { sport: String(it.sport), n: 0 };
      c.n++;
      counts.set(name, c);
    }
  }
  const index = await allTeams();
  const teams = empty
    // Only the indexed teams behind the user's most-bet names.
    ? index.filter((t) => [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).some(([n, c]) => c.sport === t.sport && teamNamesMatch(n, t.name)))
    : index.filter((t) => matchScore(t.name, q) > 0);

  const hits: SearchHit[] = teams.map((t) => ({
    kind: 'team', sport: t.sport, id: t.id, name: t.name, logo: t.logo, leagues: t.leagues.map((l) => LEAGUE_NAME[l] ?? l),
    bets: [...counts.entries()].filter(([n]) => teamNamesMatch(n, t.name)).reduce((a, [, c]) => a + c.n, 0),
  }));
  // Names from bets that no indexed team covers (tennis players, unfollowed leagues).
  for (const [name, c] of counts) {
    if (hits.some((h) => h.kind === 'team' && teamNamesMatch(name, h.name))) continue;
    if (hits.some((h) => h.kind === 'name' && teamNamesMatch(name, h.name))) continue;
    hits.push({ kind: 'name', sport: c.sport, id: null, name, logo: null, leagues: [], bets: c.n });
  }
  if (empty) return hits.sort((a, b) => b.bets - a.bets || a.name.localeCompare(b.name)).slice(0, 12);
  const score = new Map(hits.map((h) => [h, matchScore(h.name, q)]));
  return hits
    .sort((a, b) =>
      score.get(b)! - score.get(a)!
      || Number(b.bets > 0) - Number(a.bets > 0)
      || b.bets - a.bets
      || a.name.length - b.name.length
      || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export interface TeamMatch {
  id: string;
  league: string;
  leagueName: string;
  kickoffAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  home: string;
  away: string;
  score: { home: number; away: number } | null;
  bets: TeamBet[];
}

export interface TeamBet {
  boletinId: string;
  boletinName: string | null;
  boletinStatus: string;
  market: string;
  selection: string;
  odd: number;
  result: string;
  stake: number;
  /** Profit of the boletim when this was its only selection. */
  singleProfit: number | null;
  multiple: number;
  kickoffAt: string | null;
  homeTeam: string;
  awayTeam: string;
}

interface RawScheduleEvent {
  id?: string;
  date?: string;
  competitions?: Array<{
    status?: { type?: { state?: string; completed?: boolean; name?: string } };
    competitors?: Array<{ homeAway?: string; team?: { displayName?: string }; score?: { value?: number; displayValue?: string } | string }>;
  }>;
}

const scoreOf = (s: { value?: number; displayValue?: string } | string | undefined): number | null => {
  if (s == null) return null;
  const v = typeof s === 'string' ? Number(s) : s.value ?? Number(s.displayValue);
  return Number.isFinite(v) ? v : null;
};

async function season(sport: 'soccer' | 'basketball', league: string, teamId: string, year: number, fixtures: boolean): Promise<TeamMatch[]> {
  const key = `sports:sched:${league}:${teamId}:${year}:${fixtures ? 'f' : 'r'}`;
  const hit = await redis.get(key).catch(() => null);
  if (hit) return JSON.parse(hit) as TeamMatch[];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/schedule?season=${year}${fixtures ? '&fixture=true' : ''}`;
  let events: RawScheduleEvent[] = [];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BetIntel/1.0 (personal use)', Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) events = ((await res.json()) as { events?: RawScheduleEvent[] }).events ?? [];
  } catch { /* best effort */ }
  const national = !['nba'].includes(league) && /^(fifa|uefa\.nations|uefa\.euro|conmebol)/.test(league);
  const out = events.flatMap((e): TeamMatch[] => {
    const c = e.competitions?.[0];
    const h = c?.competitors?.find((x) => x.homeAway === 'home');
    const a = c?.competitors?.find((x) => x.homeAway === 'away');
    if (!e.id || !e.date || !h?.team?.displayName || !a?.team?.displayName) return [];
    const st = c?.status?.type;
    const status: TeamMatch['status'] = /POSTPONED/.test(st?.name ?? '') ? 'POSTPONED' : /CANCEL/.test(st?.name ?? '') ? 'CANCELLED'
      : st?.state === 'post' ? 'FINISHED' : st?.state === 'in' ? 'LIVE' : 'SCHEDULED';
    const hs = scoreOf(h.score); const as = scoreOf(a.score);
    const name = (n: string) => (national ? countryToPt(n) : n);
    return [{
      id: e.id, league, leagueName: LEAGUE_NAME[league] ?? league, kickoffAt: new Date(e.date).toISOString(), status,
      home: name(h.team.displayName), away: name(a.team.displayName),
      score: status !== 'SCHEDULED' && hs !== null && as !== null ? { home: hs, away: as } : null, bets: [],
    }];
  });
  const current = year >= new Date().getUTCFullYear() - 1;
  await redis.set(key, JSON.stringify(out), 'EX', current ? 30 * 60 : 30 * 24 * 3600).catch(() => {});
  return out;
}

export interface TeamHistory {
  team: { sport: string; id: string | null; name: string; logo: string | null; leagues: string[] };
  summary: { selections: number; won: number; lost: number; void: number; pending: number; hitRate: number | null; averageOdd: number | null; singlesProfit: number; singlesStaked: number };
  matches: TeamMatch[];
  /** Bets on this team that matched no listed match (cups, other competitions). */
  otherBets: TeamBet[];
}

export async function teamHistory(userId: string, ref: { sport?: string; id?: string; name?: string }): Promise<TeamHistory | null> {
  const team = ref.id ? (await allTeams()).find((t) => t.id === ref.id && (!ref.sport || t.sport === ref.sport)) ?? null : null;
  const name = team?.name ?? ref.name;
  if (!name) return null;

  // Matches since 2020 from every followed competition the team plays in.
  let matches: TeamMatch[] = [];
  if (team) {
    const sport = team.sport === 'BASKETBALL' ? 'basketball' : 'soccer';
    const now = new Date().getUTCFullYear();
    const years = Array.from({ length: now + 1 - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);
    // UEFA club competitions list only this season's teams: ask them for every club, every season.
    const leagues = team.sport === 'FOOTBALL' && !team.national
      ? [...new Set([...team.leagues, 'uefa.champions', 'uefa.europa', 'uefa.europa.conf'])]
      : team.leagues;
    const jobs = leagues.flatMap((l) => years.map((y) => () => season(sport, l, team.id, y, false)));
    jobs.push(...leagues.map((l) => () => season(sport, l, team.id, now, true)));
    const results: TeamMatch[][] = [];
    for (let i = 0; i < jobs.length; i += 8) results.push(...await Promise.all(jobs.slice(i, i + 8).map((j) => j())));
    const byId = new Map<string, TeamMatch>();
    for (const m of results.flat()) if (new Date(m.kickoffAt).getUTCFullYear() >= 2020) byId.set(m.id, m);
    matches = [...byId.values()].sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt));
  }

  // The user's selections on this team.
  const items = await prisma.boletinItem.findMany({
    where: { boletin: { userId } },
    select: {
      market: true, selection: true, oddValue: true, result: true, kickoffAt: true, homeTeam: true, awayTeam: true,
      boletin: { select: { id: true, name: true, status: true, stake: true, actualReturn: true, isFreebet: true, _count: { select: { items: true } } } },
    },
  });
  const mine = items.filter((it) => teamNamesMatch(it.homeTeam, name) || teamNamesMatch(it.awayTeam, name));
  const otherBets: TeamBet[] = [];
  const summary = { selections: mine.length, won: 0, lost: 0, void: 0, pending: 0, hitRate: null as number | null, averageOdd: null as number | null, singlesProfit: 0, singlesStaked: 0 };
  let oddSum = 0;
  for (const it of mine) {
    const multiple = it.boletin._count.items;
    const stake = Number(it.boletin.stake);
    const single = multiple === 1 && it.boletin.status !== 'PENDING';
    const profit = single ? Number(it.boletin.actualReturn ?? 0) - (it.boletin.isFreebet ? 0 : stake) : null;
    const bet: TeamBet = {
      boletinId: it.boletin.id, boletinName: it.boletin.name, boletinStatus: it.boletin.status, market: it.market, selection: it.selection,
      odd: Number(it.oddValue), result: it.result, stake, singleProfit: profit, multiple,
      kickoffAt: it.kickoffAt?.toISOString() ?? null, homeTeam: it.homeTeam, awayTeam: it.awayTeam,
    };
    if (it.result === 'WON') summary.won++; else if (it.result === 'LOST') summary.lost++; else if (it.result === 'VOID') summary.void++; else summary.pending++;
    oddSum += bet.odd;
    if (single && profit !== null) { summary.singlesProfit += profit; summary.singlesStaked += it.boletin.isFreebet ? 0 : stake; }
    const opponent = teamNamesMatch(it.homeTeam, name) ? it.awayTeam : it.homeTeam;
    const match = it.kickoffAt ? matches.find((m) => Math.abs(new Date(m.kickoffAt).getTime() - it.kickoffAt!.getTime()) < 36 * 3600e3
      && (teamNamesMatch(m.home, opponent) || teamNamesMatch(m.away, opponent))) : undefined;
    if (match) match.bets.push(bet); else otherBets.push(bet);
  }
  const decided = summary.won + summary.lost;
  summary.hitRate = decided ? Math.round((summary.won / decided) * 100) : null;
  summary.averageOdd = mine.length ? Math.round((oddSum / mine.length) * 100) / 100 : null;
  summary.singlesProfit = Math.round(summary.singlesProfit * 100) / 100;
  otherBets.sort((a, b) => (b.kickoffAt ?? '').localeCompare(a.kickoffAt ?? ''));

  return {
    team: { sport: team?.sport ?? ref.sport ?? 'FOOTBALL', id: team?.id ?? null, name, logo: team?.logo ?? null, leagues: (team?.leagues ?? []).map((l) => LEAGUE_NAME[l] ?? l) },
    summary,
    matches,
    otherBets,
  };
}
