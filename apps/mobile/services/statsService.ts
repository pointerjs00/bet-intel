import { useQuery } from '@tanstack/react-query';
import type {
  PersonalStats,
  StatsByCompetitionRow,
  StatsByMarketRow,
  StatsByOddsRangeRow,
  StatsBySportRow,
  StatsByTeamRow,
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
  me: (period: StatsPeriod, siteSlugs: string[], dateFrom?: string, dateTo?: string) =>
    ['stats', 'me', period, siteSlugs.join(','), dateFrom ?? '', dateTo ?? ''] as const,
  summary: (period: StatsPeriod, siteSlug?: string) => ['stats', 'summary', period, siteSlug ?? ''] as const,
  bySport: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-sport', period, siteSlug ?? ''] as const,
  byTeam: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-team', period, siteSlug ?? ''] as const,
  byCompetition: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-competition', period, siteSlug ?? ''] as const,
  byMarket: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-market', period, siteSlug ?? ''] as const,
  byOddsRange: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-odds-range', period, siteSlug ?? ''] as const,
  timeline: (period: StatsPeriod, siteSlug?: string) => ['stats', 'timeline', period, siteSlug ?? ''] as const,
};

/** Returns the full authenticated-user statistics payload for a given period. */
export function usePersonalStats(
  period: StatsPeriod,
  siteSlugs: string[] = [],
  dateFrom?: string,
  dateTo?: string,
) {
  return useQuery({
    queryKey: statsQueryKeys.me(period, siteSlugs, dateFrom, dateTo),
    queryFn: async () => {
      const params: Record<string, string> = { period };
      if (siteSlugs.length > 0) params.siteSlugs = siteSlugs.join(',');
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const response = await apiClient.get<ApiEnvelope<PersonalStats>>('/stats/me', { params });
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

/** Returns the team breakdown rows for a given period. */
export function useStatsByTeam(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.byTeam(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsByTeamRow[]>>('/stats/me/by-team', {
        params: { period },
      });
      return response.data.data;
    },
  });
}

/** Returns the competition breakdown rows for a given period. */
export function useStatsByCompetition(period: StatsPeriod) {
  return useQuery({
    queryKey: statsQueryKeys.byCompetition(period),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<StatsByCompetitionRow[]>>('/stats/me/by-competition', {
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