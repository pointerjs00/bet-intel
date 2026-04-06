import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getPlayerPhotoUrl, getTeamLogoUrl } from '../../utils/sportAssets';

interface TeamBadgeProps {
  /** Team name as stored in the DB (e.g. "SL Benfica"). */
  name: string;
  /** Size in logical pixels — badge is square, font uses the same value. */
  size?: number;
  imageUrl?: string | null;
  variant?: 'team' | 'player' | 'auto';
  style?: object;
}

/** Deterministic background colour derived from the team name string. */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 38%)`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // Use first letter of first and last word
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Small team badge — shows crest image or coloured initials fallback. */
export function TeamBadge({ name, size = 18, imageUrl, variant = 'auto', style }: TeamBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const uri = imageUrl ?? (variant === 'player' ? getPlayerPhotoUrl(name) : getTeamLogoUrl(name));
  const showImage = uri && !imgFailed;
  const isPlayer = variant === 'player' || (variant === 'auto' && Boolean(imageUrl));
  const borderRadius = isPlayer ? size / 2 : size / 4;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius },
        showImage
          ? { backgroundColor: 'rgba(255, 255, 255, 0.92)' }
          : { backgroundColor: nameToColor(name) },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={{ width: size * 0.88, height: size * 0.88, borderRadius }}
          onError={() => setImgFailed(true)}
          resizeMode={isPlayer ? 'cover' : 'contain'}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            { fontSize: Math.max(size * 0.38, 7), lineHeight: size },
          ]}
          numberOfLines={1}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
});
