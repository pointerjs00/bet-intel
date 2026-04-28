import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgendaItem,
  BoletinDetail,
  BoletinShareDetail,
  BoletinStatus,
  CreateBoletinInput,
  CreateBoletinItemInput,
  ItemResult,
  ShareBoletinInput,
  UpdateBoletinInput,
  UpdateBoletinItemInput,
} from '@betintel/shared';

export type { AgendaItem };
import {
  cancelBoletinReminders,
  scheduleSelectionReminders,
} from './notificationService';
import { Alert, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';

/**
 * Saves `content` to a user-accessible location and, if expo-sharing is
 * available, opens the OS share sheet.
 *
 * Android: opens SAF directory picker (user picks Downloads or any folder).
 * iOS:     writes to the app's Documents directory (visible in Files app)
 *          then optionally shares.
 */
async function saveAndShare(
  filename: string,
  content: string,
  encoding: FileSystem.EncodingType,
  shareOptions: { mimeType: string; dialogTitle: string; UTI: string },
): Promise<void> {
  if (Platform.OS === 'android') {
    const SAF = FileSystem.StorageAccessFramework;
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm.granted) return; // user cancelled

    const fileUri = await SAF.createFileAsync(
      perm.directoryUri,
      filename.replace(/\.[^.]+$/, ''), // name without extension
      shareOptions.mimeType,
    );
    await SAF.writeAsStringAsync(fileUri, content, { encoding });
    Alert.alert(shareOptions.dialogTitle, `Guardado com sucesso na pasta escolhida.`);
    return;
  }

  // iOS — write to Documents (accessible via Files app)
  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding });

  const native = requireOptionalNativeModule('ExpoSharing');
  if (native) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    await Sharing.shareAsync(path, shareOptions);
  } else {
    Alert.alert(
      shareOptions.dialogTitle,
      `Guardado em:
${path}

Abre a app Ficheiros para aceder.`,
    );
  }
}
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

/** Updates editable boletin metadata using the authenticated API session. */
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

/** Edits the fields of a single selection within an existing boletin. */
export async function updateBoletinItemRequest(
  boletinId: string,
  itemId: string,
  item: UpdateBoletinItemInput,
): Promise<BoletinDetail> {
  const response = await apiClient.patch<ApiEnvelope<BoletinDetail>>(
    `/betintel/${boletinId}/items/${itemId}`,
    item,
  );
  return response.data.data;
}

/** Returns the authenticated user's own boletins. */
export async function listBoletinsRequest(): Promise<BoletinDetail[]> {
  const response = await apiClient.get<ApiEnvelope<BoletinDetail[]>>('/boletins');
  return response.data.data;
}

// ─── Client-side export helpers ─────────────────────────────────────────────

function formatExportDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function boletinsToRows(boletins: BoletinDetail[]): Record<string, unknown>[] {
  return boletins.map((b) => ({
    Data: formatExportDate(b.betDate ?? b.createdAt),
    Nome: b.name ?? '',
    Casa: b.siteSlug ?? '',
    'Stake (€)': parseFloat(b.stake),
    'Odds totais': parseFloat(b.totalOdds),
    'Retorno potencial (€)': parseFloat(b.potentialReturn),
    'Retorno real (€)': b.actualReturn != null ? parseFloat(b.actualReturn) : '',
    Estado: b.status,
    Freebet: b.isFreebet ? 'Sim' : 'Não',
    'Nº seleções': b.items.length,
    Notas: b.notes ?? '',
  }));
}

function selectionsToRows(boletins: BoletinDetail[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const b of boletins) {
    const date = formatExportDate(b.betDate ?? b.createdAt);
    for (const item of b.items) {
      rows.push({
        Data: date,
        'ID Boletin': b.id,
        Nome: b.name ?? '',
        Desporto: item.sport,
        Competição: item.competition,
        Casa: item.homeTeam,
        Fora: item.awayTeam,
        Mercado: item.market,
        Seleção: item.selection,
        Odd: parseFloat(item.oddValue),
        Resultado: item.result,
      });
    }
  }
  return rows;
}

/** Builds a CSV string from boletins and saves it to a user-accessible location. */
export async function exportBoletinsToCsv(boletins: BoletinDetail[]): Promise<void> {
  const rows = boletinsToRows(boletins);
  if (rows.length === 0) throw new Error('Sem dados para exportar.');

  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');

  await saveAndShare('betintel-export.csv', csv, FileSystem.EncodingType.UTF8, {
    mimeType: 'text/csv',
    dialogTitle: 'Exportar CSV',
    UTI: 'public.comma-separated-values-text',
  });
}

/** Builds a two-sheet XLSX from boletins and saves it to a user-accessible location. */
export async function exportBoletinsToXlsx(boletins: BoletinDetail[]): Promise<void> {
  const boletinRows = boletinsToRows(boletins);
  const selectionRows = selectionsToRows(boletins);
  if (boletinRows.length === 0) throw new Error('Sem dados para exportar.');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(boletinRows), 'Boletins');
  if (selectionRows.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(selectionRows), 'Seleções');
  }

  const base64: string = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await saveAndShare(
    'betintel-export.xlsx',
    base64,
    FileSystem.EncodingType.Base64,
    {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exportar Excel',
      UTI: 'com.microsoft.excel.xlsx',
    },
  );
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

