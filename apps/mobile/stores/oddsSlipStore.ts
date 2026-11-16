import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { pruneLegs, toggleLeg, type AddResult, type SlipLeg } from '../utils/odds/slip';
import type { HouseId } from '../utils/odds/types';

interface OddsSlipState {
  legs: SlipLeg[];
  stake: number;
  pendingHouse: HouseId | null;
  toggle: (leg: SlipLeg) => AddResult & { removed?: boolean };
  remove: (eventKey: string) => void;
  clear: () => void;
  setStake: (n: number) => void;
  setPendingHouse: (h: HouseId | null) => void;
  prune: () => void;
}

/** Odds multiple being built on the comparator screens (persisted). */
export const useOddsSlipStore = create<OddsSlipState>()(
  persist(
    (set, get) => ({
      legs: [],
      stake: 10,
      pendingHouse: null,
      toggle: (leg) => {
        const result = toggleLeg(get().legs, leg);
        set({ legs: result.legs });
        return result;
      },
      remove: (eventKey) => set({ legs: get().legs.filter((l) => l.eventKey !== eventKey) }),
      clear: () => set({ legs: [], pendingHouse: null }),
      setStake: (n) => set({ stake: n }),
      setPendingHouse: (h) => set({ pendingHouse: h }),
      prune: () => set({ legs: pruneLegs(get().legs, Date.now()) }),
    }),
    { name: 'odds-slip', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
