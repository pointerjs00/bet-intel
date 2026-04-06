import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { BoletinStatus } from '@betintel/shared';
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
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { filterBoletinsByStatus, useBoletins, useDeleteBoletinMutation } from '../../services/boletinService';
import { useUnreadNotificationsCount } from '../../services/socialService';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

type StatusFilter = 'ALL' | BoletinStatus;
type SlipListItem = { id: string; type: 'skeleton' } | (ReturnType<typeof useBoletins>['data'] extends Array<infer T> | undefined ? T : never);

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: '📋 Todos' },
  { key: BoletinStatus.PENDING, label: '⏳ Pendente' },
  { key: BoletinStatus.WON, label: '✅ Ganhou' },
  { key: BoletinStatus.LOST, label: '❌ Perdeu' },
  { key: BoletinStatus.CASHOUT, label: '💵 Cashout' },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const filterSheetRef = useRef<GorhomBottomSheet>(null);

  const [selectedFilter, setSelectedFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<BoletinSort>({ by: 'date', dir: 'desc' });

  const boletinsQuery = useBoletins();
  const deleteMutation = useDeleteBoletinMutation();
  const unreadCount = useUnreadNotificationsCount().data ?? 0;

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.stakeRange[0] > 0 || filter.stakeRange[1] < dataRanges.maxStake) count++;
    if (filter.oddsRange[0] > 1 || filter.oddsRange[1] < dataRanges.maxOdds) count++;
    if (filter.returnRange[0] > 0 || filter.returnRange[1] < dataRanges.maxReturn) count++;
    if (filter.sport !== null) count++;
    if (filter.competitions.length > 0) count++;
    if (filter.teams.length > 0) count++;
    return count;
  }, [filter, dataRanges]);

  const isDefaultSort = sort.by === 'date' && sort.dir === 'desc';

  const filtered = useMemo(() => {
    let result = filterBoletinsByStatus(boletins, selectedFilter);

    // Search by name, home or away team
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          (b.name ?? '').toLowerCase().includes(q) ||
          b.items.some(
            (i) =>
              i.homeTeam.toLowerCase().includes(q) ||
              i.awayTeam.toLowerCase().includes(q),
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
  }, [boletins, selectedFilter, searchQuery, filter, sort]);

  const listData: SlipListItem[] = boletinsQuery.isLoading
    ? [{ id: 's1', type: 'skeleton' }, { id: 's2', type: 'skeleton' }, { id: 's3', type: 'skeleton' }]
    : filtered;

  const summary = useMemo(() => {
    return boletins.reduce(
      (acc, boletin) => {
        acc.totalStaked += Number(boletin.stake);
        acc.totalReturned += Number(boletin.actualReturn ?? 0);
        return acc;
      },
      { totalStaked: 0, totalReturned: 0 },
    );
  }, [boletins]);

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
        keyExtractor={(item) => item.id}
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
                  onPress={() => router.push('/boletins/create')}
                  style={[styles.iconButton, { backgroundColor: colors.primary }]}
                >
                  <Ionicons color="#FFFFFF" name="add" size={20} />
                </Pressable>
              </View>
            </Animated.View>

            {/* Summary card */}
            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <Card style={styles.summaryCard}>
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
              </Card>
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

            {/* Status filter chips + sort/filter buttons */}
            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()} style={styles.controlsRow}>
              <FlatList
                contentContainerStyle={styles.filterList}
                data={STATUS_FILTERS}
                horizontal
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                  <Chip
                    label={item.label}
                    selected={item.key === selectedFilter}
                    onPress={() => setSelectedFilter(item.key)}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              />
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
                  setFilter({
                    stakeRange: [0, dataRanges.maxStake],
                    oddsRange: [1, dataRanges.maxOdds],
                    returnRange: [0, dataRanges.maxReturn],
                    sport: null,
                    competitions: [],
                    teams: [],
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

          return (
            <Animated.View entering={FadeInDown.delay(300 + index * 60).duration(400).springify()}>
              <BoletinCard
                boletin={item}
                onDelete={async () => {
                  try {
                    await deleteMutation.mutateAsync(item.id);
                    showToast('Boletim eliminado.', 'success');
                  } catch (error) {
                    showToast(getErrorMessage(error), 'error');
                  }
                }}
                onPress={() => router.push(`/boletins/${item.id}`)}
                onShare={() =>
                  showToast(
                    'A partilha para amigos fica visível quando o módulo social estiver pronto.',
                    'info',
                  )
                }
              />
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.lg }} />}
        ListFooterComponent={
          <View style={styles.footerBar}>
            <Button onPress={() => router.push('/boletins/create')} title="Novo boletim" />
          </View>
        }
        showsVerticalScrollIndicator={false}
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
        onApply={(newSort, newFilter) => {
          setSort(newSort);
          setFilter(newFilter);
        }}
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
  summaryCard: { flexDirection: 'row', gap: 12 },
  summaryMetric: { flex: 1, gap: 6 },
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
  controlsRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
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
  footerBar: { marginTop: tokens.spacing.xl },
});
