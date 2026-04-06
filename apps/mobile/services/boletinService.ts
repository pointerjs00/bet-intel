import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BoletinDetail,
  BoletinShareDetail,
  BoletinStatus,
  CreateBoletinInput,
  CreateBoletinItemInput,
  ItemResult,
  ShareBoletinInput,
  UpdateBoletinInput,
} from '@betintel/shared';
import { apiClient } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface SharedBoletinFeedItem {
  share: BoletinShareDetail;
  boletin: BoletinDetail;
}

export const boletinQueryKeys = {
  all: ['boletins'] as const,
  mine: () => ['boletins', 'mine'] as const,
  detail: (id: string) => ['boletins', 'detail', id] as const,
  shared: () => ['boletins', 'shared'] as const,
};

/** Creates a boletin using the authenticated API session. */
export async function createBoletinRequest(payload: CreateBoletinInput): Promise<BoletinDetail> {
  const response = await apiClient.post<ApiEnvelope<BoletinDetail>>('/boletins', payload);
  return response.data.data;
}

/** Updates a boletin using the authenticated API session. */
export async function updateBoletinRequest(id: string, payload: UpdateBoletinInput): Promise<BoletinDetail> {
  const response = await apiClient.patch<ApiEnvelope<BoletinDetail>>(`/betintel/${id}`, payload);
  return response.data.data;
}

/** Deletes a boletin using the authenticated API session. */
export async function deleteBoletinRequest(id: string): Promise<void> {
  await apiClient.delete(`/betintel/${id}`);
}

/** Shares a boletin with one or more user IDs. */
export async function shareBoletinRequest(id: string, payload: ShareBoletinInput): Promise<BoletinShareDetail[]> {
  const response = await apiClient.post<ApiEnvelope<BoletinShareDetail[]>>(`/betintel/${id}/share`, payload);
  return response.data.data;
}

/** Updates individual item results (mark as won/lost/void). */
export async function updateBoletinItemsRequest(
  id: string,
  items: Array<{ id: string; result: ItemResult }>,
): Promise<BoletinDetail> {
  const response = await apiClient.patch<ApiEnvelope<BoletinDetail>>(`/betintel/${id}/items`, { items });
  return response.data.data;
}

/** Adds a new selection to an existing boletin. */
export async function addBoletinItemRequest(
  id: string,
  item: CreateBoletinItemInput,
): Promise<BoletinDetail> {
  const response = await apiClient.post<ApiEnvelope<BoletinDetail>>(`/betintel/${id}/items`, item);
  return response.data.data;
}

/** Removes a selection from an existing boletin. */
export async function deleteBoletinItemRequest(boletinId: string, itemId: string): Promise<BoletinDetail> {
  const response = await apiClient.delete<ApiEnvelope<BoletinDetail>>(`/betintel/${boletinId}/items/${itemId}`);
  return response.data.data;
}

/** Returns the authenticated user's own boletins. */
export async function listBoletinsRequest(): Promise<BoletinDetail[]> {
  const response = await apiClient.get<ApiEnvelope<BoletinDetail[]>>('/boletins');
  return response.data.data;
}

/** Returns the authenticated user's own boletins. */
export function useBoletins() {
  return useQuery({
    queryKey: boletinQueryKeys.mine(),
    queryFn: listBoletinsRequest,
  });
}

/** Returns a single boletin detail. */
export function useBoletinDetail(id: string) {
  return useQuery({
    queryKey: boletinQueryKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<BoletinDetail>>(`/betintel/${id}`);
      return response.data.data;
    },
    enabled: Boolean(id),
  });
}

/** Returns the list of boletins shared with the authenticated user. */
export function useSharedBoletins() {
  return useQuery({
    queryKey: boletinQueryKeys.shared(),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<SharedBoletinFeedItem[]>>('/betintel/shared');
      return response.data.data;
    },
  });
}

/** Mutation hook for updating boletin metadata or status. */
export function useUpdateBoletinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBoletinInput }) =>
      updateBoletinRequest(id, payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.detail(data.id) });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
    },
  });
}

/** Mutation hook for deleting a boletin. */
export function useDeleteBoletinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBoletinRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
    },
  });
}

/** Mutation hook for sharing a boletin. */
export function useShareBoletinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ShareBoletinInput }) =>
      shareBoletinRequest(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
    },
  });
}

/** Mutation hook for updating individual item results (won/lost/void). */
export function useUpdateBoletinItemsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boletinId, items }: { boletinId: string; items: Array<{ id: string; result: ItemResult }> }) =>
      updateBoletinItemsRequest(boletinId, items),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.detail(data.id) });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
    },
  });
}

/** Mutation hook for adding a new selection to an existing boletin. */
export function useAddBoletinItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boletinId, item }: { boletinId: string; item: CreateBoletinItemInput }) =>
      addBoletinItemRequest(boletinId, item),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.detail(data.id) });
    },
  });
}

/** Mutation hook for deleting a selection from an existing boletin. */
export function useDeleteBoletinItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boletinId, itemId }: { boletinId: string; itemId: string }) =>
      deleteBoletinItemRequest(boletinId, itemId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.detail(data.id) });
    },
  });
}

/** Filters a boletin list by status while preserving the default all view. */
export function filterBoletinsByStatus(
  boletins: BoletinDetail[],
  status: 'ALL' | BoletinStatus,
): BoletinDetail[] {
  if (status === 'ALL') {
    return boletins;
  }

  return boletins.filter((boletin) => boletin.status === status);
}