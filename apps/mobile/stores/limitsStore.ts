import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Personal betting limits (plan #34). Kept on the device: the app has a single user. */
interface LimitsStore {
  /** Maximum net loss per week (Monday to Sunday), in euros. null = no limit. */
  weeklyLossLimit: number | null;
  /** Maximum amount staked per calendar month, in euros. null = no limit. */
  monthlyStakeLimit: number | null;
  /** Warn when a bigger-than-usual stake follows a recent loss. */
  chaseAlert: boolean;
  setWeeklyLossLimit: (value: number | null) => void;
  setMonthlyStakeLimit: (value: number | null) => void;
  setChaseAlert: (value: boolean) => void;
}

export const useLimitsStore = create<LimitsStore>()(
  persist(
    (set) => ({
      weeklyLossLimit: null,
      monthlyStakeLimit: null,
      chaseAlert: true,
      setWeeklyLossLimit: (weeklyLossLimit) => set({ weeklyLossLimit }),
      setMonthlyStakeLimit: (monthlyStakeLimit) => set({ monthlyStakeLimit }),
      setChaseAlert: (chaseAlert) => set({ chaseAlert }),
    }),
    {
      name: 'betintel-limits-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ weeklyLossLimit: s.weeklyLossLimit, monthlyStakeLimit: s.monthlyStakeLimit, chaseAlert: s.chaseAlert }),
    },
  ),
);
