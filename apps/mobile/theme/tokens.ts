// Design tokens v3: dark = "Neon Arena" (deep navy-black, electric green + violet, glowing
// accents), light = "Clean Pro" (cool grey-blue ground, white cards with layered soft shadows,
// ink hero card). Same base keys as v1/v2 so every screen reading useTheme() picks them up.
export const tokens = {
  colors: {
    dark: {
      background: '#07090F',
      surface: '#111522',
      surfaceRaised: '#1A2033',
      border: '#252C44',
      primary: '#3DFFA2',
      primaryDark: '#1FD98A',
      danger: '#FF6B7A',
      warning: '#FFC24B',
      info: '#5AA9FF',
      textPrimary: '#F4F6FF',
      textSecondary: '#A3AAC6',
      textMuted: '#8B93B3',
      gold: '#FFC24B',
      live: '#FF3B5C',
      /** Profit and won states as text. */
      positive: '#3DFFA2',
      /** Losses as text. */
      negative: '#FF6B7A',
      /** Text and icons on a primary-coloured fill. */
      onPrimary: '#04140C',
      /** Secondary brand colour (selected dates, social, highlights). */
      accent: '#8B5CFF',
      /** Text-safe accent on dark surfaces. */
      accentText: '#B79CFF',
      /** Third colour for avatars and notification dots. */
      accentAlt: '#FF4FD8',
      /** Hero card gradient (top-left → bottom-right) and its text. */
      heroFrom: '#1B1446',
      heroVia: '#0E2A3A',
      heroTo: '#0A3B2A',
      heroText: '#F4F6FF',
      heroTextMuted: '#C9CFF0',
      heroPositive: '#3DFFA2',
      heroNegative: '#FF8A96',
      /** Primary button gradient end (start is `primary`). */
      primaryGradientEnd: '#1FD3FF',
      /** Coloured shadow under primary elements. */
      glow: '#3DFFA2',
      shadow: '#000000',
    },
    light: {
      background: '#F3F5F9',
      surface: '#FFFFFF',
      surfaceRaised: '#EEF1F6',
      border: '#E4E8EF',
      primary: '#0B8F5A',
      primaryDark: '#087447',
      danger: '#D92D20',
      warning: '#B45309',
      info: '#2563EB',
      textPrimary: '#0F172A',
      textSecondary: '#5B6578',
      textMuted: '#667085',
      gold: '#A16207',
      live: '#E11D48',
      positive: '#0B8F5A',
      negative: '#D92D20',
      onPrimary: '#FFFFFF',
      accent: '#2563EB',
      accentText: '#2563EB',
      accentAlt: '#E11D48',
      heroFrom: '#0F172A',
      heroVia: '#16213A',
      heroTo: '#0F2A2A',
      heroText: '#FFFFFF',
      heroTextMuted: '#A5B0C5',
      heroPositive: '#4ADE80',
      heroNegative: '#FCA5A5',
      primaryGradientEnd: '#0B8F5A',
      glow: '#0B8F5A',
      shadow: '#0F172A',
    },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 14, lg: 18, xl: 22, full: 9999 },
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
export type ThemeColors = { [K in keyof (typeof tokens.colors)['dark']]: string };
