import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { tokens } from '../../theme/tokens';

/** Typography scale of the v2 design (PLANO_MELHORIAS.md §6.2). */
export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'number' | 'numberLarge';
export type TextTone = 'primary' | 'secondary' | 'muted' | 'positive' | 'negative' | 'pending' | 'accent' | 'inverse';

const F = tokens.font.family;

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontFamily: F.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  title: { fontFamily: F.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: F.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: F.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: F.medium, fontSize: 12, lineHeight: 16 },
  number: { fontFamily: F.numeric, fontSize: 17, fontVariant: ['tabular-nums'] },
  numberLarge: { fontFamily: F.numericBold, fontSize: 36, lineHeight: 42, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

/** Text with the design-system font, size and colour. Prefer this over raw <Text> in new screens. */
export function AppText({ variant = 'body', tone, style, ...rest }: AppTextProps) {
  const { colors, isDark } = useTheme();
  const defaultTone: TextTone = variant === 'label' || variant === 'caption' ? 'secondary' : 'primary';
  const color = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    positive: colors.positive,
    negative: colors.negative,
    pending: colors.warning,
    accent: colors.primary,
    inverse: isDark ? '#06140C' : '#FFFFFF',
  }[tone ?? defaultTone];
  return <Text {...rest} style={[VARIANTS[variant], { color }, style]} />;
}
