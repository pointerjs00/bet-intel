import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';

interface ApiEnvelope<T> { success: boolean; data: T }

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'ABANDONED' | 'SUSPENDED';

export interface TeamStats {
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possession: number | null;
  fouls: number | null;
}

export interface MatchIncident {
  type: 'GOAL' | 'OWN_GOAL' | 'PENALTY_GOAL' | 'PENALTY_MISSED' | 'YELLOW' | 'SECOND_YELLOW' | 'RED' | 'SUB' | 'VAR';
  minute: string;
  clockSeconds: number | null;
  side: 'home' | 'away' | null;
  player: string | null;
  assist: string | null;
}

export interface FootballMatch {
  providerMatchId: string;
  competition: { providerId: string; name: string; slug: string | null };
  kickoffAt: string;
  status: MatchStatus;
  statusDetail: string;
  home: { providerId: string; name: string };
  away: { providerId: string; name: string };
  score: { home: number; away: number } | null;
  halfTime: { home: number; away: number } | null;
  stats: { home: TeamStats; away: TeamStats } | null;
  incidents: MatchIncident[];
  venue: string | null;
  hasBet?: boolean;
  redCards?: { home: number; away: number } | null;
}

export interface LeagueGroup { league: string; slug: string; matches: FootballMatch[] }

/** Matches of the followed competitions on one day (YYYY-MM-DD). Live days refresh every 30 s. */
export function useFootballDay(date: string, enabled = true) {
  return useQuery({
    queryKey: ['sports', 'football', 'day', date],
    queryFn: async () => (await apiClient.get<ApiEnvelope<{ date: string; groups: LeagueGroup[] }>>('/sports/football/day', { params: { date } })).data.data,
    enabled,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.groups.some((g) => g.matches.some((m) => m.status === 'LIVE' || m.status === 'HALFTIME')) ? 30_000 : false),
  });
}

/** The real match behind a boletim selection (GET /betintel/:id/results). */
export interface ItemMatch {
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';
  providerMatchId: string;
  league: string | null;
  status: string;
  statusDetail: string;
  kickoffAt: string;
  home: string;
  away: string;
  score: { home: number; away: number } | null;
  halfTime: { home: number; away: number } | null;
  line: string | null;
}

/** Real scores of a boletim's selections, keyed by item id; refreshes every minute while one is live. */
export function useItemMatches(boletinId: string | undefined) {
  return useQuery({
    queryKey: ['boletins', boletinId, 'results'],
    queryFn: async () => (await apiClient.get<ApiEnvelope<Record<string, ItemMatch | null>>>(`/betintel/${boletinId}/results`)).data.data,
    enabled: Boolean(boletinId),
    staleTime: 60_000,
    refetchInterval: (q) => (Object.values(q.state.data ?? {}).some((m) => m && (m.status === 'LIVE' || m.status === 'HALFTIME')) ? 60_000 : false),
  });
}

export interface TeamSearchHit { kind: 'team' | 'name'; sport: string; id: string | null; name: string; logo: string | null; leagues: string[]; bets: number }

