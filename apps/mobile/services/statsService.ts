import { useQuery } from '@tanstack/react-query';
import type {
  PersonalStats,
  StatsByMarketRow,
  StatsByOddsRangeRow,
  StatsBySiteRow,
  StatsBySportRow,
  StatsPeriod,
  StatsSummary,
  StatsTimelinePoint,
} from '@betintel/shared';
import { apiClient } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const statsQueryKeys = {
  all: ['stats'] as const,
  me: (period: StatsPeriod) => ['stats', 'me', period] as const,
  summary: (period: StatsPeriod) => ['stats', 'summary', period] as const,
  bySport: (period: StatsPeriod) => ['stats', 'by-sport', period] as const,
  bySite: (period: StatsPeriod) => ['stats', 'by-site', period] as const,
  byMarket: (period: StatsPeriod) => ['stats', 'by-market', period] as const,
  byOddsRange: (period: StatsPeriod) => ['stats', 'by-odds-range', period] as const,
  timeline: (period: StatsPeriod) => ['stats', 'timeline', period] as const,
};

/** Returns the full authenticated-user statistics payload for a given period. */
export function usePersonalStats(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.me(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<PersonalStats>>('/stats/me', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns only the summary metrics for a given period. */
export function useStatsSummary(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.summary(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsSummary>>('/stats/me/summary', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the sport breakdown rows for a given period. */
export function useStatsBySport(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.bySport(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsBySportRow[]>>('/stats/me/by-sport', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the betting-site breakdown rows for a given period. */
export function useStatsBySite(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.bySite(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsBySiteRow[]>>('/stats/me/by-site', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the market breakdown rows for a given period. */
export function useStatsByMarket(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.byMarket(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsByMarketRow[]>>('/stats/me/by-market', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the odds-range breakdown rows for a given period. */
export function useStatsByOddsRange(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.byOddsRange(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsByOddsRangeRow[]>>('/stats/me/by-odds-range', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the P&L timeline for a given period. */
export function useStatsTimeline(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.timeline(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsTimelinePoint[]>>('/stats/me/timeline', {
        params: { period },
      });
      return response.data.data;
    },
  });
}