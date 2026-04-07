import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system' | 'scheduled';
export type ActiveTheme = 'light' | 'dark';

interface ThemeStore {
  preference: ThemePreference;
  activeTheme: ActiveTheme;
  /** Hour (0-23) when dark mode starts in scheduled mode. Default 22. */
  scheduleStart: number;
  /** Hour (0-23) when dark mode ends in scheduled mode. Default 7. */
  scheduleEnd: number;
  setPreference: (pref: ThemePreference) => void;
  setActiveTheme: (theme: ActiveTheme) => void;
  setSchedule: (start: number, end: number) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preference: 'system',
      activeTheme: 'light',
      scheduleStart: 22,
      scheduleEnd: 7,
      setPreference: (preference) => set({ preference }),
      setActiveTheme: (activeTheme) => set({ activeTheme }),
      setSchedule: (start, end) => set({ scheduleStart: start, scheduleEnd: end }),
    }),
    {
      name: 'betintel-theme-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preference: state.preference,
        activeTheme: state.activeTheme,
        scheduleStart: state.scheduleStart,
        scheduleEnd: state.scheduleEnd,
      }),
    },
  ),
);
