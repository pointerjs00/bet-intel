import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
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

  usePrefetchHomeData(isAuthenticated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrating) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    }

    if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isHydrating, router, segments]);

  if (isHydrating) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <>{children}</>;
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
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <NotificationLifecycleManager />
            <AuthGate>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <View style={[styles.flex, { backgroundColor: colors.background }]}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </View>
            </AuthGate>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function NotificationLifecycleManager() {
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
  },
});
