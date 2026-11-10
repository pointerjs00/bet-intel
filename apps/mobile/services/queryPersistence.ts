import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

// Bump when cached response shapes change in a way old data would break screens.
const KEY = 'rq-cache-v1';
const MAX_AGE_MS = 3 * 24 * 3600e3;
const MAX_BYTES = 4 * 1024 * 1024;
const SAVE_DELAY_MS = 2000;

interface Persisted { savedAt: number; state: unknown }

/**
 * Restores the last session's query data so screens open with content instantly (stale-while-
 * revalidate: restored data is marked old, so React Query refreshes it in the background).
 */
export async function restoreQueryCache(client: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Persisted;
    if (Date.now() - saved.savedAt > MAX_AGE_MS) { await AsyncStorage.removeItem(KEY); return; }
    hydrate(client, saved.state as Parameters<typeof hydrate>[1]);
  } catch {
    // A corrupt cache only costs one cold start.
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  }
}

/** Saves successful queries (debounced) whenever the cache changes. Returns the unsubscribe. */
export function persistQueryCache(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    try {
      const state = dehydrate(client, {
        // Search-as-you-type results are short-lived and numerous; don't keep them.
        shouldDehydrateQuery: (q) => q.state.status === 'success' && !q.queryKey.includes('search'),
      });
      const raw = JSON.stringify({ savedAt: Date.now(), state } satisfies Persisted);
      if (raw.length <= MAX_BYTES) void AsyncStorage.setItem(KEY, raw).catch(() => undefined);
    } catch {
      // Non-serialisable data: skip this save.
    }
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'removed') return;
    if (!timer) timer = setTimeout(save, SAVE_DELAY_MS);
  });
  return () => { unsubscribe(); if (timer) clearTimeout(timer); };
}

/** Drops the persisted cache (logout, account switch). */
export async function clearPersistedQueryCache(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
