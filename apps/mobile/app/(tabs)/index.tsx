import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
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
import { useToast } from '../../components/ui/Toast';
import { useUnreadNotificationsCount } from '../../services/socialService';
import type { Sport } from '@betintel/shared';
import { ActivityIndicator } from 'react-native';
import { formatLiveClock } from '../../utils/formatters';

const HOME_PAGE_LIMIT = 20;

// Estimated card height for getItemLayout (card ~200px + separator 16px)
const ITEM_HEIGHT = 216;

// Stable separator component — avoids re-creation on every render
const ItemSeparator = () => <View style={separatorStyle} />;

// ─── Competitions panel — self-contained memoized component ────────────────
// Lives outside HomeScreen so its internal state (open/search) never causes
// the main screen to re-render. This is the heaviest part of the header
// (can render 200+ league rows). With React.memo it only re-renders when
// the league list or the active selection changes.

interface CompetitionsPanelProps {
  availableLeagues: string[];
  selectedLeague: string | null;
  setLeague: (l: string | null) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

const CompetitionsPanel = React.memo(function CompetitionsPanel({
  availableLeagues,
  selectedLeague,
  setLeague,
  colors,
}: CompetitionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const categorized = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = search
      ? availableLeagues.filter((l) => l.toLowerCase().includes(searchLower))
      : availableLeagues;

    const portuguese: string[] = [];
    const topEuropean: string[] = [];
    const others: string[] = [];
    const PT_KW = ['portugal', 'liga nos', 'primeira liga', 'segunda liga', 'taça de portugal', 'taça da liga'];
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
  }, [availableLeagues, search]);

