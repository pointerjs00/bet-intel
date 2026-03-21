export const tokens = {
  colors: {
    dark: {
      background: '#0D0D0D',
      surface: '#1A1A1A',
      surfaceRaised: '#242424',
      border: '#2E2E2E',
      primary: '#00C851',
      primaryDark: '#009A3E',
      danger: '#FF3B30',
      warning: '#FF9500',
      info: '#007AFF',
      textPrimary: '#FFFFFF',
      textSecondary: '#A0A0A0',
      textMuted: '#505050',
      gold: '#FFD700',
      live: '#FF3B30',
    },
    light: {
      background: '#F2F2F7',
      surface: '#FFFFFF',
      surfaceRaised: '#F8F8F8',
      border: '#E5E5EA',
      primary: '#00A843',
      primaryDark: '#007A32',
      danger: '#FF3B30',
      warning: '#FF9500',
      info: '#007AFF',
      textPrimary: '#000000',
      textSecondary: '#6C6C70',
      textMuted: '#AEAEB2',
      gold: '#C9A227',
      live: '#FF3B30',
    },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
  font: {
    sizes: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 32 },
    weights: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '900' },
  },
} as const;

export type ThemeMode = keyof typeof tokens.colors;
export type ThemeColors = (typeof tokens.colors)[ThemeMode];
