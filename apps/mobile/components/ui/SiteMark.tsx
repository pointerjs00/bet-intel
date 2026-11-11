import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BETTING_SITES } from '../../utils/sportAssets';
import { useTheme } from '../../theme/useTheme';

interface SiteMarkProps {
  slug: string | null | undefined;
  /** Logo edge in px. */
  size?: number;
  /** Show the site's name next to the logo. */
  showName?: boolean;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}

/** Betting site logo (rounded square) with its name, replacing plain "Betclic" / "Betano" text. */
export function SiteMark({ slug, size = 16, showName = true, textStyle, style }: SiteMarkProps) {
  const { colors } = useTheme();
  const site = slug ? BETTING_SITES.find((s) => s.slug === slug) : undefined;
  if (!slug) return null;
  return (
    <View style={[styles.row, style]}>
      {site?.logo ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={site.logo}
          style={{ borderRadius: size * 0.28, height: size, width: size }}
        />
      ) : null}
      {showName || !site?.logo ? (
        <Text numberOfLines={1} style={[styles.name, { color: colors.textMuted }, textStyle]}>{site?.name ?? slug}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  name: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});
