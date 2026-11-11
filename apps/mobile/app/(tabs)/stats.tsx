import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Animated as RNAnimated, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { StatsBreakdownRow, StatsByHourRow, StatsPeriod } from '@betintel/shared';
import { BreakdownTable, CompetitionBreakdownLabel, TeamBreakdownLabel } from '../../components/stats/BreakdownTable';
import { CalibrationChart } from '../../components/stats/CalibrationChart';
import { NumericKeyboard } from '../../components/ui/NumericKeyboard';
import { FavouriteUnderdogCard } from '../../components/stats/FavouriteUnderdogCard';
import { FreebetCard } from '../../components/stats/FreebetCard';
import { HeatmapCalendar } from '../../components/stats/HeatmapCalendar';
import { HomeAwayCard } from '../../components/stats/HomeAwayCard';
import { AIReviewCard } from '../../components/stats/AIReviewCard';
import { GoalProgressCard } from '../../components/stats/GoalProgressCard';
import { LegKillChart } from '../../components/stats/LegKillChart';
import { OddsRangeBar } from '../../components/stats/OddsRangeBar';
import { PnLChart, type TimelineGranularity } from '../../components/stats/PnLChart';
import { ROICard } from '../../components/stats/ROICard';
import { ROITrendChart } from '../../components/stats/ROITrendChart';
import { SiteROITable } from '../../components/stats/SiteROITable';
import { SportMarketMatrix } from '../../components/stats/SportMarketMatrix';
import { StreakCard } from '../../components/stats/StreakCard';
import { TableSortButton, type SortKey } from '../../components/stats/TableSortButton';
import { WinRateRing } from '../../components/stats/WinRateRing';
import { AppText } from '../../components/ui/AppText';
import { useCardElevation } from '../../components/ui/ListCard';
import { HeroCard, HeroTile } from '../../components/ui/HeroCard';
import { ionicon } from '../../types/icons';
import { MetricTile } from '../../components/ui/SectionHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { EmptyState } from '../../components/ui/EmptyState';
import { InfoButton } from '../../components/ui/InfoButton';
import { PressableScale } from '../../components/ui/PressableScale';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { Skeleton } from '../../components/ui/Skeleton';
import { DeltaBadge } from '../../components/stats/DeltaBadge';
import { CustomMetricCard } from '../../components/stats/CustomMetricCard';
import StatsCustomizeSheet from '../../components/stats/StatsCustomizeSheet';
import { useAiReview, usePersonalStats, useRecentForm, useStatsTimeline } from '../../services/statsService';
import { BetsTab, HabitsTab, SportsTab, SummaryTab, type AnalysisTab, type TabContext } from '../../components/stats/v3/AnalysisTabs';
import { StatsShareSheet } from '../../components/stats/StatsShareSheet';
import { useCustomMetricsStore } from '../../stores/customMetricsStore';
import { useStatsDashboardStore } from '../../stores/statsDashboardStore';
import { useBoletins, exportBoletinsToCsv, exportBoletinsToXlsx } from '../../services/boletinService';
import { useTableSort } from '../../hooks/useTableSort';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds, formatPercentage } from '../../utils/formatters';
import { BETTING_SITES } from '../../utils/sportAssets';

const SPORT_EMOJIS: Record<string, string> = {
  FOOTBALL: '⚽',
  BASKETBALL: '🏀',
  TENNIS: '🎾',
  HANDBALL: '🤾',
  VOLLEYBALL: '🏐',
  HOCKEY: '🏒',
  RUGBY: '🏉',
  AMERICAN_FOOTBALL: '🏈',
  BASEBALL: '⚾',
  OTHER: '🎯',
};

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
  { value: 'all', label: 'Sempre' },
];

const TAB_OPTIONS: Array<{ value: AnalysisTab; label: string }> = [
  { value: 'summary', label: 'Resumo' },
  { value: 'sports', label: 'Desportos' },
  { value: 'bets', label: 'Apostas' },
  { value: 'habits', label: 'Hábitos' },
];

const PERIOD_HERO: Record<StatsPeriod, string> = {
  week: 'Esta semana',
  month: 'Este mês',
  year: 'Este ano',
  all: 'Desde sempre',
};

const PERIOD_TITLE: Record<StatsPeriod, string> = {
  week: 'esta semana',
  month: 'este mês',
  year: 'este ano',
  all: 'desde sempre',
};

const SITE_DROPDOWN_ITEMS = BETTING_SITES.map((site) => ({
  label: site.name,
  value: site.slug,
}));

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── By-Hour section with filter modal ───────────────────────────────────────
type HourSortKey = 'roi' | 'winRate' | 'totalBets';

