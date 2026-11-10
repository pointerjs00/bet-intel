import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { getPlayerPhotoUrl, getTeamLogoSource, getTeamLogoUrl } from '../../utils/sportAssets';
import { lookupSportAsset, useSportAssetsStore } from '../../stores/sportAssetsStore';

const teamLogoFallbackCache = new Map<string, string | null>();
const teamLogoFallbackInFlight = new Map<string, Promise<string | null>>();

function normalizeTeamLookupKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchFallbackTeamLogo(teamName: string): Promise<string | null> {
  const key = normalizeTeamLookupKey(teamName);
  if (teamLogoFallbackCache.has(key)) {
    return teamLogoFallbackCache.get(key) ?? null;
  }

  const existing = teamLogoFallbackInFlight.get(key);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    try {
      const response = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`,
      );
      if (!response.ok) {
        teamLogoFallbackCache.set(key, null);
        return null;
      }

      const json = await response.json() as {
        teams?: Array<{
          strBadge?: string | null;
          strLogo?: string | null;
          strTeam?: string | null;
          strTeamBadge?: string | null;
        }>;
      };

      const teams = Array.isArray(json.teams) ? json.teams : [];
      const exact = teams.find((team) => normalizeTeamLookupKey(team.strTeam ?? '') === key);
      const match = exact ?? teams[0];
      const uri = match?.strBadge ?? match?.strTeamBadge ?? match?.strLogo ?? null;
      teamLogoFallbackCache.set(key, uri);
      return uri;
    } catch {
      teamLogoFallbackCache.set(key, null);
      return null;
    } finally {
      teamLogoFallbackInFlight.delete(key);
    }
  })();

  teamLogoFallbackInFlight.set(key, request);
  return request;
}

interface TeamBadgeProps {
  /** Team name as stored in the DB (e.g. "SL Benfica"). */
  name: string;
  /** Size in logical pixels — badge is square, font uses the same value. */
  size?: number;
  imageUrl?: string | null;
  variant?: 'team' | 'player' | 'auto';
  disableRemoteFallback?: boolean;
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
export function TeamBadge({
  name,
  size = 18,
  imageUrl,
  variant = 'auto',
  disableRemoteFallback = false,
  style,
}: TeamBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [fallbackUri, setFallbackUri] = useState<string | null>(null);
  const espnUri = useSportAssetsStore((s) => lookupSportAsset(s, name, variant));
  const localSource = !imageUrl && !espnUri && variant !== 'player' ? getTeamLogoSource(name) : null;
  const directUri = imageUrl ?? espnUri ?? (variant === 'player' ? getPlayerPhotoUrl(name) : getTeamLogoUrl(name));
  const activeUri = imgFailed ? fallbackUri : (directUri ?? fallbackUri);
  const imageSource: ImageSourcePropType | undefined = localSource && !imgFailed
    ? localSource
    : activeUri
      ? { uri: activeUri }
      : undefined;
  const showImage = Boolean(imageSource);
  const isPlayer = variant === 'player' || (variant === 'auto' && Boolean(imageUrl || (espnUri && espnUri.includes('/headshots/'))));
  // Crests and faces are both round discs (design v3), faces fill the disc.
  const borderRadius = size / 2;

  useEffect(() => {
    setImgFailed(false);
  }, [name, imageUrl, variant]);

  useEffect(() => {
    let cancelled = false;

    if (disableRemoteFallback || variant === 'player' || imageUrl || directUri || localSource) {
      setFallbackUri(null);
      return () => {
        cancelled = true;
      };
    }

    void fetchFallbackTeamLogo(name).then((nextUri) => {
      if (!cancelled) {
        setFallbackUri(nextUri);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [directUri, disableRemoteFallback, imageUrl, name, variant]);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius },
        showImage
          ? { backgroundColor: isPlayer ? '#D9DEE7' : 'rgba(255, 255, 255, 0.96)' }
          : { backgroundColor: nameToColor(name) },
        size >= 24 ? styles.lifted : null,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={imageSource}
          style={isPlayer ? { width: size, height: size, borderRadius } : { width: size * 0.74, height: size * 0.74 }}
          onError={() => {
            setImgFailed(true);
            if (!disableRemoteFallback && !imageUrl && !fallbackUri) {
              void fetchFallbackTeamLogo(name).then((nextUri) => {
                setFallbackUri(nextUri);
                if (nextUri) {
                  setImgFailed(false);
                }
              });
            }
          }}
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
  lifted: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
});
