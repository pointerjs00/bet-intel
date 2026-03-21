import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ActiveTheme = 'light' | 'dark';

interface ThemeStore {
  preference: ThemePreference;
  activeTheme: ActiveTheme;
  setPreference: (pref: ThemePreference) => void;
  setActiveTheme: (theme: ActiveTheme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preference: 'system',
      activeTheme: 'light',
      setPreference: (preference) => set({ preference }),
      setActiveTheme: (activeTheme) => set({ activeTheme }),
    }),
    {
      name: 'betintel-theme-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preference: state.preference,
        activeTheme: state.activeTheme,
      }),
    },
  ),
);
