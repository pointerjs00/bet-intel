import { useColorScheme } from 'react-native';
import { tokens, type ThemeColors, type ThemeMode } from './tokens';
import { useThemeStore } from '../stores/themeStore';

export interface UseThemeResult {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  tokens: typeof tokens;
}

/**
 * Resolves the app theme from user preference + system color scheme.
 */
export function useTheme(): UseThemeResult {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);

  const mode: ThemeMode =
    preference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference;

  return {
    mode,
    colors: tokens.colors[mode],
    isDark: mode === 'dark',
    tokens,
  };
}
