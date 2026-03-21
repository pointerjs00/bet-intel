import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Notification } from '@betintel/shared';
import { Button } from '../ui/Button';
import { useTheme } from '../../theme/useTheme';
import { formatRelativeTime } from '../../utils/formatters';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: () => void;
}

/** Notification row with unread status and optional mark-read action. */
export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <View style={[styles.dot, { backgroundColor: notification.isRead ? colors.textMuted : colors.primary }]} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>{formatRelativeTime(notification.createdAt)}</Text>
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
  card: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  dot: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionWrap: {
    justifyContent: 'center',
    width: 72,
  },
});