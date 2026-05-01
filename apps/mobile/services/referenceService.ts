import { useQuery } from '@tanstack/react-query';
import type { Competition, Market, Team } from '@betintel/shared';
import { apiClient } from './apiClient';

export interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  country: string;
  sport: string;
  kickoffAt: string;
  season: string;
  round: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

// ─── Request functions ────────────────────────────────────────────────────────

async function fetchCompetitions(sport?: string): Promise<Competition[]> {
  const params = sport ? { sport } : undefined;
  const { data } = await apiClient.get('/reference/competitions', { params });
  return data.data;
}

async function fetchTeams(params?: {
  sport?: string;
  competition?: string;
  search?: string;
}): Promise<Team[]> {
  const { data } = await apiClient.get('/reference/teams', { params });
  return data.data;
}

async function fetchMarkets(sport?: string): Promise<Market[]> {
  const params = sport ? { sport } : undefined;
  const { data } = await apiClient.get('/reference/markets', { params });
  return data.data;
}

// ─── React Query hooks ────────────────────────────────────────────────────────

export function useCompetitions(sport?: string) {
  return useQuery({
    queryKey: ['reference', 'competitions', sport],
    queryFn: () => fetchCompetitions(sport),
    staleTime: 24 * 60 * 60 * 1000, // 24h — reference data rarely changes
  });
}

export function useTeams(params?: {
  sport?: string;
  competition?: string;
  search?: string;
}, options?: { enabled?: boolean }) {
  const normalizedCompetition = params?.competition?.toLowerCase();
  const isTennisRankingPool = params?.sport === 'TENNIS' && (
    normalizedCompetition?.includes('atp tour')
    || normalizedCompetition?.includes('wta tour')
  );

  return useQuery({
    queryKey: ['reference', 'teams', params],
    queryFn: () => fetchTeams(params),
    staleTime: isTennisRankingPool ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000,
    refetchOnMount: isTennisRankingPool ? 'always' : true,
    enabled: (options?.enabled !== false) && (!params?.search || params.search.length >= 2),
  });
}

export function useMarkets(sport?: string) {
  return useQuery({
    queryKey: ['reference', 'markets', sport],
    queryFn: () => fetchMarkets(sport),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

async function fetchUpcomingFixtures(days: number): Promise<Fixture[]> {
  try {
    const { data } = await apiClient.get<{ data: Fixture[] }>('/fixtures/upcoming', { params: { days } });
    return data.data;
  } catch {
    return [];
  }
}

export function useUpcomingFixtures(days = 7) {
  return useQuery({
    queryKey: ['fixtures', 'upcoming', days],
    queryFn: () => fetchUpcomingFixtures(days),
    staleTime: 60 * 60 * 1000, // 1 hour — matches server cache TTL
    retry: false,
  });
}