const HOUR_SORT_OPTIONS: Array<{ key: HourSortKey; label: string; icon: string }> = [
  { key: 'roi', label: 'ROI', icon: 'trending-up-outline' },
  { key: 'winRate', label: 'Win %', icon: 'trophy-outline' },
  { key: 'totalBets', label: 'Apostas', icon: 'layers-outline' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ByHourSection({
  rows,
  onInfoPress,
}: {
  rows: StatsByHourRow[];
  onInfoPress: () => void;
}) {
  const { colors } = useTheme();
  // committed values (applied to the table)
  const [sortBy, setSortBy] = useState<HourSortKey>('roi');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  // modal state
  const [modalVisible, setModalVisible] = useState(false);
  // draft values inside modal (only applied on "Aplicar")
  const [draftSort, setDraftSort] = useState<HourSortKey>('roi');
  const [draftHour, setDraftHour] = useState('');
  const [draftHourError, setDraftHourError] = useState(false);

  const isFiltered = selectedHour !== null;
  const hasActiveFilters = isFiltered || sortBy !== 'roi';

  // Filter button press animation
  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // Custom keyboard visibility (shown when hour input is "focused")
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardAnim = useSharedValue(0); // 0=hidden, 1=visible

  const keyboardAnimStyle = useAnimatedStyle(() => ({
    opacity: keyboardAnim.value,
    transform: [{ translateY: (1 - keyboardAnim.value) * 24 }],
  }));

  const showKeyboard = () => {
    setKeyboardVisible(true);
    keyboardAnim.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  };

  const hideKeyboard = () => {
    keyboardAnim.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }, () => {
      'worklet';
      // handled by runOnJS below
    });
    // delay unmount until animation finishes
    setTimeout(() => setKeyboardVisible(false), 160);
  };

  const openModal = () => {
    setDraftSort(sortBy);
    setDraftHour(selectedHour !== null ? String(selectedHour) : '');
    setDraftHourError(false);
    setKeyboardVisible(false);
    keyboardAnim.value = 0;
    setModalVisible(true);
  };

  const handleDraftHourChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setDraftHour(digits);
    if (digits === '') {
      setDraftHourError(false);
      return;
    }
    const n = parseInt(digits, 10);
    setDraftHourError(isNaN(n) || n < 0 || n > 23);
  };

  const handleApply = () => {
    setSortBy(draftSort);
    if (draftHour === '') {
      setSelectedHour(null);
    } else {
      const n = parseInt(draftHour, 10);
      if (!isNaN(n) && n >= 0 && n <= 23) {
        setSelectedHour(n);
      }
    }
    hideKeyboard();
    setModalVisible(false);
  };

  const handleReset = () => {
    setDraftSort('roi');
    setDraftHour('');
    setDraftHourError(false);
  };

  const handleClose = () => {
    hideKeyboard();
    setModalVisible(false);
  };
  const { panHandlers: swipePanHandlers, animatedStyle: swipeAnimatedStyle } = useSwipeToDismiss(handleClose, { visible: modalVisible });

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (sortBy === 'roi') return b.roi - a.roi;
        if (sortBy === 'winRate') return b.winRate - a.winRate;
        return b.totalBets - a.totalBets;
      }),
    [rows, sortBy],
  );

  const displayedRows = useMemo(
    () => (selectedHour !== null ? rows.filter((r) => r.hour === selectedHour) : sortedRows),
    [rows, sortedRows, selectedHour],
  );

  const filterButton = (
    <AnimatedPressable
      accessibilityLabel="Filtrar por hora"
      accessibilityRole="button"
      hitSlop={8}
      onPress={openModal}
      onPressIn={() => { btnScale.value = withTiming(0.88, { duration: 70 }); }}
      onPressOut={() => { btnScale.value = withSpring(1, { damping: 14, stiffness: 320 }); }}
      style={[
        byHourStyles.filterBtn,
        btnAnimStyle,
        {
          borderColor: hasActiveFilters ? colors.primary : colors.border,
          backgroundColor: hasActiveFilters ? `${colors.primary}18` : colors.surfaceRaised,
        },
      ]}
    >
      <Ionicons
        color={hasActiveFilters ? colors.primary : colors.textSecondary}
        name="options-outline"
        size={14}
      />
      <Text style={[byHourStyles.filterBtnText, { color: hasActiveFilters ? colors.primary : colors.textSecondary }]}>
        {hasActiveFilters
          ? isFiltered
            ? `${String(selectedHour).padStart(2, '0')}h`
            : HOUR_SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Filtrar'
          : 'Filtrar'}
      </Text>
    </AnimatedPressable>
  );

  return (
    <>
      <BreakdownTable
        headerRight={filterButton}
        maxRows={selectedHour !== null ? 1 : 3}
        rows={displayedRows}
        title="Por hora do dia"
        onInfoPress={onInfoPress}
      />

      <Modal
        animationType="slide"
        onRequestClose={handleClose}
        transparent
        visible={modalVisible}
      >
        <View style={byHourStyles.modalBackdrop}>
          <Pressable feedback="none" style={StyleSheet.absoluteFillObject} onPress={handleClose} />
          <RNAnimated.View style={[byHourStyles.modalSheet, { backgroundColor: colors.surface, paddingBottom: keyboardVisible ? 10 : 36 }, swipeAnimatedStyle]}>
            {/* Handle */}
            <View {...swipePanHandlers} style={byHourStyles.handleArea}>
              <View style={[byHourStyles.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
            <View style={byHourStyles.modalHeader}>
              <Text style={[byHourStyles.modalTitle, { color: colors.textPrimary }]}>Filtrar — Por hora do dia</Text>
              <Pressable hitSlop={12} onPress={handleClose}>
                <Ionicons color={colors.textSecondary} name="close" size={22} />
              </Pressable>
            </View>

            {/* Divider */}
            <View style={[byHourStyles.divider, { backgroundColor: colors.border }]} />

            {/* Sort */}
            <View style={byHourStyles.section}>
              <Text style={[byHourStyles.sectionTitle, { color: colors.textSecondary }]}>ORDENAR POR</Text>
              {draftHour !== '' && !draftHourError && (
                <Text style={[byHourStyles.sectionHint, { color: colors.textMuted, marginBottom: 4 }]}>
                  Ordenação desativada com hora específica
                </Text>
              )}
              <View style={[byHourStyles.sortGrid, draftHour !== '' && !draftHourError ? { opacity: 0.35 } : undefined]}>
                {HOUR_SORT_OPTIONS.map((opt) => {
                  const active = draftSort === opt.key;
                  const sortDisabled = draftHour !== '' && !draftHourError;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled: sortDisabled }}
                      disabled={sortDisabled}
                      onPress={() => setDraftSort(opt.key)}
                      style={[
                        byHourStyles.sortOption,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}18` : colors.surfaceRaised,
                        },
                      ]}
                    >
                      <Ionicons
                        color={active ? colors.primary : colors.textSecondary}
                        name={opt.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                      />
                      <Text style={[byHourStyles.sortOptionText, { color: active ? colors.primary : colors.textPrimary }]}>
                        {opt.label}
                      </Text>
                      {active && (
                        <View style={[byHourStyles.activeDot, { backgroundColor: colors.primary }]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Hour filter */}
            <View style={byHourStyles.section}>
              <Text style={[byHourStyles.sectionTitle, { color: colors.textSecondary }]}>FILTRAR POR HORA ESPECÍFICA</Text>
              <Text style={[byHourStyles.sectionHint, { color: colors.textMuted }]}>Insere um valor entre 0 e 23. Deixa vazio para ver as top 3 horas.</Text>
              <View style={byHourStyles.hourRow}>
                <Pressable
                  accessibilityLabel="Hora (0 a 23)"
                  accessibilityRole="button"
                  onPress={() => showKeyboard()}
                  style={[
                    byHourStyles.hourInputWrap,
                    {
                      borderColor: keyboardVisible ? colors.primary : draftHourError ? colors.danger : draftHour ? colors.primary : colors.border,
                      backgroundColor: colors.surfaceRaised,
                    },
                  ]}
                >
                  <Text style={[byHourStyles.hourDisplay, { color: draftHour ? colors.textPrimary : colors.textMuted }]}>
                    {draftHour || '--'}
                  </Text>
                  {keyboardVisible && (
                    <View style={[byHourStyles.cursor, { backgroundColor: colors.primary }]} />
                  )}
                  <Text style={[byHourStyles.hourSuffix, { color: colors.textSecondary }]}>h</Text>
                </Pressable>
                {draftHourError && (
                  <Text style={[byHourStyles.hourError, { color: colors.danger }]}>Valor inválido (0–23)</Text>
                )}
                {draftHour !== '' && !draftHourError && (
                  <Pressable hitSlop={8} onPress={() => { setDraftHour(''); setDraftHourError(false); }}>
                    <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Actions */}
            <View style={byHourStyles.actions}>
              <Pressable
                onPress={handleReset}
                style={[byHourStyles.actionBtn, byHourStyles.resetBtn, { borderColor: colors.border }]}
              >
                <Text style={[byHourStyles.resetBtnText, { color: colors.textSecondary }]}>Repor</Text>
              </Pressable>
              <Pressable
                onPress={handleApply}
                style={[byHourStyles.actionBtn, byHourStyles.applyBtn, { backgroundColor: draftHourError ? colors.border : colors.primary }]}
                disabled={draftHourError}
              >
                <Text style={byHourStyles.applyBtnText}>Aplicar</Text>
              </Pressable>
            </View>
          </RNAnimated.View>

          {/* Custom numeric keyboard — slides up from screen bottom on focus */}
          {keyboardVisible && (
            <Animated.View
              style={[byHourStyles.keyboardSheet, { backgroundColor: colors.surface, borderTopColor: colors.border }, keyboardAnimStyle]}
            >
              <View style={byHourStyles.keyboardBar}>
                {draftHourError ? (
                  <Text style={[byHourStyles.keyboardHint, { color: colors.danger }]}>Valor inválido (0–23)</Text>
                ) : (
                  <Text style={[byHourStyles.keyboardHint, { color: colors.textMuted }]}>
                    {draftHour !== '' ? `${draftHour}h selecionado` : 'Insere 0 a 23'}
                  </Text>
                )}
                <Pressable hitSlop={12} onPress={() => hideKeyboard()}>
                  <Text style={[byHourStyles.doneText, { color: colors.primary }]}>Concluído</Text>
                </Pressable>
              </View>
              <NumericKeyboard
                maxLength={2}
                onChangeText={handleDraftHourChange}
                value={draftHour}
              />
            </Animated.View>
          )}
        </View>
      </Modal>
    </>
  );
}

const byHourStyles = StyleSheet.create({
  filterBtn: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Modal
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  keyboardSheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 30,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  keyboardBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  keyboardHint: {
    fontSize: 13,
    fontWeight: '500',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '800',
  },
  cursor: {
    borderRadius: 1.5,
    height: 20,
    marginLeft: 2,
    width: 2,
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: {
    borderRadius: 3,
    height: 4,
    width: 40,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  section: {
    gap: 10,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: -4,
  },
  sortGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  sortOption: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    flex: 1,
    gap: 4,
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeDot: {
    borderRadius: 4,
    height: 4,
    marginTop: 2,
    width: 4,
  },
  hourRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  hourInputWrap: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: 90,
  },
  hourDisplay: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    width: 40,
  },
  hourSuffix: {
    fontSize: 16,
    fontWeight: '600',
  },
  hourError: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  resetBtn: {
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {
    // backgroundColor set inline
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

// ── Filtered breakdown table wrapper ────────────────────────────────────────

function FilteredBreakdownTable<TRow extends StatsBreakdownRow>({
  rows,
  title,
  filterTitle,
  maxRows,
  expandLabels,
  renderLabel,
  onRowPress,
  onInfoPress,
}: {
  rows: TRow[];
  title: string;
  filterTitle: string;
  maxRows?: number;
  expandLabels?: boolean;
  renderLabel?: (row: TRow) => React.ReactNode;
  onRowPress?: (row: TRow) => void;
  onInfoPress?: () => void;
}) {
  const { sortedRows, sortBy, minBets, onApply } = useTableSort(rows);

  return (
    <BreakdownTable
      rows={sortedRows}
      title={title}
      maxRows={maxRows}
      expandLabels={expandLabels}
      renderLabel={renderLabel}
      onRowPress={onRowPress}
      onInfoPress={onInfoPress}
      headerRight={<TableSortButton sortBy={sortBy} minBets={minBets} onApply={onApply} title={filterTitle} />}
    />
  );
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const [period, setPeriod] = useState<StatsPeriod>('year');
  const [tab, setTab] = useState<AnalysisTab>('summary');
  // Custom date range (overrides period chips when both are set)
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  // Multi-site filter
  const [siteSlugs, setSiteSlugs] = useState<string[]>([]);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  // Timeline granularity
  const [granularity, setGranularity] = useState<TimelineGranularity>('weekly');
  // Period comparison toggle
  const [showComparison, setShowComparison] = useState(false);
  // Customise panel
  const [showCustomize, setShowCustomize] = useState(false);
  // Stats share card
  const [showShareCard, setShowShareCard] = useState(false);
  // Secondary filters (custom range, sites, comparison) live behind one button (D7)
  const [showFilters, setShowFilters] = useState(false);
  const elevation = useCardElevation();

  const isSectionVisible = useStatsDashboardStore((s) => s.isSectionVisible);
  const getEffectiveOrder = useStatsDashboardStore((s) => s.getEffectiveOrder);
  const customMetrics = useCustomMetricsStore((s) => s.metrics);

  // Resolve params for the query — each date is independent; either alone still filters
  const activeFrom = useCustomRange && dateFrom ? toISODate(dateFrom) : undefined;
  const activeTo = useCustomRange && dateTo ? toISODate(dateTo) : undefined;
  // Switch to 'all' whenever custom range mode is on, even if only one date is set
  const activePeriod: StatsPeriod = useCustomRange ? 'all' : period;

  // Compute the "previous period" for comparison
  const prevPeriodDates = useMemo((): { from?: string; to?: string; period: StatsPeriod } => {
    if (useCustomRange && dateFrom && dateTo) {
      const span = dateTo.getTime() - dateFrom.getTime();
      const prevTo = new Date(dateFrom.getTime() - 1); // day before current range
      const prevFrom = new Date(prevTo.getTime() - span);
      return { from: toISODate(prevFrom), to: toISODate(prevTo), period: 'all' };
    }
    const now = new Date();
    switch (period) {
      case 'week': {
        const prevEnd = new Date(now);
        prevEnd.setDate(prevEnd.getDate() - 7);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - 7);
        return { from: toISODate(prevStart), to: toISODate(prevEnd), period: 'all' };
      }
      case 'month': {
        const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
        const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
        return { from: toISODate(prevStart), to: toISODate(prevEnd), period: 'all' };
      }
      case 'year': {
        const prevEnd = new Date(now.getFullYear() - 1, 11, 31);
        const prevStart = new Date(now.getFullYear() - 1, 0, 1);
        return { from: toISODate(prevStart), to: toISODate(prevEnd), period: 'all' };
      }
      default:
        return { period: 'all' };
    }
  }, [period, useCustomRange, dateFrom, dateTo]);

  const statsQuery = usePersonalStats(activePeriod, siteSlugs, activeFrom, activeTo);
  const stats = statsQuery.data;

  // Comparison is only meaningful for relative periods, not 'all'
  const canCompare = showComparison && !!prevPeriodDates.from;

  const prevStatsQuery = usePersonalStats(
    prevPeriodDates.period,
    siteSlugs,
    prevPeriodDates.from,
    prevPeriodDates.to,
    canCompare,
  );
  const prevStats = canCompare ? prevStatsQuery.data : undefined;

  const timelineQuery = useStatsTimeline(activePeriod, siteSlugs, activeFrom, activeTo, granularity);
  const timelineData = timelineQuery.data ?? stats?.timeline ?? [];

  const recentFormQuery = useRecentForm();
  const aiReview = useAiReview();

  const boletinsQuery = useBoletins();
  const betDateBounds = useMemo(() => {
    const list = boletinsQuery.data ?? [];
    if (list.length === 0) return { min: undefined, max: undefined };
    const timestamps = list.map((b) =>
      new Date(b.betDate ?? b.createdAt).getTime(),
    );
    return {
      min: new Date(Math.min(...timestamps)),
      max: new Date(),
    };
  }, [boletinsQuery.data]);

  const siteLabel =
    siteSlugs.length === 0
      ? 'Todas as casas'
      : siteSlugs.length === 1
      ? (BETTING_SITES.find((s) => s.slug === siteSlugs[0])?.name ?? siteSlugs[0])
      : `${siteSlugs.length} casas`;

  const activeFilterCount = (useCustomRange ? 1 : 0) + (siteSlugs.length > 0 ? 1 : 0) + (canCompare ? 1 : 0);
  const activeFilterSummary = [
    useCustomRange
      ? `${dateFrom ? dateFrom.toLocaleDateString('pt-PT') : '…'} – ${dateTo ? dateTo.toLocaleDateString('pt-PT') : '…'}`
      : null,
    siteSlugs.length > 0 ? siteLabel : null,
    canCompare ? 'vs período anterior' : null,
  ].filter(Boolean).join(' · ');

  // Hero: profit per timeline bucket (bars) for the selected period
  const heroBars = useMemo(() => timelineData.slice(-12).map((p) => p.profitLoss), [timelineData]);
  const heroMax = Math.max(1, ...heroBars.map((v) => Math.abs(v)));

  const nonPendingBoletinCount = useMemo(
    () => (boletinsQuery.data ?? []).filter((b) => b.status !== 'PENDING').length,
    [boletinsQuery.data],
  );

  const handleExport = useCallback(() => {
    const data = boletinsQuery.data ?? [];
    Alert.alert(
      'Exportar dados',
      'Escolhe o formato de exportação:',
      [
        {
          text: 'CSV',
          onPress: async () => {
            try {
              await exportBoletinsToCsv(data);
            } catch {
              Alert.alert('Erro', 'Não foi possível exportar os dados.');
            }
          },
        },
        {
          text: 'Excel (XLSX)',
          onPress: async () => {
            try {
              await exportBoletinsToXlsx(data);
            } catch {
              Alert.alert('Erro', 'Não foi possível exportar os dados.');
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }, [boletinsQuery.data]);

  const pushInfo = useCallback(
    (metric: string, value?: number) =>
      router.push({
        pathname: '/metric-info',
        params: { metric, ...(value !== undefined ? { value: String(value) } : {}) },
      }),
    [router],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Análise' }} />

      {/* Fixed header — stays visible while scrolling */}
      <View style={[styles.fixedHeader, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.headerTopRow}>
          <AppText variant="title">Análise</AppText>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity onPress={handleExport} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons color={colors.textSecondary} name="download-outline" size={22} />
            </TouchableOpacity>
            {stats && (
              <TouchableOpacity onPress={() => setShowShareCard(true)} hitSlop={8} style={styles.headerIconBtn}>
                <Ionicons color={colors.textSecondary} name="share-outline" size={22} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => {
              void statsQuery.refetch();
              void boletinsQuery.refetch();
            }}
            refreshing={statsQuery.isRefetching && !statsQuery.isLoading}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >

        {/* Period (segmented) + one filters button (redesign D7) */}
        <Animated.View entering={FadeInDown.delay(30).duration(160).springify()} style={styles.filterZone}>
          <View style={styles.periodRow}>
            <View style={styles.flex1}>
              <SegmentedControl
                onChange={(v) => { setPeriod(v); setUseCustomRange(false); }}
                options={PERIOD_OPTIONS}
                value={useCustomRange ? ('' as StatsPeriod) : period}
              />
            </View>
            <Pressable
              accessibilityLabel={activeFilterCount > 0 ? `Filtros, ${activeFilterCount} ativos` : 'Filtros'}
              accessibilityRole="button"
              onPress={() => setShowFilters((v) => !v)}
              style={[styles.filterBtn, { backgroundColor: activeFilterCount > 0 || showFilters ? `${colors.primary}22` : colors.surface }]}
            >
              <Ionicons color={activeFilterCount > 0 ? colors.primary : colors.textSecondary} name="funnel-outline" size={18} />
              {activeFilterCount > 0 ? (
                <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                  <AppText style={styles.filterBadgeText} variant="label">{activeFilterCount}</AppText>
                </View>
              ) : null}
            </Pressable>
          </View>
          {activeFilterSummary && !showFilters ? (
            <Pressable accessibilityRole="button" onPress={() => setShowFilters(true)}>
              <AppText numberOfLines={1} variant="caption">{activeFilterSummary}</AppText>
            </Pressable>
          ) : null}

          {showFilters ? (
          <View style={styles.secondaryControlRow}>
            {/* Personalizado toggle */}
            <PressableScale
              onPress={() => setUseCustomRange((v) => !v)}
              style={[
                styles.secondaryBtn,
                { borderColor: useCustomRange ? colors.primary : colors.border, backgroundColor: useCustomRange ? `${colors.primary}22` : colors.surfaceRaised },
              ]}
            >
              <Ionicons color={useCustomRange ? colors.primary : colors.textSecondary} name="calendar-outline" size={14} />
              <Text style={[styles.secondaryBtnText, { color: useCustomRange ? colors.primary : colors.textSecondary }]}>
                Personalizado
              </Text>
            </PressableScale>

            {/* Site filter button */}
            <PressableScale
              onPress={() => setSiteDropdownOpen(true)}
              style={[
                styles.secondaryBtn,
                { borderColor: siteSlugs.length > 0 ? colors.primary : colors.border, backgroundColor: siteSlugs.length > 0 ? `${colors.primary}22` : colors.surfaceRaised, flex: 1 },
              ]}
            >
              <Ionicons color={siteSlugs.length > 0 ? colors.primary : colors.textSecondary} name="business-outline" size={14} />
              <Text style={[styles.secondaryBtnText, { color: siteSlugs.length > 0 ? colors.primary : colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                {siteLabel}
              </Text>
              {siteSlugs.length > 0 && (
                <Pressable hitSlop={8} onPress={() => setSiteSlugs([])}>
                  <Ionicons color={colors.primary} name="close-circle" size={15} />
                </Pressable>
              )}
            </PressableScale>

            {/* Comparar toggle */}
            {period !== 'all' && !useCustomRange && (
              <PressableScale
                onPress={() => setShowComparison((v) => !v)}
                style={[
                  styles.secondaryBtn,
                  { borderColor: showComparison ? colors.info : colors.border, backgroundColor: showComparison ? `${colors.info}22` : colors.surfaceRaised },
                ]}
              >
                <Ionicons color={showComparison ? colors.info : colors.textSecondary} name="git-compare-outline" size={14} />
                <Text style={[styles.secondaryBtnText, { color: showComparison ? colors.info : colors.textSecondary }]}>
                  {showComparison
                    ? period === 'week' ? 'vs semana ant.' : period === 'month' ? 'vs mês ant.' : 'vs ano ant.'
                    : 'Comparar'}
                </Text>
              </PressableScale>
            )}
          </View>
          ) : null}
        </Animated.View>

        {/* Custom date range pickers */}
        {useCustomRange && (
          <Animated.View entering={FadeInDown.duration(120)} style={styles.dateRangeRow}>
            <View style={styles.datePickerCol}>
              <DatePickerField
                label="De"
                minDate={betDateBounds.min}
                maxDate={dateTo ?? betDateBounds.max}
                value={dateFrom}
                onChange={setDateFrom}
                onClear={() => setDateFrom(null)}
              />
            </View>
            <View style={styles.datePickerCol}>
              <DatePickerField
                label="Até"
                minDate={dateFrom ?? betDateBounds.min}
                maxDate={betDateBounds.max}
                value={dateTo}
                onChange={setDateTo}
                onClear={() => setDateTo(null)}
              />
            </View>
          </Animated.View>
        )}


        <SearchableDropdown
          multiSelect
          items={SITE_DROPDOWN_ITEMS}
          selectedValues={siteSlugs}
          title="Casas de apostas"
          visible={siteDropdownOpen}
          onClose={() => setSiteDropdownOpen(false)}
          onSelect={() => {}}
          onSelectMultiple={setSiteSlugs}
          renderItemLeft={(item) => {
            const site = BETTING_SITES.find((s) => s.slug === item.value);
            if (!site?.logo) return null;
            return <Image resizeMode="contain" source={site.logo} style={styles.siteDropdownLogo} />;
          }}
        />

        {statsQuery.isLoading || !stats ? (
          <View style={styles.loadingStack}>
            <Card style={{ gap: 12 }}><Skeleton height={24} width="60%" /><Skeleton height={80} width="100%" /></Card>
            <Card style={{ gap: 12 }}><Skeleton height={18} width={140} /><Skeleton height={160} width="100%" /></Card>
          </View>
        ) : stats.summary.totalBoletins === 0 ? (
          (boletinsQuery.data?.length ?? 0) > 0 && (period !== 'all' || useCustomRange) ? (
            // Has bets, just none in this period (e.g. "Este Mês" during a break).
            <EmptyState
              icon="calendar-blank-outline"
              title="Sem apostas neste período"
              message="Não registaste apostas neste intervalo. Vê o histórico completo ou escolhe outro período."
              action={<Button onPress={() => { setPeriod('all'); setUseCustomRange(false); }} title="Ver desde sempre" />}
            />
          ) : (
            <EmptyState
              icon="chart-line"
              title="Sem estatísticas"
              message="Regista o teu primeiro boletim para começares a ver a evolução das tuas apostas aqui."
              action={<Button onPress={() => router.push('/boletins/novo')} title="Criar boletim" />}
            />
          )
        ) : (
          <View style={styles.contentStack}>
            <SegmentedControl onChange={setTab} options={TAB_OPTIONS} value={tab} />
            <Animated.View entering={FadeIn.duration(220)} key={tab}>
              {(() => {
                const ctx: TabContext = {
                  stats,
                  timeline: timelineData,
                  boletins: boletinsQuery.data ?? [],
                  periodLabel: useCustomRange ? 'No intervalo escolhido' : PERIOD_HERO[period],
                  onInfo: (metric, value) => pushInfo(metric, value),
                  onFilter: (params) => router.push({ pathname: '/(tabs)/boletins', params }),
                  onOpenTeam: (name) => router.push({ pathname: '/equipa', params: { name } }),
                };
                if (tab === 'sports') return <SportsTab ctx={ctx} />;
                if (tab === 'bets') return <BetsTab ctx={ctx} />;
                if (tab === 'habits') return <HabitsTab ctx={ctx} />;
                return (
                  <SummaryTab
                    ctx={ctx}
                    footer={
                      <>
                        <GoalProgressCard />
                        <AIReviewCard
                          data={aiReview.data}
                          error={aiReview.error as Error | null}
                          isLoading={aiReview.isLoading}
                          onGenerate={aiReview.generate}
                        />
                        {customMetrics.length > 0 ? (
                          <View style={styles.customMetricsHeader}>
                            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>As tuas métricas</Text>
                          </View>
                        ) : null}
                        {customMetrics.map((cm) => (
                          <CustomMetricCard
                            key={cm.id}
                            metric={cm}
                            onEdit={() => router.push({ pathname: '/custom-metric', params: { id: cm.id } })}
                            stats={stats}
                            timeline={timelineData}
                          />
                        ))}
                        <Pressable
                          onPress={() => router.push('/custom-metric')}
                          style={[styles.addMetricBtn, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                        >
                          <Ionicons color={colors.primary} name="add-circle-outline" size={20} />
                          <Text style={[styles.addMetricText, { color: colors.primary }]}>Criar métrica personalizada</Text>
                        </Pressable>
                      </>
                    }
                  />
                );
              })()}
            </Animated.View>
          </View>
        )}
      </ScrollView>

      <StatsShareSheet visible={showShareCard} onClose={() => setShowShareCard(false)} />

    </View>
  );
}

function SectionTitle({ color, title }: { color: string; title: string }) {
  return <Text style={[styles.sectionTitle, { color }]}>{title}</Text>;
}

function MiniBoletinCard({
  title,
  label,
  stake,
  totalOdds,
  profitLoss,
  accentColor,
  onPress,
}: {
  title: string;
  label: string;
  stake: number;
  totalOdds: number;
  profitLoss: number;
  accentColor: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.7 : 1 })}>
      <Card style={styles.miniCard}>
        <View style={styles.miniCardHeader}>
          <Text style={[styles.miniLabel, { color: accentColor }]}>{label}</Text>
          {onPress ? <Ionicons color={colors.textMuted} name="chevron-forward" size={14} /> : null}
        </View>
        <Text numberOfLines={2} style={[styles.miniTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.miniMeta, { color: colors.textSecondary }]}>Stake {formatCurrency(stake)} · Odds {formatOdds(totalOdds)}</Text>
        <Text style={[styles.miniProfit, { color: profitLoss >= 0 ? colors.primary : colors.danger }]}>{formatCurrency(profitLoss)}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fixedHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  headerWrap: { gap: 8, marginBottom: 18 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exportBtn: { padding: 4 },
  eyebrow: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  periodTabs: { gap: 8, marginBottom: 12 },
  dateRangeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  datePickerCol: { flex: 1 },
  filterZone: { gap: 10, marginBottom: 14 },
  periodRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  filterBtn: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  filterBadge: { alignItems: 'center', borderRadius: 8, height: 16, justifyContent: 'center', minWidth: 16, paddingHorizontal: 3, position: 'absolute', right: 4, top: 4 },
  filterBadgeText: { color: '#0B0D0C', fontSize: 10 },
  hero: { borderRadius: 20, gap: 8, padding: 20 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  roiPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 8 },
  highlightScroll: { marginHorizontal: -16 },
  highlightRow: { gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  highlightCard: { borderRadius: 20, gap: 6, padding: 14, width: 220 },
  highlightIcon: { alignItems: 'center', borderRadius: 12, height: 34, justifyContent: 'center', width: 34 },
  heroBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 6, height: 56, marginTop: 6 },
  heroBarSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  heroMetrics: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 14 },
  periodGrid: { flexDirection: 'row', gap: 6 },
  periodGridBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodGridBtnText: { fontSize: 12, fontWeight: '700' },
  secondaryControlRow: { flexDirection: 'row', gap: 6 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '600' },
  siteDropdownLogo: { width: 20, height: 20, borderRadius: 3 },
  loadingStack: { gap: 16 },
  contentStack: { gap: 18 },
  customMetricsHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: 8 },
  addMetricBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' as const, marginTop: 4 },
  addMetricText: { fontSize: 14, fontWeight: '700' as const },
  heroMetricsRow: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, gap: 6 },
  metricLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricSmall: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tableLabel: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  horizontalCards: { gap: 12, paddingRight: 32 },
  miniCard: { gap: 8, width: 250 },
  miniCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniLabel: { fontSize: 12, fontWeight: '800' },
  miniTitle: { fontSize: 18, fontWeight: '900', lineHeight: 24 },
  miniMeta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  miniProfit: { fontSize: 20, fontWeight: '900' },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  comparisonLabel: { fontSize: 10, fontWeight: '600' },
  placeholderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  placeholderTitle: { fontSize: 14, fontWeight: '700' },
  placeholderText: { fontSize: 13, lineHeight: 19 },
});
