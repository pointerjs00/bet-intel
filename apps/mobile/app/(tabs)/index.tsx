import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInRight, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../theme/useTheme';
import { useFilterStore } from '../../stores/filterStore';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useBettingSites, useLeagues, useLiveEvents, useOddsFeed, useSports, type OddsEvent } from '../../services/oddsService';
import { LiveBadge } from '../../components/odds/LiveBadge';
import { OddsCard } from '../../components/odds/OddsCard';
import { SiteLogoChip } from '../../components/odds/SiteLogoChip';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Chip } from '../../components/ui/Chip';
import { useToast } from '../../components/ui/Toast';
import { useUnreadNotificationsCount } from '../../services/socialService';
import type { Sport } from '@betintel/shared';

const HOME_PAGE_LIMIT = 20;

type HomeListItem = OddsEvent | { id: string; type: 'skeleton' };

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const selectedSites = useFilterStore((s) => s.selectedSites);
  const selectedSports = useFilterStore((s) => s.selectedSports);
  const selectedMarkets = useFilterStore((s) => s.selectedMarkets);
  const selectedLeague = useFilterStore((s) => s.selectedLeague);
  const minOdds = useFilterStore((s) => s.minOdds);
  const maxOdds = useFilterStore((s) => s.maxOdds);
  const dateRange = useFilterStore((s) => s.dateRange);
  const activeFilterCount = useFilterStore((s) => s.activeFilterCount);
  const setLeague = useFilterStore((s) => s.setLeague);
  const addBuilderItem = useBoletinBuilderStore((s) => s.addItem);
  const unreadNotificationCount = useUnreadNotificationsCount().data ?? 0;
  const [page, setPage] = useState(1);
  const [feedItems, setFeedItems] = useState<OddsEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState('');

  const filters = useMemo(
    () => ({
      selectedSites,
      selectedSports,
      selectedMarkets,
      selectedLeague,
      minOdds,
      maxOdds,
      dateRange,
      page,
      limit: HOME_PAGE_LIMIT,
    }),
    [dateRange, maxOdds, minOdds, page, selectedLeague, selectedMarkets, selectedSites, selectedSports],
  );

  const filterKey = JSON.stringify({
    selectedSites,
    selectedSports,
    selectedMarkets,
    selectedLeague,
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
  const leaguesQuery = useLeagues(selectedSports[0] as Sport | undefined);

  // Derive unique league names from available leagues data
  const availableLeagues = useMemo(() => {
    if (!leaguesQuery.data) return [];
    const unique = new Map<string, string>();
    leaguesQuery.data.forEach((item) => {
      if (!unique.has(item.league)) {
        unique.set(item.league, item.sport);
      }
    });
    return Array.from(unique.keys());
  }, [leaguesQuery.data]);

  const categorizedLeagues = useMemo(() => {
    const searchLower = leagueSearch.toLowerCase();
    const filtered = leagueSearch
      ? availableLeagues.filter((l) => l.toLowerCase().includes(searchLower))
      : availableLeagues;

    const portuguese: string[] = [];
    const topEuropean: string[] = [];
    const others: string[] = [];
    const PT_KW = ['portugal', 'liga nos', 'primeira liga', 'segunda liga', 'taça'];
    const EU_KW = ['premier league', 'la liga', 'laliga', 'bundesliga', 'serie a', 'ligue 1'];

    for (const league of filtered) {
      const lower = league.toLowerCase();
      if (PT_KW.some((kw) => lower.includes(kw))) portuguese.push(league);
      else if (EU_KW.some((kw) => lower.includes(kw))) topEuropean.push(league);
      else others.push(league);
    }

    return {
      portuguese: portuguese.sort(),
      topEuropean: topEuropean.sort(),
      others: others.sort((a, b) => a.localeCompare(b)),
    };
  }, [availableLeagues, leagueSearch]);

  useEffect(() => {
    setPage(1);
    setFeedItems([]);
  }, [filterKey]);

  useEffect(() => {
    if (!oddsFeedQuery.data) return;
    setFeedItems((current) => {
      const events = oddsFeedQuery.data.events;

      if (page === 1) return events;

      const merged = [...current];
      events.forEach((event) => {
        if (!merged.some((item) => item.id === event.id)) {
          merged.push(event);
        }
      });
      return merged;
    });
  }, [oddsFeedQuery.data, page]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPage(1);
    setFeedItems([]);
    await queryClient.invalidateQueries({ queryKey: ['odds'] });
    setIsRefreshing(false);
  }, [queryClient]);

  const hasMore = page < (oddsFeedQuery.data?.meta.totalPages ?? 1);
  const listData: HomeListItem[] =
    oddsFeedQuery.isLoading && feedItems.length === 0
      ? [1, 2, 3].map((item) => ({ id: `skeleton-${item}`, type: 'skeleton' as const }))
      : feedItems;

  const liveEvents = liveEventsQuery.data ?? [];

  const header = (
    <View style={styles.headerSection}>
      {/* Top bar */}
      <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.topBar}>
        <View style={styles.logoWrap}>
          <Text style={[styles.logo, { color: colors.textPrimary }]}>BetIntel</Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>Odds em direto e melhores comparações</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons color={colors.textPrimary} name="bell-outline" size={20} />
            {unreadNotificationCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/odds/filter')}
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons color={colors.textPrimary} name="tune-variant" size={20} />
            {activeFilterCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </Animated.View>

      {/* Live events strip */}
      <Animated.View entering={FadeInDown.delay(80).duration(400).springify()}>
        <View style={styles.sectionHeader}>
          <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ao vivo</Text>
          {liveEvents.length > 0 ? (
            <View style={[styles.countPill, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.countPillText, { color: colors.live }]}>{liveEvents.length}</Text>
            </View>
          ) : null}
        </View>

        {liveEventsQuery.isLoading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.liveStrip}>
            {[1, 2, 3].map((k) => (
              <Card key={k} style={styles.liveCardSkeleton}>
                <Skeleton height={14} width={72} />
                <Skeleton height={18} width={160} />
                <Skeleton height={14} width={90} />
              </Card>
            ))}
          </ScrollView>
        ) : liveEvents.length === 0 ? (
          <Card style={styles.liveEmptyCard}>
            <MaterialCommunityIcons color={colors.textMuted} name="broadcast-off" size={22} />
            <Text style={[styles.liveEmptyText, { color: colors.textMuted }]}>Sem eventos ao vivo neste momento</Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.liveStrip} contentContainerStyle={{ gap: 10 }}>
            {liveEvents.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInRight.delay(index * 80).duration(400).springify()}>
                <Card onPress={() => router.push(`/odds/${item.id}`)} style={styles.liveCard}>
                  <View style={styles.liveCardTop}>
                    <LiveBadge />
                    <Text style={[styles.liveLeague, { color: colors.textMuted }]} numberOfLines={1}>{item.league}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.liveTeams, { color: colors.textPrimary }]}>
                    {item.homeTeam} vs {item.awayTeam}
                  </Text>
                  <View style={styles.liveScoreRow}>
                    <Text style={[styles.liveScoreText, { color: colors.primary }]}>
                      {item.homeScore != null && item.awayScore != null
                        ? `${item.homeScore} – ${item.awayScore}`
                        : 'Ao vivo'}
                    </Text>
                    <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={16} />
                  </View>
                </Card>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      {/* Sport + site filters */}
      <Animated.View entering={FadeInDown.delay(160).duration(400).springify()}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Filtros rápidos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterStrip} contentContainerStyle={{ gap: 8 }}>
          {buildQuickFilterItems(sportsQuery.data ?? [], sitesQuery.data ?? [], selectedSports, selectedSites).map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={item.active}
              onPress={item.onPress ?? (() => undefined)}
              icon={item.site ? (
                <SiteLogoChip compact logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
              ) : undefined}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* League vertical list */}
      {availableLeagues.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(240).duration(400).springify()}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons color={colors.textSecondary} name="trophy-outline" size={18} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Competições</Text>
            {selectedLeague ? (
              <View style={[styles.countPill, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.countPillText, { color: colors.primary }]} numberOfLines={1}>
                  {selectedLeague}
                </Text>
              </View>
            ) : null}
          </View>
          <Card style={styles.leagueCard}>
            <View style={[styles.leagueSearchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
              <TextInput
                placeholder="Pesquisar competição..."
                placeholderTextColor={colors.textMuted}
                value={leagueSearch}
                onChangeText={setLeagueSearch}
                style={[styles.leagueSearchInput, { color: colors.textPrimary }]}
              />
              {leagueSearch.length > 0 ? (
                <Pressable onPress={() => setLeagueSearch('')} hitSlop={8}>
                  <MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={16} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView style={styles.leagueList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <Pressable
                onPress={() => setLeague(null)}
                style={[styles.leagueRow, { borderColor: colors.border }]}
              >
                <Text style={[styles.leagueRowText, { color: selectedLeague === null ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === null ? '700' : '500' }]}>
                  Todas as competições
                </Text>
                {selectedLeague === null ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
              </Pressable>

              {categorizedLeagues.portuguese.length > 0 ? (
                <>
                  <View style={styles.leagueGroupHeader}>
                    <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🇵🇹 Liga Portuguesa</Text>
                  </View>
                  {categorizedLeagues.portuguese.map((league) => (
                    <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                      <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                      {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                    </Pressable>
                  ))}
                </>
              ) : null}

              {categorizedLeagues.topEuropean.length > 0 ? (
                <>
                  <View style={styles.leagueGroupHeader}>
                    <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🏆 Top Europeias</Text>
                  </View>
                  {categorizedLeagues.topEuropean.map((league) => (
                    <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                      <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                      {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                    </Pressable>
                  ))}
                </>
              ) : null}

              {categorizedLeagues.others.length > 0 ? (
                <>
                  <View style={styles.leagueGroupHeader}>
                    <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>📋 Outras</Text>
                  </View>
                  {categorizedLeagues.others.map((league) => (
                    <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                      <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                      {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                    </Pressable>
                  ))}
                </>
              ) : null}

              {categorizedLeagues.portuguese.length === 0 && categorizedLeagues.topEuropean.length === 0 && categorizedLeagues.others.length === 0 ? (
                <View style={styles.leagueEmptySearch}>
                  <Text style={[styles.leagueEmptyText, { color: colors.textMuted }]}>Nenhuma competição encontrada</Text>
                </View>
              ) : null}
            </ScrollView>
          </Card>
        </Animated.View>
      ) : null}

      {/* Feed section header */}
      <Animated.View entering={FadeInDown.delay(320).duration(400).springify()}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons color={colors.textSecondary} name="format-list-bulleted" size={18} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Feed de odds</Text>
          {feedItems.length > 0 ? (
            <View style={[styles.countPill, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.countPillText, { color: colors.textSecondary }]}>{feedItems.length}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );

  return (
    <FlatList
      contentContainerStyle={{
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: insets.top + tokens.spacing.md,
      }}
      data={listData}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !oddsFeedQuery.isLoading ? (
          <EmptyState
            icon="magnify"
            title="Sem eventos para estes filtros"
            message="Ajusta os filtros ou espera pela próxima atualização dos scrapers."
          />
        ) : null
      }
      onEndReached={() => {
        if (!oddsFeedQuery.isFetching && hasMore) {
          setPage((current) => current + 1);
        }
      }}
      onEndReachedThreshold={0.45}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      renderItem={({ item, index }) =>
        'type' in item ? (
          <Card style={styles.skeletonCard}>
            <Skeleton height={14} width={120} />
            <Skeleton height={22} width="84%" />
            <Skeleton height={14} width={140} />
            <Skeleton height={120} width="100%" />
          </Card>
        ) : (
          <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
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
          </Animated.View>
        )
      }
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.lg }} />}
      ListFooterComponent={
        oddsFeedQuery.isFetching && feedItems.length > 0 ? (
          <View style={styles.footerLoading}>
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
  headerSection: {
    gap: 20,
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
  iconBtn: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  badge: {
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
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  liveDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },

  /* Live strip */
  liveStrip: {
    marginTop: 8,
  },
  liveCard: {
    gap: 8,
    width: 230,
  },
  liveCardSkeleton: {
    gap: 12,
    marginRight: 10,
    width: 230,
  },
  liveCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  liveLeague: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  liveTeams: {
    fontSize: 15,
    fontWeight: '800',
  },
  liveScoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  liveScoreText: {
    fontSize: 18,
    fontWeight: '900',
  },
  liveEmptyCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  liveEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Filter strips */
  filterStrip: {
    marginTop: 8,
  },

  /* Feed */
  skeletonCard: {
    gap: 14,
  },
  footerLoading: {
    paddingTop: 16,
  },

  /* League list */
  leagueCard: {
    marginTop: 8,
    overflow: 'hidden',
    padding: 0,
  },
  leagueSearchWrap: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  leagueSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  leagueList: {
    maxHeight: 220,
  },
  leagueGroupHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  leagueGroupLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  leagueRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  leagueRowText: {
    flex: 1,
    fontSize: 14,
  },
  leagueEmptySearch: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  leagueEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