/** Mutation hook for updating editable boletin metadata. */
export function useUpdateBoletinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBoletinInput }) =>
      updateBoletinRequest(id, payload),

    onMutate: async ({ id, payload }) => {
      const key = boletinQueryKeys.detail(id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoletinDetail>(key);
      if (previous) {
        const patch: Record<string, unknown> = {};
        if (payload.name !== undefined) patch.name = payload.name;
        if (payload.notes !== undefined) patch.notes = payload.notes;
        if (payload.siteSlug !== undefined) patch.siteSlug = payload.siteSlug;
        if (payload.stake !== undefined) patch.stake = String(payload.stake);
        if (payload.isPublic !== undefined) patch.isPublic = payload.isPublic;
        if (payload.betDate !== undefined) patch.betDate = payload.betDate;
        queryClient.setQueryData<BoletinDetail>(key, { ...previous, ...patch });
      }
      return { previous, key };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },

    onSuccess: (data) => {
      queryClient.setQueryData(boletinQueryKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
 
      // Keep the kickoff reminder in sync with the updated boletin state.
      // If still PENDING with a future betDate → reschedule (also handles date changes).
      // If resolved/cancelled → cancel any outstanding reminder.
      if (data.status !== 'PENDING') {
        void cancelBoletinReminders(data.id);
      }
    },
  });
}

/** Mutation hook for deleting a boletin. */
export function useDeleteBoletinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBoletinRequest(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: boletinQueryKeys.mine() });
      const previousList = queryClient.getQueryData<BoletinDetail[]>(boletinQueryKeys.mine());
      if (previousList) {
        queryClient.setQueryData<BoletinDetail[]>(
          boletinQueryKeys.mine(),
          previousList.filter((b) => b.id !== id),
        );
      }
      return { previousList };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(boletinQueryKeys.mine(), context.previousList);
      }
    },

    onSuccess: (_data: void, id: string) => {
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
      void cancelBoletinReminders(id);
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

    // Optimistically update the cached detail so the button flips instantly
    onMutate: async ({ boletinId, items }) => {
      const key = boletinQueryKeys.detail(boletinId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoletinDetail>(key);
      if (previous) {
        const resultMap = new Map(items.map((i) => [i.id, i.result]));
        queryClient.setQueryData<BoletinDetail>(key, {
          ...previous,
          items: previous.items.map((item) =>
            resultMap.has(item.id) ? { ...item, result: resultMap.get(item.id)! } : item,
          ),
        });
      }
      return { previous, key };
    },

    onError: (_err, _vars, context) => {
      // Roll back to previous data on failure
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },

    onSuccess: (data) => {
      // Replace optimistic data with authoritative server response (includes recalculated status/odds)
      queryClient.setQueryData(boletinQueryKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
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

    onMutate: async ({ boletinId, itemId }) => {
      const key = boletinQueryKeys.detail(boletinId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoletinDetail>(key);
      if (previous) {
        const remaining = previous.items.filter((i) => i.id !== itemId);
        const totalOdds = remaining.reduce((acc, i) => acc * parseFloat(i.oddValue), 1);
        queryClient.setQueryData<BoletinDetail>(key, {
          ...previous,
          items: remaining,
          totalOdds: totalOdds.toFixed(4),
          potentialReturn: (parseFloat(previous.stake) * totalOdds).toFixed(2),
        });
      }
      return { previous, key };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },

    onSuccess: (data) => {
      queryClient.setQueryData(boletinQueryKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
    },
  });
}

/** Mutation hook for editing a single selection within a boletin. */
export function useUpdateBoletinItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boletinId,
      itemId,
      item,
    }: {
      boletinId: string;
      itemId: string;
      item: UpdateBoletinItemInput;
    }) => updateBoletinItemRequest(boletinId, itemId, item),

    onMutate: async ({ boletinId, itemId, item }) => {
      const key = boletinQueryKeys.detail(boletinId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoletinDetail>(key);
      if (previous) {
        const updatedItems = previous.items.map((i) => {
          if (i.id !== itemId) return i;
          const patched = { ...i } as Record<string, unknown>;
          if (item.homeTeam !== undefined) patched.homeTeam = item.homeTeam;
          if (item.awayTeam !== undefined) patched.awayTeam = item.awayTeam;
          if (item.competition !== undefined) patched.competition = item.competition;
          if (item.sport !== undefined) patched.sport = item.sport;
          if (item.market !== undefined) patched.market = item.market;
          if (item.selection !== undefined) patched.selection = item.selection;
          if (item.oddValue !== undefined) patched.oddValue = String(item.oddValue);
          if (item.result !== undefined) patched.result = item.result;
          return patched as unknown as typeof i;
        });
        const totalOdds = updatedItems.reduce((acc, i) => acc * parseFloat(i.oddValue), 1);
        queryClient.setQueryData<BoletinDetail>(key, {
          ...previous,
          items: updatedItems,
          totalOdds: totalOdds.toFixed(4),
          potentialReturn: (parseFloat(previous.stake) * totalOdds).toFixed(2),
        });
      }
      return { previous, key };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },

    onSuccess: (data) => {
      queryClient.setQueryData(boletinQueryKeys.detail(data.id), data);
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
 
      // When all items are resolved, the boletin status changes from PENDING.
      // Cancel the kickoff reminder — the match is already in progress or done.
      if (data.status !== 'PENDING') {
        void cancelBoletinReminders(data.id);
      }
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

/** Returns the user's pending matches with a future kick-off date, ordered chronologically. */
export async function getAgendaRequest(): Promise<AgendaItem[]> {
  const response = await apiClient.get<ApiEnvelope<AgendaItem[]>>('/boletins/agenda');
  return response.data.data;
}

export const agendaQueryKeys = {
  all: ['agenda'] as const,
};

export function useAgenda() {
  return useQuery({
    queryKey: agendaQueryKeys.all,
    queryFn: getAgendaRequest,
  });
}