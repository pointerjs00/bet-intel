import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface SocialAvatarProps {
  name: string;
  avatarUrl: string | null;
  size?: number;
}

/** Compact avatar with initials fallback for social cards. */
export function SocialAvatar({ name, avatarUrl, size = 44 }: SocialAvatarProps) {
  const { colors } = useTheme();

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.image, { height: size, width: size }]} />;
  }

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={[styles.fallback, { backgroundColor: colors.primary, height: size, width: size }]}>
      <Text style={[styles.initials, { fontSize: Math.max(12, size * 0.28) }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 999,
  },
  fallback: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});