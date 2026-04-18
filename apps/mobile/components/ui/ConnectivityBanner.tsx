import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { useTheme } from '../../theme/useTheme';

/**
 * Floating banner shown at the top of the screen when the device is offline
 * or when there are pending queued mutations waiting to sync.
 *
 * Mount this once inside the root layout — it renders null when online and
 * there is nothing queued.
 */
export function ConnectivityBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const { pendingCount, flushQueue } = useOfflineQueueStore();
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isOffline = !isConnected || isInternetReachable === false;
  const hasQueued = pendingCount > 0;

  // When connectivity returns after being offline, flush queued operations
  const wasOffline = useRef(false);
  useEffect(() => {
    if (wasOffline.current && !isOffline && hasQueued) {
      void flushQueue();
    }
    wasOffline.current = isOffline;
  }, [isOffline, hasQueued, flushQueue]);

  if (!isOffline && !hasQueued) return null;

  const backgroundColor = isOffline ? colors.danger : colors.warning;
  const icon: React.ComponentProps<typeof Ionicons>['name'] = isOffline
    ? 'cloud-offline-outline'
    : 'sync-outline';
  const message = isOffline
    ? 'Sem ligação à internet'
    : `${pendingCount} alteraç${pendingCount === 1 ? 'ão' : 'ões'} por sincronizar`;

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutUp.duration(220)}
      style={[
        styles.banner,
        {
          backgroundColor,
          top: insets.top + 4,
          paddingHorizontal: tokens.spacing.lg,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <Ionicons color="#FFFFFF" name={icon} size={15} />
      <Text style={styles.bannerText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 20,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: 9999,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
