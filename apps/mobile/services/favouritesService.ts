import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FavouriteType, Sport, UserFavourite } from '@betintel/shared';
import { apiClient } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const favouritesQueryKeys = {
  all: ['favourites'] as const,
  bySport: (sport?: string) => ['favourites', sport ?? 'all'] as const,
};

type FavouriteEntry = Pick<UserFavourite, 'id' | 'type' | 'sport' | 'targetKey' | 'createdAt'>;

async function fetchFavourites(sport?: string): Promise<FavouriteEntry[]> {
  const params = sport ? { sport } : undefined;
  const { data } = await apiClient.get<ApiEnvelope<FavouriteEntry[]>>('/favourites', { params });
  return data.data;
}

export function useFavourites(sport?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: favouritesQueryKeys.bySport(sport),
    queryFn: () => fetchFavourites(sport),
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 30 * 60 * 1000,
    enabled: options?.enabled !== false,
  });
}

interface ToggleResult extends FavouriteEntry {
  action: 'added' | 'removed';
}

export function useToggleFavouriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { type: FavouriteType; sport: Sport; targetKey: string }) => {
      const { data } = await apiClient.post<ApiEnvelope<ToggleResult>>('/favourites/toggle', payload);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favouritesQueryKeys.all });
    },
  });
}

export function useBulkSetFavouritesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      sport: Sport;
      favourites: Array<{ type: FavouriteType; targetKey: string }>;
    }) => {
      const { data } = await apiClient.put<ApiEnvelope<FavouriteEntry[]>>('/favourites/bulk', payload);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favouritesQueryKeys.all });
    },
  });
}
