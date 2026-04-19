import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ONBOARDING_DONE_KEY } from './onboarding';
import { useAuthStore } from '../stores/authStore';
import { ShareBoletinProvider } from '../components/social/ShareBoletinProvider';
import { ConnectivityBanner } from '../components/ui/ConnectivityBanner';
import { useTheme } from '../theme/useTheme';
import { ToastProvider, useToast } from '../components/ui/Toast';
import {
  addSocketListener,
  connectSocket,
  disconnectSocket,
  startSocketForegroundSync,
  stopSocketForegroundSync,
} from '../services/socketService';
import {
  addForegroundNotificationListener,
  addNotificationResponseListener,
  resetDevicePushTokenCache,
  syncDevicePushToken,
} from '../services/notificationService';
import { boletinQueryKeys, listBoletinsRequest } from '../services/boletinService';
import '../global.css';

const queryClient = new QueryClient();

/** Prefetches the home screen key queries so the boletins list appears instantly. */
function usePrefetchHomeData(isAuthenticated: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const safeFetch = (fn: () => Promise<unknown>) => fn().catch(() => undefined);

    void safeFetch(() =>
      qc.prefetchQuery({
        queryKey: boletinQueryKeys.mine(),
        queryFn: listBoletinsRequest,
        staleTime: 30_000,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrating = useAuthStore((state) => state.isHydrating);
  const hydrate = useAuthStore((state) => state.hydrate);
  const rootNavState = useRootNavigationState();

  usePrefetchHomeData(isAuthenticated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    // rootNavState?.key is only set once the Stack navigator has mounted.
    // We must wait for it before calling router.replace() to avoid the
    // "Attempted to navigate before mounting the Root Layout" error.
    if (!rootNavState?.key) return;
    if (isHydrating) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    }

    if (isAuthenticated && inAuthGroup) {
      void AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((done) => {
        if (!done) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)');
        }
      });
    }
  }, [isAuthenticated, isHydrating, rootNavState?.key, router, segments]);

  // Determine whether to show the loading overlay.
  // We show it while hydrating OR while waiting for a redirect to (auth) to complete.
  const inAuthGroup = segments[0] === '(auth)';
  const inOnboarding = segments[0] === 'onboarding';
  const showOverlay = isHydrating || (!isAuthenticated && !inAuthGroup && !inOnboarding);

  // Always render children so the Stack navigator mounts immediately and
  // rootNavState?.key becomes available for the navigation effect above.
  // The overlay is rendered on top to prevent flashing protected content.
  return (
    <>
      {children}
      {showOverlay && (
        <View style={[StyleSheet.absoluteFill, styles.loadingScreen, { backgroundColor: colors.background }]}>
          <Animated.View entering={FadeIn.duration(300)} style={styles.loadingContent}>
            <Image
              source={require('../assets/logo-no-bg.png')}
              style={styles.loadingIcon}
              resizeMode="contain"
            />
            <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>BetIntel</Text>
          </Animated.View>
          {isHydrating && (
            <Animated.View entering={FadeInDown.delay(200).duration(300)}>
              <ActivityIndicator color={colors.primary} size="small" />
            </Animated.View>
          )}
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    startSocketForegroundSync(() => useAuthStore.getState().accessToken);

    return () => {
      stopSocketForegroundSync();
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connectSocket(accessToken);
      return;
    }

    disconnectSocket();
  }, [accessToken, isAuthenticated]);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <BottomSheetModalProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <NotificationLifecycleManager />
            <ConnectivityBanner />
            <ShareBoletinProvider>
              <AuthGate>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <View style={[styles.flex, { backgroundColor: colors.background }]}>
                  <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
                    <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
                    <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
                    <Stack.Screen name="settings" options={{ headerShown: true }} />
                    <Stack.Screen name="notifications" />
                    <Stack.Screen name="user/[username]" />
                    <Stack.Screen name="boletins/[id]" />
                    <Stack.Screen name="boletins/create" />
                    <Stack.Screen name="boletins/journal" />
                    <Stack.Screen name="boletins/import-review" />
                    <Stack.Screen name="boletins/scan" options={{ headerShown: true }} />
                    <Stack.Screen name="boletins/quick-log" options={{ headerShown: false }} />
                    <Stack.Screen name="boletins/batch-resolve" options={{ headerShown: true }} />
                  </Stack>
                </View>
              </AuthGate>
            </ShareBoletinProvider>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

function NotificationLifecycleManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      resetDevicePushTokenCache();
      return;
    }

    void syncDevicePushToken();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribeSocket = addSocketListener('notification:new', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    const unsubscribeResponse = addNotificationResponseListener((response) => {
      // Navigate to the relevant screen based on notification data
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;

      if (data.boletinId && typeof data.boletinId === 'string') {
        // "bet settled" or "boletin shared" → open boletin detail
        router.push(`/boletins/${data.boletinId}`);
      } else if (data.type === 'FRIEND_REQUEST' || data.type === 'FRIEND_ACCEPTED') {
        router.push('/notifications');
      } else if (data.notificationId) {
        // Generic fallback: open notifications screen
        router.push('/notifications');
      }
    });

    const unsubscribeForeground = addForegroundNotificationListener((notification) => {
      const title = notification.request.content.title?.trim();
      const body = notification.request.content.body?.trim();
      const message = [title, body].filter(Boolean).join(' · ');

      if (message) {
        showToast(message, 'info');
      }

      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      unsubscribeSocket();
      unsubscribeResponse();
      unsubscribeForeground();
    };
  }, [queryClient, showToast]);



  return null;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    gap: 40,
  },
  loadingContent: {
    alignItems: 'center',
    gap: 14,
  },
  loadingIcon: {
    height: 100,
    width: 100,
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
});
