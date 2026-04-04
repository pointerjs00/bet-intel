import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { SITE_LOGOS } from '../../constants/siteLogos';

interface SiteLogoChipProps {
  name: string;
  logoUrl?: string | null;
  slug?: string;
  /** When true, renders a minimal inline chip (logo + name, no border/background). */
  compact?: boolean;
}

export function SiteLogoChip({ name, logoUrl, slug, compact = false }: SiteLogoChipProps) {
  const { colors } = useTheme();
  const initials = (slug ?? name)
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 2)
    .toUpperCase();

  // Prefer remote logoUrl, then local bundled asset, then letter fallback.
  const localSource = slug ? SITE_LOGOS[slug] : undefined;
  const imageSource = logoUrl ? { uri: logoUrl } : localSource;

  if (compact) {
    // Icon-only mode: bare logo image (no border, no text).
    // Use this when the chip is embedded inside another component (e.g. Chip icon slot)
    // that already displays the site name as its own label.
    return imageSource ? (
      <Image source={imageSource} style={styles.logoCompact} resizeMode="contain" />
    ) : (
      <View style={[styles.fallback, { backgroundColor: colors.primary }]}>
        <Text style={styles.fallbackText}>{initials}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
        },
      ]}
    >
      {imageSource ? (
        <Image source={imageSource} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.fallback, { backgroundColor: colors.primary }]}>
          <Text style={styles.fallbackText}>{initials}</Text>
        </View>
      )}
      <Text style={[styles.label, { color: colors.textPrimary }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  logo: {
    borderRadius: 6,
    height: 22,
    width: 22,
  },
  logoCompact: {
    borderRadius: 4,
    height: 20,
    width: 20,
  },
  fallback: {
    alignItems: 'center',
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  fallbackText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },

});