  if (availableLeagues.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        style={[styles.competitionsHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.competitionsHeaderLeft}>
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
        <MaterialCommunityIcons
          color={colors.textSecondary}
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
        />
      </Pressable>

      {open ? (
        <Card style={styles.leagueCard}>
          <View style={[styles.leagueSearchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
            <TextInput
              placeholder="Pesquisar competição..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              style={[styles.leagueSearchInput, { color: colors.textPrimary }]}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
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

            {categorized.portuguese.length > 0 ? (
              <>
                <View style={styles.leagueGroupHeader}>
                  <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🇵🇹 Liga Portuguesa</Text>
                </View>
                {categorized.portuguese.map((league) => (
                  <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                    <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                    {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                  </Pressable>
                ))}
              </>
            ) : null}

            {categorized.topEuropean.length > 0 ? (
              <>
                <View style={styles.leagueGroupHeader}>
                  <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🏆 Top Europeias</Text>
                </View>
                {categorized.topEuropean.map((league) => (
                  <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                    <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                    {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                  </Pressable>
                ))}
              </>
            ) : null}

            {categorized.others.length > 0 ? (
              <>
                <View style={styles.leagueGroupHeader}>
                  <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>📋 Outras</Text>
                </View>
                {categorized.others.map((league) => (
                  <Pressable key={league} onPress={() => setLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                    <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                    {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                  </Pressable>
                ))}
              </>
            ) : null}

            {categorized.portuguese.length === 0 && categorized.topEuropean.length === 0 && categorized.others.length === 0 ? (
              <View style={styles.leagueEmptySearch}>
                <Text style={[styles.leagueEmptyText, { color: colors.textMuted }]}>Nenhuma competição encontrada</Text>
              </View>
            ) : null}
          </ScrollView>
        </Card>
      ) : null}
    </View>
  );
});
const separatorStyle = { height: 16 };

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
  const teamSearch = useFilterStore((s) => s.teamSearch);
  const setTeamSearch = useFilterStore((s) => s.setTeamSearch);
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
  // Local state for the search input — debounced before updating the store
  const [localTeamSearch, setLocalTeamSearch] = useState(teamSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTeamSearchChange = useCallback(
    (text: string) => {
      setLocalTeamSearch(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setTeamSearch(text);
      }, 400);
    },
    [setTeamSearch],
  );

  const handleClearTeamSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalTeamSearch('');
    setTeamSearch('');
  }, [setTeamSearch]);

  const filters = useMemo(
    () => ({
      selectedSites,
      selectedSports,
      selectedMarkets,
      selectedLeague,
      teamSearch: teamSearch.trim() || undefined,
      minOdds,
      maxOdds,
      dateRange,
      page,
      limit: HOME_PAGE_LIMIT,
    }),
    [dateRange, maxOdds, minOdds, page, selectedLeague, selectedMarkets, selectedSites, selectedSports, teamSearch],
  );

  const filterKey = JSON.stringify({
    selectedSites,
    selectedSports,
    selectedMarkets,
    selectedLeague,
    teamSearch,
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
  const leaguesQuery = useLeagues();

  // Derive unique league names from the leagues API (pre-fetched on init so the
  // full competition list is immediately available without waiting for the feed).
  const availableLeagues = useMemo(() => {
    const seen = new Set<string>();
    if (leaguesQuery.data) {
      for (const item of leaguesQuery.data) {
        if (item.league && item.league !== 'Futebol') seen.add(item.league);
      }
    }
    return Array.from(seen);
  }, [leaguesQuery.data]);

  useEffect(() => {
    setPage(1);
    setFeedItems([]);
  }, [filterKey]);

  useEffect(() => {
    if (!oddsFeedQuery.data) return;
    const events = oddsFeedQuery.data.events;
    if (page === 1) {
      setFeedItems(events);
      return;
    }
    // O(1) dedup via Set — avoids the O(n²) .some() scan on every load-more
    setFeedItems((current) => {
      const seenIds = new Set(current.map((item) => item.id));
      const newItems = events.filter((event) => !seenIds.has(event.id));
      return newItems.length > 0 ? [...current, ...newItems] : current;
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

  const renderItem = useCallback(
    ({ item }: { item: HomeListItem }) =>
      'type' in item ? (
        <Card style={styles.skeletonCard}>
          <Skeleton height={14} width={120} />
          <Skeleton height={22} width="84%" />
          <Skeleton height={14} width={140} />
          <Skeleton height={120} width="100%" />
        </Card>
      ) : (
        <OddsCard
          event={item}
          onOddPress={(odd, selection) => {
            addBuilderItem({
              id: `${item.id}:${odd.site.id}:${odd.market}:${selection}`,
              eventId: item.id,
              siteId: odd.site.id,
              market: odd.market,
              selection,
              oddValue: Number(odd.value),
              event: {
                awayTeam: item.awayTeam,
                eventDate: item.eventDate,
                homeTeam: item.homeTeam,
                league: item.league,
              },
              site: {
                id: odd.site.id,
                slug: odd.site.slug,
                name: odd.site.name,
                logoUrl: odd.site.logoUrl,
              },
            });
            showToast('Seleção adicionada ao boletin.', 'success');
            router.push('/boletins/create');
          }}
          onAddPress={() => {
            const firstAvailableOdd = item.odds.find((odd) =>
              odd.selection === '1' || odd.selection === 'X' || odd.selection === '2'
            );

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
      ),
    [addBuilderItem, router, showToast],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<HomeListItem> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

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
                    {(() => {
                      const resolvedLiveClock = formatLiveClock(item.liveClock, item.eventDate);
                      const liveSummary = [
                        item.homeScore != null && item.awayScore != null
                          ? `${item.homeScore} – ${item.awayScore}`
                          : null,
                        resolvedLiveClock,
                      ].filter(Boolean).join(' · ');

                      return (
                    <Text style={[styles.liveScoreText, { color: colors.primary }]}>
                        {liveSummary || 'Ao vivo'}
                    </Text>
                      );
                    })()}
                    <MaterialCommunityIcons color={colors.textMuted} name="chevron-right" size={16} />
                  </View>
                </Card>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      {/* Team search bar */}
      <Animated.View entering={FadeInDown.delay(160).duration(400).springify()}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={20} />
          <TextInput
            placeholder="Pesquisar equipa..."
            placeholderTextColor={colors.textMuted}
            value={localTeamSearch}
            onChangeText={handleTeamSearchChange}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {localTeamSearch.length > 0 ? (
            <Pressable onPress={handleClearTeamSearch} hitSlop={8}>
              <MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      {/* Quick filters — box grid */}
      <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Filtros rápidos</Text>
        <View style={styles.filterGrid}>
          {buildQuickFilterItems(sportsQuery.data ?? [], sitesQuery.data ?? [], selectedSports, selectedSites).map((item) => (
            <Pressable
              key={item.key}
              onPress={item.key === 'all'
                ? () => { useFilterStore.getState().reset(); handleClearTeamSearch(); }
                : (item.onPress ?? (() => undefined))}
              style={({ pressed }) => [
                styles.filterBox,
                {
                  backgroundColor: item.active ? colors.primary + '18' : colors.surface,
                  borderColor: item.active ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {item.site ? (
                <SiteLogoChip compact logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
              ) : item.icon ? (
                <Text style={styles.filterBoxEmoji}>{item.icon}</Text>
              ) : (
                <MaterialCommunityIcons color={item.active ? colors.primary : colors.textSecondary} name="select-all" size={18} />
              )}
              <Text
                numberOfLines={1}
                style={[
                  styles.filterBoxLabel,
                  { color: item.active ? colors.primary : colors.textPrimary },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {/* Competitions — collapsible dropdown (self-contained, memoized) */}
      <CompetitionsPanel
        availableLeagues={availableLeagues}
        selectedLeague={selectedLeague}
        setLeague={setLeague}
        colors={colors}
      />

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
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      windowSize={5}
      maxToRenderPerBatch={8}
      initialNumToRender={6}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={ItemSeparator}
      ListFooterComponent={
        <View style={styles.footerActions}>
          {oddsFeedQuery.isFetching && feedItems.length > 0 ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : hasMore ? (
            <Pressable
              onPress={() => setPage((p) => p + 1)}
              style={[styles.loadMoreBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Text style={[styles.loadMoreText, { color: colors.textPrimary }]}>Carregar mais</Text>
              <MaterialCommunityIcons color={colors.textSecondary} name="chevron-down" size={18} />
            </Pressable>
          ) : feedItems.length > 0 ? (
            <Text style={[styles.footerEnd, { color: colors.textMuted }]}>Todos os eventos carregados</Text>
          ) : null}
        </View>
      }
    />
  );
}

interface QuickFilterItem {
  key: string;
  label: string;
  active: boolean;
  onPress?: () => void;
  icon?: string;
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
      label: getSportName(sport),
      icon: getSportEmoji(sport),
      active: selectedSports.includes(sport as Sport),
      onPress: () => useFilterStore.getState().toggleSport(sport as Sport),
    });
  });

  sites.slice(0, 4).forEach((site) => {
    items.push({
      key: `site-${site.slug}`,
      label: site.name,
      active: selectedSites.includes(site.slug),
      onPress: () => useFilterStore.getState().toggleSite(site.slug),
      site,
    });
  });

  return items;
}

function getSportEmoji(sport: string): string {
  switch (sport) {
    case 'FOOTBALL': return '⚽';
    case 'BASKETBALL': return '🏀';
    case 'TENNIS': return '🎾';
    case 'VOLLEYBALL': return '🏐';
    case 'HANDBALL': return '🤾';
    default: return '🏅';
  }
}

function getSportName(sport: string): string {
  switch (sport) {
    case 'FOOTBALL': return 'Futebol';
    case 'BASKETBALL': return 'Basket';
    case 'TENNIS': return 'Ténis';
    case 'VOLLEYBALL': return 'Vólei';
    case 'HANDBALL': return 'Andebol';
    default: return sport;
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
  searchBar: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  filterBox: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterBoxEmoji: {
    fontSize: 18,
  },
  filterBoxLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  competitionsHeader: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  competitionsHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },

  /* Feed */
  skeletonCard: {
    gap: 14,
  },
  footerActions: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  loadMoreBtn: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerEnd: {
    fontSize: 12,
    fontWeight: '500',
  },

  /* League list */
  leagueCard: {
    marginTop: 4,
    overflow: 'hidden',
    padding: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
