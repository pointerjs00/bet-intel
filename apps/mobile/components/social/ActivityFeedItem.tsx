import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FriendFeedItem } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatRelativeTime } from '../../utils/formatters';
import { SocialAvatar } from './SocialAvatar';
import { PressableScale } from '../ui/PressableScale';
import { useCardElevation } from '../ui/ListCard';
import { TeamBadge } from '../ui/TeamBadge';

interface ActivityFeedItemProps {
  item: FriendFeedItem;
  onPress?: () => void;
}

/** Social activity row for the friend feed tab. */
export const ActivityFeedItem = React.memo(function ActivityFeedItem({ item, onPress }: ActivityFeedItemProps) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const displayName = item.user.displayName ?? item.user.username;

  return (
    <PressableScale
      disabled={!onPress}
      onPress={onPress}
      style={[styles.card, elevation, { backgroundColor: colors.surface, borderColor: 'transparent' }]}
    >
      <SocialAvatar avatarUrl={item.user.avatarUrl} name={displayName} size={48} />

      <View style={styles.content}>
        <Text style={[styles.message, { color: colors.textPrimary }]}>{item.message}</Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>{formatRelativeTime(item.createdAt)}</Text>
        {item.previewEvents.slice(0, 3).map((ev, i) => {
          const home = ev.split(/\s+(?:vs\.?|-|x)\s+/i)[0] ?? ev;
          return (
            <View key={i} style={styles.eventRow}>
              <TeamBadge name={home.trim()} size={18} />
              <Text numberOfLines={1} style={[styles.events, { color: colors.textSecondary }]}>{ev}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.metricWrap}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odds</Text>
        <Text style={[styles.metricValue, { color: colors.gold }]}>{formatOdds(item.boletin.totalOdds)}</Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  message: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  time: {
    fontSize: 11,
    fontWeight: '700',
  },
  events: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  eventRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2 },
  metricWrap: {
    alignItems: 'flex-end',
    gap: 2,
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
  },
});