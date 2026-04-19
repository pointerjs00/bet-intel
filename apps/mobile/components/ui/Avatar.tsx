import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../theme/useTheme';
import { resolveMediaUrl } from '../../utils/media';

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showOnline?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES = { sm: 32, md: 40, lg: 56, xl: 80 } as const;
const FONT_SIZES = { sm: 12, md: 15, lg: 22, xl: 30 } as const;

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

export function Avatar({ uri, name, size = 'md', showOnline, style }: AvatarProps) {
  const { colors } = useTheme();
  const dimension = SIZES[size];
  const fontSize = FONT_SIZES[size];
  const resolvedUri = resolveMediaUrl(uri);

  return (
    <View
      style={[
        styles.container,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
        style,
      ]}
    >
      {resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          cachePolicy="disk"
          contentFit="cover"
          style={[
            styles.image,
            { width: dimension, height: dimension, borderRadius: dimension / 2 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: dimension,
              height: dimension,
              borderRadius: dimension / 2,
              backgroundColor: colors.surfaceRaised,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize, color: colors.textSecondary }]}>
            {getInitials(name)}
          </Text>
        </View>
      )}
      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor: colors.primary,
              borderColor: colors.surface,
              width: dimension * 0.3,
              height: dimension * 0.3,
              borderRadius: dimension * 0.15,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
  onlineDot: {
    borderWidth: 2,
    bottom: 0,
    position: 'absolute',
    right: 0,
  },
});
