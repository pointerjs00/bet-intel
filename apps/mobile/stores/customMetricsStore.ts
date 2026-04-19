import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CustomMetricDef } from '../types/customMetric';

interface CustomMetricsStore {
  metrics: CustomMetricDef[];
  addMetric: (metric: CustomMetricDef) => void;
  updateMetric: (id: string, partial: Partial<Omit<CustomMetricDef, 'id' | 'createdAt'>>) => void;
  removeMetric: (id: string) => void;
  reorderMetrics: (fromIndex: number, toIndex: number) => void;
  getMetric: (id: string) => CustomMetricDef | undefined;
}

export const useCustomMetricsStore = create<CustomMetricsStore>()(
  persist(
    (set, get) => ({
      metrics: [],

      addMetric: (metric) =>
        set((state) => ({ metrics: [...state.metrics, metric] })),

      updateMetric: (id, partial) =>
        set((state) => ({
          metrics: state.metrics.map((m) =>
            m.id === id ? { ...m, ...partial, updatedAt: Date.now() } : m,
          ),
        })),

      removeMetric: (id) =>
        set((state) => ({
          metrics: state.metrics.filter((m) => m.id !== id),
        })),

      reorderMetrics: (fromIndex, toIndex) =>
        set((state) => {
          const arr = [...state.metrics];
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(toIndex, 0, moved);
          return { metrics: arr };
        }),

      getMetric: (id) => get().metrics.find((m) => m.id === id),
    }),
    {
      name: 'custom-metrics',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ metrics: state.metrics }),
    },
  ),
);
