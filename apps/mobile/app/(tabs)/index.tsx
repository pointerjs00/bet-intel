import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { BoletinStatus, Sport } from '@betintel/shared';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { BoletinCard } from '../../components/boletins/BoletinCard';
import {
  BoletinFilterSheet,
  type BoletinFilter,
  type BoletinSort,
  type CompetitionEntry,
  type TeamEntry,
} from '../../components/boletins/BoletinFilterSheet';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useBoletins, useDeleteBoletinMutation } from '../../services/boletinService';
import { useUnreadNotificationsCount } from '../../services/socialService';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';
import { hapticLight } from '../../utils/haptics';
import { BETTING_SITES } from '../../utils/sportAssets';

type SlipListItem = { id: string; type: 'skeleton' } | (ReturnType<typeof useBoletins>['data'] extends Array<infer T> | undefined ? T : never);

const INITIAL_VISIBLE_BOLETINS = 8;
const VISIBLE_BATCH_SIZE = 8;
const LOAD_MORE_DELAY_MS = 120;
const LOAD_MORE_AHEAD_PX = 220;
const LOAD_MORE_THRESHOLD = 0.35;

const STATUS_FILTERS: Array<{ key: BoletinStatus; label: string; activeColor: string; activeBorder: string }> = [
  { key: BoletinStatus.PENDING,  label: '⏳ Pendente',   activeColor: 'rgba(255,149,0,0.15)',  activeBorder: '#FF9500' },
  { key: BoletinStatus.WON,      label: '✅ Ganhou',     activeColor: 'rgba(0,168,67,0.15)',   activeBorder: '#00A843' },
  { key: BoletinStatus.LOST,     label: '❌ Perdeu',     activeColor: 'rgba(255,59,48,0.15)',  activeBorder: '#FF3B30' },
  { key: BoletinStatus.VOID,     label: '🚫 Cancelado',  activeColor: 'rgba(0,122,255,0.15)',  activeBorder: '#007AFF' },
  { key: BoletinStatus.CASHOUT,  label: '💵 Cashout',    activeColor: 'rgba(255,215,0,0.15)',  activeBorder: '#FFD700' },
];

const STATUS_FILTER_ITEMS = STATUS_FILTERS.map((f) => ({ label: f.label, value: f.key }));

