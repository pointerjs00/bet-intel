import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getCompetitionBranding, getLeagueLogoUrl, getCountryFlagEmoji } from '../../utils/sportAssets';

interface CompetitionBadgeProps {
  /** Competition/league name as stored in DB. */
  name: string;
  /** Country name (Portuguese). Shown as flag emoji when no logo found. */
  country?: string;
  /** Size in logical pixels. */
  size?: number;
  disableImage?: boolean;
  style?: object;
}

/** League logo image, falling back to a country flag emoji badge. */
function CompetitionBadgeComponent({
  name,
  country,
  size = 18,
  disableImage = false,
  style,
}: CompetitionBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const uri = useMemo(() => getLeagueLogoUrl(name), [name]);
  const showImage = !disableImage && uri && !imgFailed;
  const branding = useMemo(() => getCompetitionBranding(name), [name]);

  if (showImage) {
    const pad = Math.round(size * 0.1);
    return (
      <View
        style={[
          {
            width: size + pad * 2,
            height: size + pad * 2,
            borderRadius: (size + pad * 2) * 0.2,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <Image
          source={{
            uri,
            headers: { 'User-Agent': 'BetIntel/1.0 (ReactNative; mobile app) okhttp/4.9.2' },
            cache: 'force-cache',
          }}
          style={{ width: size, height: size }}
          onError={() => setImgFailed(true)}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (branding) {
    const dimension = size + 4;
    return (
      <View
        style={[
          styles.brandBadge,
          {
            width: dimension,
            height: dimension,
            borderRadius: Math.max(8, dimension * 0.28),
            backgroundColor: branding.backgroundColor,
            borderColor: branding.borderColor,
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.brandBadgeText,
            {
              color: branding.textColor,
              fontSize: branding.label.length >= 4 ? size * 0.42 : size * 0.5,
            },
          ]}
        >
          {branding.label}
        </Text>
      </View>
    );
  }

  // Fallback: country flag emoji
  const flag = country ? getCountryFlagEmoji(country) : '🏴';
  return (
    <Text style={[styles.flag, { fontSize: size * 0.9 }, style]} numberOfLines={1}>
      {flag}
    </Text>
  );
}

export const CompetitionBadge = memo(CompetitionBadgeComponent);
CompetitionBadge.displayName = 'CompetitionBadge';

const styles = StyleSheet.create({
  brandBadge: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  brandBadgeText: {
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  flag: {
    textAlign: 'center',
  },
});
