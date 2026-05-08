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
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useTeams(
  params?: { sport?: string; competition?: string; search?: string },
  options?: { enabled?: boolean },
) {
  const normalizedCompetition = params?.competition?.toLowerCase();
  const isTennisRankingPool =
    params?.sport === 'TENNIS' &&
    (normalizedCompetition?.includes('atp tour') ||
      normalizedCompetition?.includes('wta tour'));

  return useQuery({
    queryKey: ['reference', 'teams', params],
    queryFn: () => fetchTeams(params),
    staleTime: isTennisRankingPool ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000,
    refetchOnMount: isTennisRankingPool ? 'always' : true,
    enabled:
      options?.enabled !== false &&
      (!params?.search || params.search.length >= 2),
  });
}

export function useMarkets(sport?: string) {
  return useQuery({
    queryKey: ['reference', 'markets', sport],
    queryFn: () => fetchMarkets(sport),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function fetchUpcomingFixtures(days: number): Promise<Fixture[]> {
  try {
    const { data } = await apiClient.get<{ data: Fixture[] }>('/fixtures/upcoming', {
      params: { days },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Upcoming (SCHEDULED) fixtures for the next N days.
 * Pass a sensible value — the screen uses 14.
 */
export function useUpcomingFixtures(days = 14) {
  return useQuery({
    queryKey: ['fixtures', 'upcoming', days],
    queryFn: () => fetchUpcomingFixtures(days),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

async function fetchRecentFixtures(days: number): Promise<Fixture[]> {
  try {
    // Dedicated endpoint that filters status IN (FINISHED, LIVE) server-side,
    // so there is no overlap with upcoming SCHEDULED fixtures.
    const { data } = await apiClient.get<{ data: Fixture[] }>('/fixtures/recent', {
      params: { days },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Recently finished / live fixtures for the past N days.
 * Pass a sensible value — the screen uses 3.
 */
export function useRecentFixtures(days = 3) {
  return useQuery({
    queryKey: ['fixtures', 'recent', days],
    queryFn: () => fetchRecentFixtures(days),
    staleTime: 60 * 1000, // short stale time so live score refetches are effective
    retry: false,
  });
}

// ─── Fixtures by specific date ────────────────────────────────────────────────

function localDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchFixturesByDate(date: Date): Promise<Fixture[]> {
  try {
    // date has time stripped to local midnight — .getTime() gives the UTC equivalent,
    // which is the correct lower bound for querying UTC-stored kickoff times.
    const from = date.toISOString();
    const to = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
    const { data } = await apiClient.get<{ data: Fixture[] }>('/fixtures', {
      params: { from, to },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Fixtures for a specific local date. Only enabled when `enabled` is true
 * (i.e. when the date is outside the upcoming/recent coverage window).
 * Historical data is cached for 24 hours.
 */
export function useFixturesByDate(date: Date, enabled: boolean) {
  return useQuery({
    queryKey: ['fixtures', 'by-date', localDateKey(date)],
    queryFn: () => fetchFixturesByDate(date),
    staleTime: 24 * 60 * 60 * 1000,
    enabled,
    retry: false,
  });
}