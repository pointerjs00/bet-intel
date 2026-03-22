import { useQuery } from '@tanstack/react-query';
import { Sport } from '@betintel/shared';
import { apiClient } from './apiClient';
import type { FilterDateRange } from '../stores/filterStore';

export interface OddsSite {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}

export interface OddsRow {
  id: string;
  market: string;
  selection: string;
  value: string;
  scrapedAt: string;
  updatedAt: string;
  site: OddsSite;
}

export interface OddsEvent {
  id: string;
  externalId: string | null;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: OddsRow[];
}

export interface OddsFeedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ActiveBettingSite {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  baseUrl: string;
  lastScraped: string | null;
}

interface QueryEnvelope<TData, TMeta = undefined> {
  success: boolean;
  data: TData;
  meta?: TMeta;
}

export interface OddsFeedFilters {
  selectedSites: string[];
  selectedSports: Sport[];
  selectedMarkets: string[];
  selectedLeague?: string | null;
  minOdds: number;
  maxOdds: number;
  dateRange: FilterDateRange | null;
  limit?: number;
  page?: number;
}

function buildOddsParams(filters: OddsFeedFilters) {
  return {
    sites: filters.selectedSites.length > 0 ? filters.selectedSites.join(',') : undefined,
    sport: filters.selectedSports[0],
    league: filters.selectedLeague ?? undefined,
    market: filters.selectedMarkets[0],
    minOdds: filters.minOdds,
    maxOdds: filters.maxOdds,
    dateFrom: filters.dateRange?.from.toISOString(),
    dateTo: filters.dateRange?.to.toISOString(),
    page: filters.page ?? 1,
    limit: filters.limit ?? 12,
  };
}

export function useOddsFeed(filters: OddsFeedFilters) {
  return useQuery({
    queryKey: ['odds', 'feed', filters],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<OddsEvent[], OddsFeedMeta>>('/odds', {
        params: buildOddsParams(filters),
      });

      return {
        events: response.data.data,
        meta: response.data.meta ?? {
          page: filters.page ?? 1,
          limit: filters.limit ?? 12,
          total: response.data.data.length,
          totalPages: 1,
        },
      };
    },
    placeholderData: (previousData) => previousData,
    refetchInterval: 30_000,
  });
}

export function useLiveEvents() {
  return useQuery({
    queryKey: ['odds', 'live'],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<OddsEvent[]>>('/odds/live');
      return response.data.data;
    },
    refetchInterval: 30000,
  });
}

export function useEventOdds(eventId: string) {
  return useQuery({
    queryKey: ['odds', 'event', eventId],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<OddsEvent>>(`/odds/events/${eventId}`);
      return response.data.data;
    },
    enabled: Boolean(eventId),
    refetchInterval: 15_000,
  });
}

export function useBettingSites() {
  return useQuery({
    queryKey: ['odds', 'sites'],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<ActiveBettingSite[]>>('/odds/sites');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSports() {
  return useQuery({
    queryKey: ['odds', 'sports'],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<string[]>>('/odds/sports');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeagues(sport?: Sport) {
  return useQuery({
    queryKey: ['odds', 'leagues', sport],
    queryFn: async () => {
      const response = await apiClient.get<QueryEnvelope<Array<{ sport: string; league: string }>>>('/odds/leagues', {
        params: { sport },
      });
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
