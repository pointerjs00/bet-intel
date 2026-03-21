import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface SiteLogoChipProps {
  name: string;
  logoUrl?: string | null;
  slug?: string;
  compact?: boolean;
}

export function SiteLogoChip({ name, logoUrl, slug, compact = false }: SiteLogoChipProps) {
  const { colors } = useTheme();
  const initials = (slug ?? name)
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, compact ? 2 : 3)
    .toUpperCase();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 6 : 8,
        },
      ]}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={[styles.logo, compact && styles.logoCompact]} />
      ) : (
        <View style={[styles.fallback, { backgroundColor: colors.primary }]}>
          <Text style={styles.fallbackText}>{initials}</Text>
        </View>
      )}
      {!compact ? <Text style={[styles.label, { color: colors.textPrimary }]}>{name}</Text> : null}
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
  },
  logo: {
    borderRadius: 8,
    height: 22,
    width: 22,
  },
  logoCompact: {
    height: 18,
    width: 18,
  },
  fallback: {
    alignItems: 'center',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
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
