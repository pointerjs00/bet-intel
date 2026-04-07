import { useColorScheme } from 'react-native';
import { tokens, type ThemeColors, type ThemeMode } from './tokens';
import { useThemeStore } from '../stores/themeStore';

export interface UseThemeResult {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  tokens: typeof tokens;
}

/** Returns true if the current local hour falls within the dark-mode schedule window. */
function isInDarkSchedule(start: number, end: number): boolean {
  const hour = new Date().getHours();
  // e.g. start=22, end=7 → dark from 22:00 to 06:59
  if (start > end) {
    return hour >= start || hour < end;
  }
  // e.g. start=20, end=23 → dark from 20:00 to 22:59
  return hour >= start && hour < end;
}

/**
 * Resolves the app theme from user preference + system color scheme.
 */
export function useTheme(): UseThemeResult {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);
  const scheduleStart = useThemeStore((state) => state.scheduleStart);
  const scheduleEnd = useThemeStore((state) => state.scheduleEnd);

  let mode: ThemeMode;
  if (preference === 'scheduled') {
    mode = isInDarkSchedule(scheduleStart, scheduleEnd) ? 'dark' : 'light';
  } else if (preference === 'system') {
    mode = systemScheme === 'dark' ? 'dark' : 'light';
  } else {
    mode = preference;
  }

  return {
    mode,
    colors: tokens.colors[mode],
    isDark: mode === 'dark',
    tokens,
  };
}
