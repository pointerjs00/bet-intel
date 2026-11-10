import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Notification } from '@betintel/shared';
import { Button } from '../ui/Button';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { formatRelativeTime } from '../../utils/formatters';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: () => void;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Notification row (v3): coloured icon tile per type, unread dot, optional mark-read action. */
export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const kind = String(notification.type);
  const { icon, tint } = ((): { icon: IconName; tint: string } => {
    if (kind.startsWith('FRIEND')) return { icon: 'people', tint: colors.accentText };
    if (kind === 'BOLETIN_SHARED') return { icon: 'share-social', tint: colors.info };
    if (kind === 'EVENT_RESULT' || kind.includes('RESULT') || kind.includes('SETTLE')) return { icon: 'trophy', tint: colors.positive };
    if (kind.includes('LIVE') || kind.includes('GOAL')) return { icon: 'football', tint: colors.live };
    return { icon: 'notifications', tint: colors.warning };
  })();

  return (
    <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
      <View style={[styles.iconTile, { backgroundColor: `${tint}22` }]}>
        <Ionicons color={tint} name={icon} size={19} />
        {!notification.isRead ? <View style={[styles.dot, { backgroundColor: colors.accentAlt, borderColor: colors.surface }]} /> : null}
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>{formatRelativeTime(notification.createdAt)}</Text>
      </View>

      {!notification.isRead && onMarkRead ? (
        <View style={styles.actionWrap}>
          <Button onPress={onMarkRead} size="sm" title="Ler" variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, flexDirection: 'row', gap: 12, padding: 14 },
  iconTile: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  dot: { borderRadius: 6, borderWidth: 2, height: 12, position: 'absolute', right: -3, top: -3, width: 12 },
  content: { flex: 1, gap: 3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  body: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 11, fontWeight: '600' },
  actionWrap: { justifyContent: 'center', width: 72 },
});
