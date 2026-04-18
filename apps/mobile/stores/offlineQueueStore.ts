import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { apiClient } from '../services/apiClient';

export type QueuedMutationMethod = 'POST' | 'PATCH' | 'DELETE';

export interface QueuedMutation {
  id: string;
  url: string;
  method: QueuedMutationMethod;
  body?: unknown;
  enqueuedAt: number;
}

interface OfflineQueueState {
  queue: QueuedMutation[];
  pendingCount: number;
  /** Enqueue a mutation to be replayed when connectivity returns. */
  enqueue: (mutation: Omit<QueuedMutation, 'id' | 'enqueuedAt'>) => void;
  /** Attempt to flush all queued mutations in order. Skips failed ones. */
  flushQueue: () => Promise<void>;
  /** Remove a specific mutation from the queue (after success or manual dismiss). */
  dequeue: (id: string) => void;
  /** Clear every queued mutation. */
  clearQueue: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      pendingCount: 0,

      enqueue: (mutation) => {
        const item: QueuedMutation = {
          ...mutation,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          enqueuedAt: Date.now(),
        };
        set((state) => ({
          queue: [...state.queue, item],
          pendingCount: state.queue.length + 1,
        }));
      },

      dequeue: (id) => {
        set((state) => {
          const queue = state.queue.filter((m) => m.id !== id);
          return { queue, pendingCount: queue.length };
        });
      },

      clearQueue: () => set({ queue: [], pendingCount: 0 }),

      flushQueue: async () => {
        const { queue } = get();
        if (queue.length === 0) return;

        for (const mutation of queue) {
          try {
            await apiClient.request({
              method: mutation.method,
              url: mutation.url,
              data: mutation.body,
            });
            // Remove from queue on success
            get().dequeue(mutation.id);
          } catch {
            // Leave in queue if still failing — will retry on next flush
            if (__DEV__) {
              console.warn('[BetIntel] Offline queue flush failed for:', mutation.url);
            }
          }
        }
      },
    }),
    {
      name: 'betintel-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the queue array; skip derived pendingCount
      partialize: (state) => ({ queue: state.queue }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.pendingCount = state.queue.length;
        }
      },
    },
  ),
);