const ItemSeparator = () => <View style={{ height: 16 }} />;
const keyExtractor = (item: SlipListItem) => item.id;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const filterSheetRef = useRef<GorhomBottomSheet>(null);

  const [activeStatuses, setActiveStatuses] = useState<Set<BoletinStatus>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<BoletinSort>({ by: 'date', dir: 'desc' });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_BOLETINS);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read filter params pushed from the stats screen (e.g. filterTeam, filterSport, etc.)
  const { filterSport, filterTeam, filterCompetition, filterMarket } = useLocalSearchParams<{
    filterSport?: string;
    filterTeam?: string;
    filterCompetition?: string;
    filterMarket?: string;
  }>();

  // Apply incoming params to filter state every time the screen is focused with new params
  useEffect(() => {
    if (!filterSport && !filterTeam && !filterCompetition && !filterMarket) return;

    setFilter((prev) => ({
      ...prev,
      sport: filterSport ? (filterSport as Sport) : prev.sport,
      teams: filterTeam ? [filterTeam] : prev.teams,
      competitions: filterCompetition ? [filterCompetition] : prev.competitions,
    }));

    if (filterMarket) {
      setSearchQuery(filterMarket);
    }

    // Clear the params so navigating back doesn't re-apply them
    router.setParams({
      filterSport: '',
      filterTeam: '',
      filterCompetition: '',
      filterMarket: '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSport, filterTeam, filterCompetition, filterMarket]);

  const boletinsQuery = useBoletins();
  const deleteMutation = useDeleteBoletinMutation();
  const unreadCount = useUnreadNotificationsCount().data ?? 0;

  // Track whether the filter sheet is open so the back gesture dismisses it
  // instead of doing default OS back handling (which exits the app on a root tab).
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // State for the delete-boletin confirmation modal.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name?: string } | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFilterSheetOpen) {
        filterSheetRef.current?.close();
        return true; // consume — don't let OS handle it
      }
      return false;
    });
    return () => sub.remove();
  }, [isFilterSheetOpen]);

  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current) {
        clearTimeout(loadMoreTimeoutRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void boletinsQuery.refetch();
    }, [boletinsQuery.refetch]),
  );

  const boletins = boletinsQuery.data ?? [];

  // Derive range maxima from actual data for slider bounds
  const dataRanges = useMemo(() => {
    if (boletins.length === 0) return { maxStake: 100, maxOdds: 20, maxReturn: 1000 };
    return {
      maxStake: Math.max(100, ...boletins.map((b) => Number(b.stake))),
      maxOdds: Math.max(10, ...boletins.map((b) => Number(b.totalOdds))),
      maxReturn: Math.max(100, ...boletins.map((b) => Number(b.actualReturn ?? b.potentialReturn))),
    };
  }, [boletins]);

  const [filter, setFilter] = useState<BoletinFilter>({
    stakeRange: [0, dataRanges.maxStake],
    oddsRange: [1, dataRanges.maxOdds],
    returnRange: [0, dataRanges.maxReturn],
    sport: null,
    competitions: [],
    teams: [],
    sites: [],
  });

  // All unique competitions and teams from loaded data
  const allCompetitions = useMemo((): CompetitionEntry[] => {
    const map = new Map<string, CompetitionEntry['sport']>();
    boletins.forEach((b) => b.items.forEach((i) => { if (!map.has(i.competition)) map.set(i.competition, i.sport); }));
    return Array.from(map.entries()).map(([name, sport]) => ({ name, sport })).sort((a, b) => a.name.localeCompare(b.name));
  }, [boletins]);

  const allTeams = useMemo((): TeamEntry[] => {
    const map = new Map<string, TeamEntry['sport']>();
    boletins.forEach((b) =>
      b.items.forEach((i) => {
        if (!map.has(i.homeTeam)) map.set(i.homeTeam, i.sport);
        if (!map.has(i.awayTeam)) map.set(i.awayTeam, i.sport);
      }),
    );
    return Array.from(map.entries()).map(([name, sport]) => ({ name, sport })).sort((a, b) => a.name.localeCompare(b.name));
  }, [boletins]);

  // All betting sites that appear in loaded boletins (in BETTING_SITES canonical order)
  const allSitesInData = useMemo(() => {
    const slugsInData = new Set(boletins.map((b) => b.siteSlug).filter(Boolean) as string[]);
    return BETTING_SITES.filter((s) => slugsInData.has(s.slug));
  }, [boletins]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.stakeRange[0] > 0 || filter.stakeRange[1] < dataRanges.maxStake) count++;
    if (filter.oddsRange[0] > 1 || filter.oddsRange[1] < dataRanges.maxOdds) count++;
    if (filter.returnRange[0] > 0 || filter.returnRange[1] < dataRanges.maxReturn) count++;
    if (filter.sport !== null) count++;
    if (filter.competitions.length > 0) count++;
    if (filter.teams.length > 0) count++;
    if (filter.sites.length > 0) count++;
    return count;
  }, [filter, dataRanges]);

  const isDefaultSort = sort.by === 'date' && sort.dir === 'desc';

  const filtered = useMemo(() => {
    let result = activeStatuses.size > 0 ? boletins.filter((b) => activeStatuses.has(b.status)) : boletins;

    // Search by name, team, market or selection
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          (b.name ?? '').toLowerCase().includes(q) ||
          b.items.some(
            (i) =>
              i.homeTeam.toLowerCase().includes(q) ||
              i.awayTeam.toLowerCase().includes(q) ||
              i.market.toLowerCase().includes(q) ||
              i.selection.toLowerCase().includes(q),
          ),
      );
    }

    // Range filters
    result = result.filter((b) => {
      const stake = Number(b.stake);
      const odds = Number(b.totalOdds);
      const ret = Number(b.actualReturn ?? b.potentialReturn);
      return (
        stake >= filter.stakeRange[0] &&
        stake <= filter.stakeRange[1] &&
        odds >= filter.oddsRange[0] &&
        odds <= filter.oddsRange[1] &&
        ret >= filter.returnRange[0] &&
        ret <= filter.returnRange[1]
      );
    });

    // Sport filter
    if (filter.sport !== null) {
      result = result.filter((b) => b.items.some((i) => i.sport === filter.sport));
    }

    // Competition filter
    if (filter.competitions.length > 0) {
      result = result.filter((b) =>
        b.items.some((i) => filter.competitions.includes(i.competition)),
      );
    }

    // Team filter
    if (filter.teams.length > 0) {
      result = result.filter((b) =>
        b.items.some(
          (i) => filter.teams.includes(i.homeTeam) || filter.teams.includes(i.awayTeam),
        ),
      );
    }

    // Betting site filter
    if (filter.sites.length > 0) {
      result = result.filter((b) => b.siteSlug !== null && filter.sites.includes(b.siteSlug));
    }

    // Sort
    return [...result].sort((a, b) => {
      let valA: number;
      let valB: number;
      switch (sort.by) {
        case 'stake':
          valA = Number(a.stake);
          valB = Number(b.stake);
          break;
        case 'odds':
          valA = Number(a.totalOdds);
          valB = Number(b.totalOdds);
          break;
        case 'return':
          valA = Number(a.actualReturn ?? a.potentialReturn);
          valB = Number(b.actualReturn ?? b.potentialReturn);
          break;
        case 'events':
          valA = a.items.length;
          valB = b.items.length;
          break;
        case 'date':
        default:
          valA = new Date(a.betDate ?? a.createdAt).getTime();
          valB = new Date(b.betDate ?? b.createdAt).getTime();
      }
      return sort.dir === 'asc' ? valA - valB : valB - valA;
    });
  }, [boletins, activeStatuses, searchQuery, filter, sort]);

  useEffect(() => {
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current);
      loadMoreTimeoutRef.current = null;
    }
    setIsLoadingMore(false);
    setVisibleCount(INITIAL_VISIBLE_BOLETINS);
  }, [activeStatuses, searchQuery, filter, sort]);

  const visibleBoletins = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const remainingBoletinsCount = Math.max(filtered.length - visibleCount, 0);
  const hasMoreBoletins = visibleCount < filtered.length;

  const triggerLoadMore = useCallback(() => {
    if (boletinsQuery.isLoading || !hasMoreBoletins || isLoadingMore) return;
    setIsLoadingMore(true);
    loadMoreTimeoutRef.current = setTimeout(() => {
      setVisibleCount((current) => Math.min(current + VISIBLE_BATCH_SIZE, filtered.length));
      setIsLoadingMore(false);
      loadMoreTimeoutRef.current = null;
    }, LOAD_MORE_DELAY_MS);
  }, [boletinsQuery.isLoading, filtered.length, hasMoreBoletins, isLoadingMore]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceFromBottom <= LOAD_MORE_AHEAD_PX) {
        triggerLoadMore();
      }
    },
    [triggerLoadMore],
  );

  const loadingMorePlaceholders = useMemo<SlipListItem[]>(() => {
    if (!isLoadingMore) return [];
    return Array.from({ length: Math.min(2, remainingBoletinsCount) }, (_, index) => ({
      id: `loading-more-${index}`,
      type: 'skeleton' as const,
    }));
  }, [isLoadingMore, remainingBoletinsCount]);

  const listData: SlipListItem[] = boletinsQuery.isLoading
    ? [{ id: 's1', type: 'skeleton' }, { id: 's2', type: 'skeleton' }, { id: 's3', type: 'skeleton' }]
    : [...visibleBoletins, ...loadingMorePlaceholders];

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, boletin) => {
        if (!boletin.isFreebet) {
          acc.totalStaked += Number(boletin.stake);
        }
        // Freebet returns count as pure gain (stake was free)
        acc.totalReturned += Number(boletin.actualReturn ?? 0);
        return acc;
      },
      { totalStaked: 0, totalReturned: 0 },
    );
  }, [filtered]);

  const roi =
    summary.totalStaked > 0
      ? ((summary.totalReturned - summary.totalStaked) / summary.totalStaked) * 100
      : 0;

  const hasActiveControls = searchQuery.trim().length > 0 || activeFilterCount > 0 || !isDefaultSort;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: Math.max(insets.bottom, 12) + 64 + tokens.spacing.lg,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={listData}
        keyExtractor={keyExtractor}
        onRefresh={() => {
          hapticLight();
          void boletinsQuery.refetch();
        }}
        onEndReached={triggerLoadMore}
        onEndReachedThreshold={LOAD_MORE_THRESHOLD}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* Title row */}
            <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.logo, { color: colors.textPrimary }]}>BetIntel</Text>
                <Text style={[styles.tagline, { color: colors.textMuted }]}>O teu tracker de apostas</Text>
              </View>
              <View style={styles.topActions}>
                {unreadCount > 0 ? (
                  <View style={[styles.notifBadge, { backgroundColor: colors.danger }]}>
                    <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => router.push('/boletins/journal')}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                >
                  <Ionicons color={colors.textSecondary} name="journal-outline" size={20} />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/boletins/create')}
                  style={[styles.iconButton, { backgroundColor: colors.primary }]}
                >
                  <Ionicons color="#FFFFFF" name="add" size={20} />
                </Pressable>
              </View>
            </Animated.View>

            {/* Summary card */}
            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <Pressable onPress={() => router.push('/(tabs)/stats')}>
                <Card style={[styles.summaryCard, { borderColor: colors.border }]}>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total apostado</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(summary.totalStaked)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Retorno</Text>
                    <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(summary.totalReturned)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>ROI</Text>
                    <Text style={[styles.summaryValue, { color: roi >= 0 ? colors.primary : colors.danger }]}>{roi.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.summaryChevron}>
                    <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                  </View>
                </Card>
              </Pressable>
            </Animated.View>

            {/* Search bar */}
            <Animated.View entering={FadeInDown.delay(150).duration(400).springify()}>
              <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons color={colors.textMuted} name="search" size={18} />
                <TextInput
                  onChangeText={setSearchQuery}
                  placeholder="Pesquisar boletins..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  value={searchQuery}
                />
                {searchQuery.length > 0 ? (
                  <Pressable hitSlop={8} onPress={() => setSearchQuery('')}>
                    <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>

            {/* Status dropdown + advanced filter button */}
            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={styles.controlsRow}>
              {/* Status dropdown trigger */}
              <Pressable
                onPress={() => { hapticLight(); setShowStatusDropdown(true); }}
                style={[styles.statusDropdownTrigger, { backgroundColor: activeStatuses.size > 0 ? 'rgba(0,168,67,0.12)' : colors.surfaceRaised, borderColor: activeStatuses.size > 0 ? colors.primary : colors.border }]}
              >
                <Ionicons color={activeStatuses.size > 0 ? colors.primary : colors.textSecondary} name="funnel-outline" size={15} />
                <Text
                  numberOfLines={1}
                  style={[styles.statusDropdownLabel, { color: activeStatuses.size > 0 ? colors.primary : colors.textSecondary }]}
                >
                  {activeStatuses.size === 0
                    ? 'Estado'
                    : activeStatuses.size === 1
                      ? (STATUS_FILTERS.find((f) => activeStatuses.has(f.key))?.label ?? 'Estado')
                      : `${activeStatuses.size} estados`}
                </Text>
                {activeStatuses.size > 0 ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => { e.stopPropagation(); hapticLight(); setActiveStatuses(new Set()); }}
                  >
                    <Ionicons color={colors.primary} name="close-circle" size={15} />
                  </Pressable>
                ) : (
                  <Ionicons color={colors.textMuted} name="chevron-down" size={15} />
                )}
              </Pressable>

              <SearchableDropdown
                visible={showStatusDropdown}
                onClose={() => setShowStatusDropdown(false)}
                title="Filtrar por estado"
                items={STATUS_FILTER_ITEMS}
                multiSelect
                selectedValues={Array.from(activeStatuses)}
                onSelectMultiple={(vals) => setActiveStatuses(new Set(vals as BoletinStatus[]))}
                onSelect={() => {}}
              />

              {/* Advanced filter button */}
              <Pressable
                onPress={() => filterSheetRef.current?.expand()}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor:
                      activeFilterCount > 0 || !isDefaultSort ? colors.primary : colors.surfaceRaised,
                    borderColor: activeFilterCount > 0 || !isDefaultSort ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  color={activeFilterCount > 0 || !isDefaultSort ? '#fff' : colors.textSecondary}
                  name="options-outline"
                  size={18}
                />
                {(activeFilterCount > 0 || !isDefaultSort) ? (
                  <Text style={styles.filterBtnBadge}>
                    {activeFilterCount + (!isDefaultSort ? 1 : 0)}
                  </Text>
                ) : null}
              </Pressable>
            </Animated.View>

            {/* Active filters summary */}
            {hasActiveControls ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSort({ by: 'date', dir: 'desc' });
                  setActiveStatuses(new Set());
                  setFilter({
                    stakeRange: [0, dataRanges.maxStake],
                    oddsRange: [1, dataRanges.maxOdds],
                    returnRange: [0, dataRanges.maxReturn],
                    sport: null,
                    competitions: [],
                    teams: [],
                    sites: [],
                  });
                }}
              >
                <Text style={[styles.clearFilters, { color: colors.textMuted }]}>
                  {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} · Limpar filtros
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !boletinsQuery.isLoading ? (
            boletinsQuery.isError ? (
              <EmptyState
                icon="cloud-outline"
                title="Não foi possível carregar os boletins"
                message="Toca em tentar novamente para actualizar a lista com os dados mais recentes."
                action={<Button onPress={() => void boletinsQuery.refetch()} title="Tentar novamente" />}
              />
            ) : (
              <EmptyState
                icon="receipt"
                title={hasActiveControls ? 'Nenhum boletim encontrado' : 'Ainda não tens boletins'}
                message={
                  hasActiveControls
                    ? 'Nenhum boletim corresponde aos filtros activos.'
                    : 'Cria o teu primeiro boletim tocando no botão + acima.'
                }
                action={
                  hasActiveControls ? undefined : (
                    <Button onPress={() => router.push('/boletins/create')} title="Criar boletim" />
                  )
                }
              />
            )
          ) : null
        }
        renderItem={({ item, index }) => {
          if ('type' in item) {
            return (
              <Card style={styles.skeletonCard}>
                <Skeleton height={20} width={110} />
                <Skeleton height={26} width="88%" />
                <Skeleton height={80} width="100%" />
              </Card>
            );
          }

          const card = (
            <BoletinCard
              boletin={item}
              onDelete={() => setDeleteTarget({ id: item.id, name: item.name ?? undefined })}
              onPress={() => router.push(`/boletins/${item.id}`)}
              onShare={() =>
                showToast(
                  'A partilha para amigos fica visível quando o módulo social estiver pronto.',
                  'info',
                )
              }
            />
          );

          if (index >= INITIAL_VISIBLE_BOLETINS) {
            return card;
          }

          return (
            <Animated.View entering={FadeInDown.delay(300 + index * 60).duration(400).springify()}>
              {card}
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={
          hasMoreBoletins ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : (
            <View style={styles.footerBar}>
              <Button onPress={() => router.push('/boletins/create')} title="Novo boletim" />
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        refreshing={boletinsQuery.isRefetching && !boletinsQuery.isLoading}
        windowSize={5}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        initialNumToRender={8}
      />

      {/* Sort & Filter bottom sheet */}
      <BoletinFilterSheet
        sheetRef={filterSheetRef}
        sort={sort}
        filter={filter}
        maxStake={dataRanges.maxStake}
        maxOdds={dataRanges.maxOdds}
        maxReturn={dataRanges.maxReturn}
        allCompetitions={allCompetitions}
        allTeams={allTeams}
        allSites={allSitesInData}
        onApply={(newSort, newFilter) => {
          setSort(newSort);
          setFilter(newFilter);
        }}
        onIndexChange={(idx) => setIsFilterSheetOpen(idx >= 0)}
      />

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Eliminar boletim"
        message={`Tens a certeza que queres eliminar "${deleteTarget?.name ?? 'este boletim'}"? Esta ação não pode ser revertida.`}
        confirmLabel="Eliminar"
        storageKey="delete-boletin"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleteTarget(null);
          try {
            await deleteMutation.mutateAsync(id);
            showToast('Boletim eliminado.', 'success');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    return String(error.response.data.error);
  }
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a operação.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 14, marginBottom: 18 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 4, paddingRight: 16 },
  logo: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontWeight: '600' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { alignItems: 'center', borderRadius: 16, height: 44, justifyContent: 'center', width: 44 },
  notifBadge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  summaryCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryChevron: { justifyContent: 'center', paddingLeft: 4 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '900' },
  searchBar: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  controlsRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  statusDropdownTrigger: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  statusDropdownLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  filterList: { gap: 8 },
  filterBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterBtnBadge: { color: '#fff', fontSize: 12, fontWeight: '800' },
  clearFilters: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  skeletonCard: { gap: 14 },
  loadMoreFooter: { alignItems: 'center', gap: 10, marginTop: 8, paddingBottom: 8, paddingTop: 4 },
  loadMoreText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  footerBar: { marginTop: tokens.spacing.xl },
});
