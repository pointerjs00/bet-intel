import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiReview,
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
  aiReview: ['stats', 'ai-review'] as const,
  all: ['stats'] as const,
  me: (period: StatsPeriod, siteSlugs: string[], dateFrom?: string, dateTo?: string) =>
    ['stats', 'me', period, siteSlugs.join(','), dateFrom ?? '', dateTo ?? ''] as const,
  summary: (period: StatsPeriod, siteSlug?: string) => ['stats', 'summary', period, siteSlug ?? ''] as const,
  bySport: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-sport', period, siteSlug ?? ''] as const,
  byTeam: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-team', period, siteSlug ?? ''] as const,
  byCompetition: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-competition', period, siteSlug ?? ''] as const,
  byMarket: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-market', period, siteSlug ?? ''] as const,
  byOddsRange: (period: StatsPeriod, siteSlug?: string) => ['stats', 'by-odds-range', period, siteSlug ?? ''] as const,
  timeline: (period: StatsPeriod, siteSlugs: string[], dateFrom?: string, dateTo?: string, granularity?: string) =>
    ['stats', 'timeline', period, siteSlugs.join(','), dateFrom ?? '', dateTo ?? '', granularity ?? ''] as const,
};

/** Returns the full authenticated-user statistics payload for a given period. */
export function usePersonalStats(
  period: StatsPeriod,
  siteSlugs: string[] = [],
  dateFrom?: string,
  dateTo?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: statsQueryKeys.me(period, siteSlugs, dateFrom, dateTo),
    staleTime: 30_000,    // 30s — avoids redundant refetches on tab switches
    enabled,
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

/** Returns only the P&L timeline for a given period + granularity. */
export function useStatsTimeline(
  period: StatsPeriod,
  siteSlugs: string[] = [],
  dateFrom?: string,
  dateTo?: string,
  granularity?: 'daily' | 'weekly' | 'monthly',
) {
  return useQuery({
    queryKey: statsQueryKeys.timeline(period, siteSlugs, dateFrom, dateTo, granularity),
    staleTime: 30_000,
    queryFn: async () => {
      const params: Record<string, string> = { period };
      if (siteSlugs.length > 0) params.siteSlugs = siteSlugs.join(',');
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (granularity) params.granularity = granularity;
      const response = await apiClient.get<ApiEnvelope<StatsTimelinePoint[]>>('/stats/me/timeline', { params });
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

/**
 * Returns the AI bet review. Lazy: the query is disabled until `generate()` is called.
 * Server caches the result for 24h, so repeated calls return the same review within that window.
 */
export function useAiReview() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: statsQueryKeys.aiReview,
    // Don't fetch automatically — user must tap "Gerar análise"
    enabled: false,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<AiReview>>('/stats/me/ai-review');
      return response.data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.get<ApiEnvelope<AiReview>>('/stats/me/ai-review');
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(statsQueryKeys.aiReview, data);
    },
  });

  return {
    data: (query.data ?? mutation.data) as AiReview | undefined,
    isLoading: mutation.isPending,
    error: mutation.error,
    generate: () => mutation.mutate(),
  };
}

/** Fetches the raw prompt text that would be sent to the AI model. */
export async function fetchAiReviewPrompt(): Promise<string> {
  const response = await apiClient.get<ApiEnvelope<{ prompt: string }>>('/stats/me/ai-review/prompt');
  return response.data.data.prompt;
}