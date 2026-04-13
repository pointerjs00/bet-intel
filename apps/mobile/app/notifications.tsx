import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Notification, NotificationType } from '@betintel/shared';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import {
  getApiErrorMessage,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotifications,
} from '../services/socialService';
import { useTheme } from '../theme/useTheme';
import { getNotificationTarget } from '../utils/notificationNavigation';
import { formatRelativeTime } from '../utils/formatters';

const NOTIFICATION_ICONS: Record<string, { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: 'primary' | 'info' | 'gold' | 'danger' | 'warning' }> = {
  FRIEND_REQUEST: { name: 'account-plus-outline', color: 'info' },
  FRIEND_ACCEPTED: { name: 'account-check-outline', color: 'primary' },
  BOLETIN_SHARED: { name: 'share-variant-outline', color: 'gold' },
  BOLETIN_RESULT: { name: 'trophy-outline', color: 'warning' },
  SYSTEM: { name: 'bell-outline', color: 'info' },
};

function NotificationRow({
  notification,
  onMarkRead,
  onPress,
}: {
  notification: Notification;
  onMarkRead: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const iconConfig = NOTIFICATION_ICONS[notification.type] ?? NOTIFICATION_ICONS.SYSTEM;
  const iconColor = colors[iconConfig.color];

  return (
    <Pressable
      onPress={onPress}
      style={[
        notifStyles.card,
        {
          backgroundColor: notification.isRead ? colors.surface : colors.surfaceRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[notifStyles.iconWrap, { backgroundColor: `${iconColor}18` }]}>
        <MaterialCommunityIcons color={iconColor} name={iconConfig.name} size={20} />
      </View>

      <View style={notifStyles.content}>
        <Text style={[notifStyles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
        <Text numberOfLines={2} style={[notifStyles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
        <Text style={[notifStyles.time, { color: colors.textMuted }]}>{formatRelativeTime(notification.createdAt)}</Text>
      </View>

      {!notification.isRead ? (
        <Pressable onPress={onMarkRead} hitSlop={8} style={notifStyles.readBtn}>
          <View style={[notifStyles.unreadDot, { backgroundColor: colors.primary }]} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const notifStyles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10 },
  iconWrap: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  content: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 12, lineHeight: 18 },
  time: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  readBtn: { alignSelf: 'center', padding: 4 },
  unreadDot: { borderRadius: 5, height: 10, width: 10 },
});

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const [page] = useState(1);

  const notificationsQuery = useNotifications(page, 50);
  const markReadMutation = useMarkNotificationReadMutation(page, 50);
  const markAllMutation = useMarkAllNotificationsReadMutation(page, 50);

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.meta.unreadCount ?? 0;

  function handleNotificationPress(notification: Notification) {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }

    const target = getNotificationTarget(notification);
    if (target) {
      router.push(target as never);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Notificações',
          headerShown: true,
          headerTintColor: colors.textPrimary,
          headerStyle: { backgroundColor: colors.background },
          headerRight: () =>
            unreadCount > 0 ? (
              <Pressable
                onPress={async () => {
                  try {
                    await markAllMutation.mutateAsync();
                    showToast('Todas lidas.', 'success');
                  } catch (error) {
                    showToast(getApiErrorMessage(error), 'error');
                  }
                }}
                hitSlop={8}
                style={{ marginRight: 8 }}
              >
                <Ionicons color={colors.primary} name="checkmark-done-outline" size={22} />
              </Pressable>
            ) : null,
        }}
      />

      {notificationsQuery.isLoading ? (
        <View style={[styles.loadingWrap, { paddingHorizontal: tokens.spacing.lg }]}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={80} width="100%" style={{ borderRadius: 18 }} />
          ))}
        </View>
      ) : items.length > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: tokens.spacing.md,
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={<RefreshControl refreshing={notificationsQuery.isRefetching} onRefresh={() => void notificationsQuery.refetch()} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 20).duration(160).springify()}>
              <NotificationRow
                notification={item}
                onMarkRead={() => markReadMutation.mutate(item.id)}
                onPress={() => handleNotificationPress(item)}
              />
            </Animated.View>
          )}
          ListHeaderComponent={
            unreadCount > 0 ? (
              <Animated.View entering={FadeInUp.duration(200)} style={[styles.unreadBanner, { backgroundColor: `${colors.primary}14` }]}>
                <Ionicons color={colors.primary} name="notifications" size={16} />
                <Text style={[styles.unreadText, { color: colors.primary }]}>
                  {unreadCount} {unreadCount === 1 ? 'não lida' : 'não lidas'}
                </Text>
              </Animated.View>
            ) : null
          }
        />
      ) : (
        <EmptyState
          icon="bell-off-outline"
          title="Sem notificações"
          message="As tuas notificações vão aparecer aqui."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingWrap: { gap: 10, paddingTop: 16 },
  unreadBanner: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, marginBottom: 14, paddingHorizontal: 14, paddingVertical: 10 },
  unreadText: { fontSize: 13, fontWeight: '700' },
});
