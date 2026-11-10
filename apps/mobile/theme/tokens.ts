// Design tokens v2 (PLANO_MELHORIAS.md §6.2): dark "Painel escuro" palette by default,
// light theme from the "Claro editorial" direction. Same keys as v1 so every screen
// that reads colors through useTheme() picks the new palette up automatically.
export const tokens = {
  colors: {
    dark: {
      background: '#0B0D0C',
      surface: '#151817',
      surfaceRaised: '#1D211F',
      border: '#262B28',
      primary: '#2FD27A',
      primaryDark: '#1FA862',
      danger: '#FF6B5E',
      warning: '#F5B13D',
      info: '#6EA8FF',
      textPrimary: '#F2F5F3',
      textSecondary: '#A3ABA6',
      // ~6:1 on surface (v1 #505050 was ~2.2:1 and failed WCAG)
      textMuted: '#8E9791',
      gold: '#F2C94C',
      live: '#FF6B5E',
      /** Profit and won states as text (brighter than primary for contrast on dark surfaces). */
      positive: '#5BE39A',
      /** Losses as text. */
      negative: '#FF8A7F',
      /** Text and icons on a primary-coloured fill. */
      onPrimary: '#FFFFFF',
    },
    light: {
      background: '#F4F3EF',
      surface: '#FFFFFF',
      surfaceRaised: '#F8F7F3',
      border: '#E6E4DE',
      primary: '#0E6B42',
      primaryDark: '#0A5233',
      danger: '#B23A27',
      warning: '#9A5B00',
      info: '#1F5FD1',
      textPrimary: '#17181A',
      textSecondary: '#5B5F66',
      textMuted: '#6B7078',
      gold: '#8A6A00',
      live: '#C2412D',
      positive: '#0E6B42',
      negative: '#B23A27',
      onPrimary: '#FFFFFF',
    },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 12, lg: 16, xl: 20, full: 9999 },
  font: {
    /** Loaded in app/_layout.tsx. Use `numeric` for money, odds and percentages (tabular figures). */
    family: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold',
      numeric: 'SpaceGrotesk_600SemiBold',
      numericBold: 'SpaceGrotesk_700Bold',
    },
    sizes: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 32 },
    weights: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '900' },
  },
} as const;

export type ThemeMode = keyof typeof tokens.colors;
export type ThemeColors = (typeof tokens.colors)[ThemeMode];
