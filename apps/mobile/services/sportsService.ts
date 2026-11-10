import { useQuery } from '@tanstack/react-query';
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
}

export interface LeagueGroup { league: string; slug: string; matches: FootballMatch[] }

/** Matches of the followed competitions on one day (YYYY-MM-DD). Live days refresh every 30 s. */
export function useFootballDay(date: string) {
  return useQuery({
    queryKey: ['sports', 'football', 'day', date],
    queryFn: async () => (await apiClient.get<ApiEnvelope<{ date: string; groups: LeagueGroup[] }>>('/sports/football/day', { params: { date } })).data.data,
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.groups.some((g) => g.matches.some((m) => m.status === 'LIVE' || m.status === 'HALFTIME')) ? 30_000 : false),
  });
}

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
