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
import { apiClient } from '../services/apiClient';
import type { OddsEvent } from '../services/oddsService';
import '../global.css';

const queryClient = new QueryClient();

/** Prefetches the home screen key queries so the odds feed appears instantly. */
function usePrefetchHomeData(isAuthenticated: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fire-and-forget — run in the background while the user sees the first frame
    const safeFetch = (fn: () => Promise<unknown>) => fn().catch(() => undefined);

    void safeFetch(() =>
      qc.prefetchQuery({
        queryKey: ['odds', 'live'],
        queryFn: () => apiClient.get('/odds/live').then((r) => (r.data as { data: unknown[] }).data),
        staleTime: 30_000,
      }),
    );

    void safeFetch(() =>
      qc.prefetchQuery({
        queryKey: ['odds', 'feed', { selectedSites: [], selectedSports: [], selectedMarkets: [], selectedLeague: null, minOdds: 1, maxOdds: 30, dateRange: null, page: 1, limit: 20 }],
        queryFn: () =>
          apiClient.get('/odds', { params: { page: 1, limit: 20 } }).then((r) => ({
            events: (r.data as { data: unknown[] }).data,
            meta: (r.data as { meta?: unknown }).meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
          })),
        staleTime: 30_000,
      }),
    );

    void safeFetch(() =>
      qc.prefetchQuery({
        queryKey: ['odds', 'sites'],
        queryFn: () => apiClient.get('/odds/sites').then((r) => (r.data as { data: unknown[] }).data),
        staleTime: 5 * 60_000,
      }),
    );

    void safeFetch(() =>
      qc.prefetchQuery({
        queryKey: ['odds', 'leagues', undefined],
        queryFn: () => apiClient.get('/odds/leagues').then((r) => (r.data as { data: unknown[] }).data),
        staleTime: 5 * 60_000,
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

  // Apply socket events directly into the React Query cache — zero API round-trip.
  // The UI updates the instant the socket fires; no refetch debounce needed.
  useEffect(() => {
    /**
     * Patch a single OddsEvent with the new odds value from the socket payload.
     * Returns the same reference if the event doesn't match (safe for .map()).
     */
    const patchEvent = (event: OddsEvent, payload: {
      eventId: string; siteId: string; market: string; selection: string; newValue: string;
    }): OddsEvent => {
      if (event.id !== payload.eventId) return event;
      return {
        ...event,
        odds: event.odds.map((odd) =>
          odd.site.id === payload.siteId &&
          odd.market === payload.market &&
          odd.selection === payload.selection
            ? { ...odd, value: payload.newValue, updatedAt: new Date().toISOString() }
            : odd,
        ),
      };
    };

    /** Apply patch to whatever shape the cache holds for this query key. */
    const applyToCache = (
      old: unknown,
      patchFn: (event: OddsEvent) => OddsEvent,
      removeId?: string,
    ): unknown => {
      if (!old) return old;

      // Shape: OddsEvent[] — live list
      if (Array.isArray(old)) {
        const updated = old.map(patchFn);
        return removeId ? updated.filter((e: OddsEvent) => e.id !== removeId) : updated;
      }

      // Shape: { events: OddsEvent[], meta: ... } — paginated feed
      const obj = old as Record<string, unknown>;
      if (Array.isArray(obj['events'])) {
        const updated = (obj['events'] as OddsEvent[]).map(patchFn);
        return {
          ...obj,
          events: removeId ? updated.filter((e) => e.id !== removeId) : updated,
        };
      }

      // Shape: OddsEvent — single event detail page
      return patchFn(old as OddsEvent);
    };

    // ── odds:updated ────────────────────────────────────────────────────────
    // Received whenever a scraper detects a changed odd value.
    // Directly patch the cached value — no network request.
    const onOddsUpdated = (payload: {
      eventId: string; siteId: string; market: string; selection: string;
      oldValue: string; newValue: string;
    }) => {
      queryClient.setQueriesData<unknown>(
        { predicate: (query) => query.queryKey[0] === 'odds' },
        (old: unknown) => applyToCache(old, (e) => patchEvent(e, payload)),
      );
    };

    // ── event:statusChange ──────────────────────────────────────────────────
    // Received when UPCOMING→LIVE or LIVE→FINISHED transitions are detected.
    // FINISHED events are removed from list views immediately so they stop
    // showing as live in the feed.
    const onStatusChange = (payload: {
      eventId: string; status: string; homeScore: number | null; awayScore: number | null; liveClock: string | null;
    }) => {
      const isTerminal = payload.status === 'FINISHED' || payload.status === 'CANCELLED';
      const patchStatus = (event: OddsEvent): OddsEvent => {
        if (event.id !== payload.eventId) return event;
        return {
          ...event,
          status: payload.status,
          homeScore: payload.homeScore ?? event.homeScore,
          awayScore: payload.awayScore ?? event.awayScore,
          liveClock: payload.status === 'LIVE' ? payload.liveClock : null,
        };
      };

      queryClient.setQueriesData<unknown>(
        { predicate: (query) => query.queryKey[0] === 'odds' },
        (old: unknown) => applyToCache(old, patchStatus, isTerminal ? payload.eventId : undefined),
      );
    };

    const unsubOdds   = addSocketListener('odds:updated',       onOddsUpdated);
    const unsubStatus = addSocketListener('event:statusChange', onStatusChange);

    return () => {
      unsubOdds();
      unsubStatus();
    };
  }, [queryClient]);

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
