import { isAxiosError } from 'axios';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import type { SlipLeg } from '../utils/odds/slip';
import type { MultipleResult, OddsEventListItem, OddsEventView, OddsSport } from '../utils/odds/types';

interface ApiEnvelope<T> { success: boolean; data: T }

/** Events of one sport/day with the main markets compared. */
export function useOddsDay(sport: OddsSport, date: string, enabled = true) {
  return useQuery({
    queryKey: ['odds', 'day', sport, date],
    queryFn: async () => (await apiClient.get<ApiEnvelope<OddsEventListItem[]>>('/odds/events', { params: { sport, date } })).data.data,
    enabled,
    staleTime: 120_000,
  });
}

/** One event with all compared rows; null when unknown (404). */
export async function fetchOddsEvent(key: string): Promise<OddsEventView | null> {
  try {
    return (await apiClient.get<ApiEnvelope<OddsEventView>>(`/odds/events/${encodeURIComponent(key)}`)).data.data;
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 404) return null;
    throw e;
  }
}

export function useOddsEvent(key: string | undefined) {
  return useQuery({
    queryKey: ['odds', 'event', key],
    queryFn: () => fetchOddsEvent(key as string),
    enabled: !!key,
    staleTime: 60_000,
    retry: false,
  });
}

/** Multiple total per house for the given legs. */
export function useOddsMultiple(legs: SlipLeg[]) {
  return useQuery({
    queryKey: ['odds', 'multiple', legs.map((l) => l.eventKey + '|' + l.selectionKey)],
    queryFn: async () =>
      (await apiClient.post<ApiEnvelope<MultipleResult>>('/odds/multiple', {
        selections: legs.map(({ eventKey, selectionKey }) => ({ eventKey, selectionKey })),
      })).data.data,
    enabled: legs.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