/** As-you-type team search. An empty query returns the teams the user bets on most. */
export function useTeamSearch(q: string) {
  return useQuery({
    queryKey: ['sports', 'teams', 'search', q.trim().toLowerCase()],
    queryFn: async () => (await apiClient.get<ApiEnvelope<TeamSearchHit[]>>('/sports/teams/search', { params: { q: q.trim() } })).data.data,
    // Keep the previous suggestions on screen while the next keystroke loads.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export interface TeamBet {
  boletinId: string; boletinName: string | null; boletinStatus: string; market: string; selection: string; odd: number; result: string;
  stake: number; singleProfit: number | null; multiple: number; kickoffAt: string | null; homeTeam: string; awayTeam: string;
}
export interface TeamMatch {
  id: string; league: string; leagueName: string; kickoffAt: string; status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  home: string; away: string; score: { home: number; away: number } | null; bets: TeamBet[];
}
export interface TeamHistory {
  team: { sport: string; id: string | null; name: string; logo: string | null; leagues: string[] };
  summary: { selections: number; won: number; lost: number; void: number; pending: number; hitRate: number | null; averageOdd: number | null; singlesProfit: number; singlesStaked: number };
  matches: TeamMatch[];
  otherBets: TeamBet[];
}

/** A team's matches since 2020 with the user's bets on them. */
export function useTeamHistory(ref: { sport?: string; id?: string; name?: string }) {
  return useQuery({
    queryKey: ['sports', 'teams', 'history', ref.sport, ref.id, ref.name],
    queryFn: async () => (await apiClient.get<ApiEnvelope<TeamHistory>>('/sports/teams/history', { params: ref })).data.data,
    enabled: Boolean(ref.id || ref.name),
    staleTime: 10 * 60_000,
  });
}

/** Sports with live data (ESPN), used by the Jogos and Por jogo switches. */
export type SportKey = 'football' | 'basketball' | 'tennis';
export const SPORT_OPTIONS: Array<{ value: SportKey; label: string }> = [
  { value: 'football', label: 'Futebol' },
  { value: 'basketball', label: 'Basquetebol' },
  { value: 'tennis', label: 'Ténis' },
];

/** NBA game or tennis match on the Jogos screen. `line` = quarters or sets ("6-4 3-6"). */
export interface SimpleMatch {
  providerMatchId: string;
  kickoffAt: string;
  status: MatchStatus | 'RETIRED' | 'WALKOVER';
  statusDetail: string;
  home: { name: string };
  away: { name: string };
  score: { home: number; away: number } | null;
  line: string | null;
  hasBet: boolean;
}
export interface SimpleGroup { league: string; slug: string; matches: SimpleMatch[] }

function useSimpleDay(sport: 'basketball' | 'tennis', date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['sports', sport, 'day', date],
    queryFn: async () => (await apiClient.get<ApiEnvelope<{ date: string; groups: SimpleGroup[] }>>(`/sports/${sport}/day`, { params: { date } })).data.data,
    enabled,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.groups.some((g) => g.matches.some((m) => m.status === 'LIVE' || m.status === 'HALFTIME')) ? 30_000 : false),
  });
}

/** NBA games of one day (ESPN). */
export const useBasketballDay = (date: string, enabled = true) => useSimpleDay('basketball', date, enabled);
/** ATP/WTA singles of one day (ESPN), grouped by tournament. */
export const useTennisDay = (date: string, enabled = true) => useSimpleDay('tennis', date, enabled);

export interface MatchPreview {
  standings: { title: string; rows: Array<{ rank: number; team: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: string; points: number }> } | null;
  form: { home: string[]; away: string[] };
  h2h: Array<{ date: string; home: string; away: string; homeScore: number; awayScore: number; competition: string }>;
}

/** Standings, last-5 form and head-to-head from ESPN (replaces the API-Football insights, #58). */
export function useMatchPreview(league: string, id: string) {
  return useQuery({
    queryKey: ['sports', 'football', 'preview', league, id],
    queryFn: async () => (await apiClient.get<ApiEnvelope<MatchPreview>>(`/sports/football/preview/${league}/${id}`)).data.data,
    enabled: Boolean(league && id),
    staleTime: 30 * 60_000,
  });
}

/** One match with stats and incidents; refreshes every 30 s while live. */
export function useFootballMatch(league: string, id: string) {
  return useQuery({
    queryKey: ['sports', 'football', 'match', league, id],
    queryFn: async () => (await apiClient.get<ApiEnvelope<FootballMatch>>(`/sports/football/match/${league}/${id}`)).data.data,
    enabled: Boolean(league && id),
    refetchInterval: (q) => (q.state.data?.status === 'LIVE' || q.state.data?.status === 'HALFTIME' ? 30_000 : false),
  });
}
