import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_SECTION_ORDER } from '../constants/statsSections';

interface StatsDashboardStore {
  /** Ordered list of section IDs. Sections not in this list are appended at the end (for forward-compat when new sections are added). */
  sectionOrder: string[];
  /** Set of hidden section IDs. */
  hiddenSections: Record<string, boolean>;
  /** Reorder: move section from one index to another. */
  moveSection: (fromIndex: number, toIndex: number) => void;
  /** Toggle visibility of a section. */
  toggleSection: (sectionId: string) => void;
  /** Reset to defaults. */
  resetToDefaults: () => void;
  /** Get the effective ordered list, including any new sections not yet in the user's order. */
  getEffectiveOrder: () => string[];
  /** Check if a section is visible. */
  isSectionVisible: (sectionId: string) => boolean;
}

export const useStatsDashboardStore = create<StatsDashboardStore>()(
  persist(
    (set, get) => ({
      sectionOrder: DEFAULT_SECTION_ORDER,
      hiddenSections: {},

      moveSection: (fromIndex, toIndex) =>
        set((state) => {
          const order = [...state.sectionOrder];
          const [moved] = order.splice(fromIndex, 1);
          order.splice(toIndex, 0, moved);
          return { sectionOrder: order };
        }),

      toggleSection: (sectionId) =>
        set((state) => {
          const hidden = { ...state.hiddenSections };
          if (hidden[sectionId]) {
            delete hidden[sectionId];
          } else {
            hidden[sectionId] = true;
          }
          return { hiddenSections: hidden };
        }),

      resetToDefaults: () =>
        set({ sectionOrder: DEFAULT_SECTION_ORDER, hiddenSections: {} }),

      getEffectiveOrder: () => {
        const { sectionOrder } = get();
        const orderSet = new Set(sectionOrder);
        const missing = DEFAULT_SECTION_ORDER.filter((id) => !orderSet.has(id));
        return [...sectionOrder, ...missing];
      },

      isSectionVisible: (sectionId) => !get().hiddenSections[sectionId],
    }),
    {
      name: 'stats-dashboard-layout',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sectionOrder: state.sectionOrder,
        hiddenSections: state.hiddenSections,
      }),
    },
  ),
);
