import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FriendFeedItem } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatRelativeTime } from '../../utils/formatters';
import { SocialAvatar } from './SocialAvatar';

interface ActivityFeedItemProps {
  item: FriendFeedItem;
  onPress?: () => void;
}

/** Social activity row for the friend feed tab. */
export function ActivityFeedItem({ item, onPress }: ActivityFeedItemProps) {
  const { colors } = useTheme();
  const displayName = item.user.displayName ?? item.user.username;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <SocialAvatar avatarUrl={item.user.avatarUrl} name={displayName} size={48} />

      <View style={styles.content}>
        <Text style={[styles.message, { color: colors.textPrimary }]}>{item.message}</Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>{formatRelativeTime(item.createdAt)}</Text>
        <Text numberOfLines={2} style={[styles.events, { color: colors.textSecondary }]}>
          {item.previewEvents.join(' • ')}
        </Text>
      </View>

      <View style={styles.metricWrap}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odds</Text>
        <Text style={[styles.metricValue, { color: colors.gold }]}>{formatOdds(item.boletin.totalOdds)}</Text>
      </View>
    </Pressable>
  );
}

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
    fontSize: 12,
    lineHeight: 18,
  },
  metricWrap: {
    alignItems: 'flex-end',
    gap: 2,
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
  },
});