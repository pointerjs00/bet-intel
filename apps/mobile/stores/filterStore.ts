import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Sport } from '@betintel/shared';

export interface FilterDateRange {
  from: Date;
  to: Date;
}

interface FilterStateValues {
  selectedSites: string[];
  selectedSports: Sport[];
  selectedMarkets: string[];
  selectedLeague: string | null;
  minOdds: number;
  maxOdds: number;
  dateRange: FilterDateRange | null;
  sortBy: 'best-odds' | 'soonest' | 'most-markets';
  activeFilterCount: number;
}

interface FilterStore extends FilterStateValues {
  setFilter: <K extends keyof FilterStateValues>(key: K, value: FilterStateValues[K]) => void;
  toggleSite: (slug: string) => void;
  toggleSport: (sport: Sport) => void;
  toggleMarket: (market: string) => void;
  setLeague: (league: string | null) => void;
  setDateRange: (range: FilterDateRange | null) => void;
  reset: () => void;
}

const DEFAULT_STATE: Omit<FilterStore, 'setFilter' | 'toggleSite' | 'toggleSport' | 'toggleMarket' | 'setLeague' | 'setDateRange' | 'reset'> = {
  selectedSites: [],
  selectedSports: [],
  selectedMarkets: [],
  selectedLeague: null,
  minOdds: 1.01,
  maxOdds: 20,
  dateRange: null,
  sortBy: 'best-odds',
  activeFilterCount: 0,
};

function computeActiveFilterCount(state: FilterStateValues): number {
  let count = 0;
  if (state.selectedSites.length > 0) count += 1;
  if (state.selectedSports.length > 0) count += 1;
  if (state.selectedMarkets.length > 0) count += 1;
  if (state.selectedLeague) count += 1;
  if (state.minOdds > 1.01 || state.maxOdds < 20) count += 1;
  if (state.dateRange) count += 1;
  if (state.sortBy !== 'best-odds') count += 1;
  return count;
}

function withComputed(state: FilterStateValues): FilterStateValues {
  return {
    ...state,
    activeFilterCount: computeActiveFilterCount(state),
  };
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      setFilter: (key, value) =>
        set((state) => {
          const nextState = {
            ...state,
            [key]: value,
          } as FilterStateValues;
          return withComputed(nextState);
        }),
      toggleSite: (slug) =>
        set((state) => {
          const selectedSites = state.selectedSites.includes(slug)
            ? state.selectedSites.filter((item) => item !== slug)
            : [...state.selectedSites, slug];

          return withComputed({ ...state, selectedSites });
        }),
      toggleSport: (sport) =>
        set((state) => {
          const selectedSports = state.selectedSports.includes(sport)
            ? state.selectedSports.filter((item) => item !== sport)
            : [...state.selectedSports, sport];

          return withComputed({ ...state, selectedSports });
        }),
      toggleMarket: (market) =>
        set((state) => {
          const selectedMarkets = state.selectedMarkets.includes(market)
            ? state.selectedMarkets.filter((item) => item !== market)
            : [...state.selectedMarkets, market];

          return withComputed({ ...state, selectedMarkets });
        }),
      setLeague: (league) =>
        set((state) => withComputed({ ...state, selectedLeague: league })),
      setDateRange: (dateRange) =>
        set((state) => withComputed({ ...state, dateRange })),
      reset: () => set(withComputed(DEFAULT_STATE)),
    }),
    {
      name: 'betintel-filter-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedSites: state.selectedSites,
        selectedSports: state.selectedSports,
        selectedMarkets: state.selectedMarkets,
        selectedLeague: state.selectedLeague,
        minOdds: state.minOdds,
        maxOdds: state.maxOdds,
        dateRange: state.dateRange,
        sortBy: state.sortBy,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FilterStateValues>;
        const mergedDateRange = persisted.dateRange
          ? {
              from: new Date((persisted.dateRange as unknown as { from: string }).from),
              to: new Date((persisted.dateRange as unknown as { to: string }).to),
            }
          : null;

        return {
          ...currentState,
          ...persisted,
          dateRange: mergedDateRange,
          activeFilterCount: computeActiveFilterCount({
            ...DEFAULT_STATE,
            ...persisted,
            dateRange: mergedDateRange,
            activeFilterCount: 0,
          }),
        };
      },
    },
  ),
);
