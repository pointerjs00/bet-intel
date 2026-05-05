import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const fixtureAlertQueryKeys = {
  all: ['fixture-alerts'] as const,
};

async function fetchWatchedFixtures(): Promise<string[]> {
  const { data } = await apiClient.get<ApiEnvelope<string[]>>('/fixture-alerts');
  return data.data;
}

export function useWatchedFixtures(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: fixtureAlertQueryKeys.all,
    queryFn: fetchWatchedFixtures,
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled !== false,
  });
}

export function useToggleFixtureWatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fixtureId, watching }: { fixtureId: string; watching: boolean }) => {
      if (watching) {
        await apiClient.delete(`/fixture-alerts/${fixtureId}`);
      } else {
        await apiClient.post(`/fixture-alerts/${fixtureId}`, {});
      }
      return { fixtureId, watching: !watching };
    },
    onMutate: async ({ fixtureId, watching }) => {
      await queryClient.cancelQueries({ queryKey: fixtureAlertQueryKeys.all });
      const previous = queryClient.getQueryData<string[]>(fixtureAlertQueryKeys.all);
      queryClient.setQueryData<string[]>(fixtureAlertQueryKeys.all, (old = []) =>
        watching ? old.filter(id => id !== fixtureId) : [...old, fixtureId],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(fixtureAlertQueryKeys.all, ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: fixtureAlertQueryKeys.all });
    },
  });
}
