import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';
import { useFilterStore } from '../../stores/filterStore';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useBettingSites, useLiveEvents, useOddsFeed, useSports, type OddsEvent } from '../../services/oddsService';
import { LiveBadge } from '../../components/odds/LiveBadge';
import { OddsCard } from '../../components/odds/OddsCard';
import { SiteLogoChip } from '../../components/odds/SiteLogoChip';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useUnreadNotificationsCount } from '../../services/socialService';
import type { Sport } from '@betintel/shared';

const HOME_PAGE_LIMIT = 8;
type HomeListItem = OddsEvent | { id: string; type: 'skeleton' };

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const selectedSites = useFilterStore((state) => state.selectedSites);
  const selectedSports = useFilterStore((state) => state.selectedSports);
  const selectedMarkets = useFilterStore((state) => state.selectedMarkets);
  const minOdds = useFilterStore((state) => state.minOdds);
  const maxOdds = useFilterStore((state) => state.maxOdds);
  const dateRange = useFilterStore((state) => state.dateRange);
  const activeFilterCount = useFilterStore((state) => state.activeFilterCount);
  const toggleSport = useFilterStore((state) => state.toggleSport);
  const toggleSite = useFilterStore((state) => state.toggleSite);
  const addBuilderItem = useBoletinBuilderStore((state) => state.addItem);
  const unreadNotificationCount = useUnreadNotificationsCount().data ?? 0;
  const [page, setPage] = useState(1);
  const [feedItems, setFeedItems] = useState<OddsEvent[]>([]);

  const filters = useMemo(
    () => ({
      selectedSites,
      selectedSports,
      selectedMarkets,
      minOdds,
      maxOdds,
      dateRange,
      page,
      limit: HOME_PAGE_LIMIT,
    }),
    [dateRange, maxOdds, minOdds, page, selectedMarkets, selectedSites, selectedSports],
  );

  const filterKey = JSON.stringify({
    selectedSites,
    selectedSports,
    selectedMarkets,
    minOdds,
    maxOdds,
    dateRange: dateRange
      ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      : null,
  });

  const oddsFeedQuery = useOddsFeed(filters);
  const liveEventsQuery = useLiveEvents();
  const sitesQuery = useBettingSites();
  const sportsQuery = useSports();

  useEffect(() => {
    setPage(1);
    setFeedItems([]);
  }, [filterKey]);

  useEffect(() => {
    if (!oddsFeedQuery.data) return;
    setFeedItems((current) => {
      if (page === 1) {
        return oddsFeedQuery.data.events;
      }

      const merged = [...current];
      oddsFeedQuery.data.events.forEach((event) => {
        if (!merged.some((item) => item.id === event.id)) {
          merged.push(event);
        }
      });
      return merged;
    });
  }, [oddsFeedQuery.data, page]);

  const hasMore = page < (oddsFeedQuery.data?.meta.totalPages ?? 1);
  const listData: HomeListItem[] =
    oddsFeedQuery.isLoading && feedItems.length === 0
      ? [1, 2, 3].map((item) => ({ id: `skeleton-${item}`, type: 'skeleton' as const }))
      : feedItems;

  const header = (
    <View style={styles.headerSection}>
      <View style={styles.topBar}>
        <View style={styles.logoWrap}>
          <Text style={[styles.logo, { color: colors.textPrimary }]}>BetIntel</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>Odds em direto e melhores comparações</Text>
        </View>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons color={colors.textPrimary} name="notifications-outline" size={20} />
            {unreadNotificationCount > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: colors.live }]}> 
                <Text style={styles.filterBadgeText}>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/odds/filter')}
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons color={colors.textPrimary} name="options-outline" size={20} />
            {activeFilterCount > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ao vivo</Text>
      {liveEventsQuery.isLoading ? (
        <FlatList
          data={[1, 2, 3]}
          horizontal
          keyExtractor={(item) => String(item)}
          renderItem={() => (
            <View style={[styles.liveCardSkeleton, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <Skeleton height={14} width={72} />
              <Skeleton height={18} width={160} />
              <Skeleton height={14} width={90} />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          style={styles.liveList}
        />
      ) : (
        <FlatList
          data={liveEventsQuery.data ?? []}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/odds/${item.id}`)}
              style={[styles.liveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <LiveBadge />
              <Text numberOfLines={1} style={[styles.liveMatch, { color: colors.textPrimary }]}>
                {item.homeTeam} vs {item.awayTeam}
              </Text>
              <Text style={[styles.liveScore, { color: colors.textSecondary }]}>
                {item.homeScore ?? 0} - {item.awayScore ?? 0}
              </Text>
            </Pressable>
          )}
          showsHorizontalScrollIndicator={false}
          style={styles.liveList}
        />
      )}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Filtros rápidos</Text>
      <FlatList
        data={buildQuickFilterItems(sportsQuery.data ?? [], sitesQuery.data ?? [], selectedSports, selectedSites)}
        horizontal
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Pressable
            onPress={item.onPress ?? (() => undefined)}
            style={[
              styles.quickChip,
              {
                backgroundColor: item.active ? colors.primary : colors.surfaceRaised,
                borderColor: item.active ? colors.primary : colors.border,
              },
            ]}
          >
            {item.site ? (
              <SiteLogoChip compact logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
            ) : null}
            <Text style={[styles.quickChipText, { color: item.active ? '#FFFFFF' : colors.textPrimary }]}>{item.label}</Text>
          </Pressable>
        )}
        showsHorizontalScrollIndicator={false}
        style={styles.quickFiltersList}
      />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Feed de odds</Text>
    </View>
  );

  return (
    <FlatList
      contentContainerStyle={{
        backgroundColor: colors.background,
        paddingBottom: tokens.spacing.xxl,
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: insets.top + tokens.spacing.md,
      }}
      data={listData}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !oddsFeedQuery.isLoading ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Sem eventos para estes filtros</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Ajusta os filtros ou espera pela próxima atualização dos scrapers.</Text>
          </View>
        ) : null
      }
      onEndReached={() => {
        if (!oddsFeedQuery.isFetching && hasMore) {
          setPage((current) => current + 1);
        }
      }}
      onEndReachedThreshold={0.45}
      renderItem={({ item }) =>
        'type' in item ? (
          <View style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Skeleton height={14} width={120} />
            <Skeleton height={22} width="84%" />
            <Skeleton height={14} width={140} />
            <Skeleton height={120} width="100%" />
          </View>
        ) : (
          <OddsCard
            event={item}
            onAddPress={() => {
              const firstAvailableOdd = item.odds.find((odd) => odd.market === '1X2');

              if (!firstAvailableOdd) {
                showToast('Abre o evento para escolheres uma odd disponível.', 'info');
                router.push(`/odds/${item.id}`);
                return;
              }

              addBuilderItem({
                id: `${item.id}:${firstAvailableOdd.site.id}:${firstAvailableOdd.market}:${firstAvailableOdd.selection}`,
                eventId: item.id,
                siteId: firstAvailableOdd.site.id,
                market: firstAvailableOdd.market,
                selection: firstAvailableOdd.selection,
                oddValue: Number(firstAvailableOdd.value),
                event: {
                  awayTeam: item.awayTeam,
                  eventDate: item.eventDate,
                  homeTeam: item.homeTeam,
                  league: item.league,
                },
                site: {
                  id: firstAvailableOdd.site.id,
                  slug: firstAvailableOdd.site.slug,
                  name: firstAvailableOdd.site.name,
                  logoUrl: firstAvailableOdd.site.logoUrl,
                },
              });
              showToast('Seleção adicionada ao boletin.', 'success');
              router.push('/boletins/create');
            }}
            onPress={() => router.push(`/odds/${item.id}`)}
          />
        )
      }
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.lg }} />}
      ListFooterComponent={
        oddsFeedQuery.isFetching && feedItems.length > 0 ? (
          <View style={styles.footerSkeletonWrap}>
            <Skeleton height={18} width="100%" />
          </View>
        ) : null
      }
    />
  );
}

interface QuickFilterItem {
  key: string;
  label: string;
  active: boolean;
  onPress?: () => void;
  site?: { slug: string; name: string; logoUrl: string | null };
}

function buildQuickFilterItems(
  sports: string[],
  sites: Array<{ slug: string; name: string; logoUrl: string | null }>,
  selectedSports: Sport[],
  selectedSites: string[],
): QuickFilterItem[] {
  const items: QuickFilterItem[] = [
    {
      key: 'all',
      label: 'Todos',
      active: selectedSports.length === 0 && selectedSites.length === 0,
    },
  ];

  sports.slice(0, 4).forEach((sport) => {
    items.push({
      key: `sport-${sport}`,
      label: getSportLabel(sport),
      active: selectedSports.includes(sport as Sport),
      onPress: () => useFilterStore.getState().toggleSport(sport as Sport),
    });
  });

  sites.slice(0, 4).forEach((site) => {
    items.push({
      key: `site-${site.slug}`,
      label: site.slug.toUpperCase(),
      active: selectedSites.includes(site.slug),
      onPress: () => useFilterStore.getState().toggleSite(site.slug),
      site,
    });
  });

  return items;
}

function getSportLabel(sport: string) {
  switch (sport) {
    case 'FOOTBALL':
      return '⚽ Futebol';
    case 'BASKETBALL':
      return '🏀 Basket';
    case 'TENNIS':
      return '🎾 Ténis';
    case 'VOLLEYBALL':
      return '🏐 Vólei';
    default:
      return sport;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  headerSection: {
    gap: 18,
    marginBottom: 18,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoWrap: {
    flex: 1,
    gap: 4,
  },
  logo: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  badgeDot: {
    borderRadius: 4,
    height: 8,
    position: 'absolute',
    right: 10,
    top: 10,
    width: 8,
  },
  filterBadge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  liveList: {
    marginHorizontal: -4,
  },
  liveCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 4,
    padding: 14,
    width: 220,
  },
  liveCardSkeleton: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 4,
    padding: 14,
    width: 220,
  },
  liveMatch: {
    fontSize: 15,
    fontWeight: '800',
  },
  liveScore: {
    fontSize: 13,
    fontWeight: '600',
  },
  quickFiltersList: {
    marginHorizontal: -4,
  },
  quickChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 4,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  skeletonCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  footerSkeletonWrap: {
    paddingTop: 16,
  },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
