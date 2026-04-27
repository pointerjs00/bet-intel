import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Animated as RNAnimated, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { StatsBreakdownRow, StatsByHourRow, StatsPeriod } from '@betintel/shared';
import { BreakdownTable } from '../../components/stats/BreakdownTable';
import { CalibrationChart } from '../../components/stats/CalibrationChart';
import { NumericKeyboard } from '../../components/ui/NumericKeyboard';
import { FavouriteUnderdogCard } from '../../components/stats/FavouriteUnderdogCard';
import { FreebetCard } from '../../components/stats/FreebetCard';
import { HeatmapCalendar } from '../../components/stats/HeatmapCalendar';
import { HomeAwayCard } from '../../components/stats/HomeAwayCard';
import { AIReviewCard } from '../../components/stats/AIReviewCard';
import { InsightsCard } from '../../components/stats/InsightsCard';
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
import { useAiReview, usePersonalStats, useStatsTimeline } from '../../services/statsService';
import { useCustomMetricsStore } from '../../stores/customMetricsStore';
import { useStatsDashboardStore } from '../../stores/statsDashboardStore';
import { useBoletins, exportBoletinsToCsv, exportBoletinsToXlsx } from '../../services/boletinService';
import { useTableSort } from '../../hooks/useTableSort';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds, formatPercentage } from '../../utils/formatters';
import { BETTING_SITES } from '../../utils/sportAssets';

const PERIOD_OPTIONS: Array<{ key: StatsPeriod; label: string }> = [
  { key: 'week', label: 'Esta Semana' },
  { key: 'month', label: 'Este Mês' },
  { key: 'year', label: 'Este Ano' },
  { key: 'all', label: 'Sempre' },
];

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
  const { panHandlers: swipePanHandlers, animatedStyle: swipeAnimatedStyle } = useSwipeToDismiss(handleClose);

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
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
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
  const [period, setPeriod] = useState<StatsPeriod>('month');
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

  const aiReview = useAiReview();

  const boletinsQuery = useBoletins();
  const betDateBounds = useMemo(() => {
    const list = boletinsQuery.data ?? [];
    if (list.length === 0) return { min: undefined, max: undefined };
    const timestamps = list.map((b) =>
      new Date((b as any).betDate ?? b.createdAt).getTime(),
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
      <Stack.Screen options={{ title: 'Estatísticas' }} />

      {/* Fixed header — stays visible while scrolling */}
      <View style={[styles.fixedHeader, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Estatísticas</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity onPress={() => setShowCustomize(true)} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons color={colors.textSecondary} name="options-outline" size={22} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExport} hitSlop={8} style={styles.headerIconBtn}>
              <Ionicons color={colors.textSecondary} name="download-outline" size={22} />
            </TouchableOpacity>
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

        {/* Period grid (2×2) + secondary controls row */}
        <Animated.View entering={FadeInDown.delay(30).duration(160).springify()} style={styles.filterZone}>
          <View style={styles.periodGrid}>
            {PERIOD_OPTIONS.map((option) => {
              const active = !useCustomRange && option.key === period;
              return (
                <PressableScale
                  key={option.key}
                  onPress={() => { setPeriod(option.key); setUseCustomRange(false); }}
                  style={[
                    styles.periodGridBtn,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surfaceRaised },
                  ]}
                >
                  <Text style={[styles.periodGridBtnText, { color: active ? '#fff' : colors.textSecondary }]}>
                    {option.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

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
                  Comparar
                </Text>
              </PressableScale>
            )}
          </View>
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
          <EmptyState
            icon="chart-line"
            title="Sem estatísticas"
            message="Cria o teu primeiro boletim para começares a ver a evolução das tuas apostas aqui."
            action={<Button onPress={() => router.push('/boletins/create')} title="Criar boletim" />}
          />
        ) : (
          <View style={styles.contentStack}>
            {getEffectiveOrder().map((sectionId) => {
              if (!isSectionVisible(sectionId)) return null;

              switch (sectionId) {
              case 'roi': return (
                <Animated.View key="roi" entering={FadeInDown.delay(35).duration(160).springify()}>
                  <ROICard summary={stats.summary} title="ROI do período" onInfoPress={() => pushInfo('roi', stats.summary.roi)} />
                </Animated.View>
              );

              case 'hero-metrics': return (
                <Animated.View key="hero-metrics" entering={FadeInDown.delay(45).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Apostado</Text>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.totalStaked)}</Text>
                    {prevStats && <DeltaBadge current={stats.summary.totalStaked} previous={prevStats.summary.totalStaked} format="currency" />}
                  </Card>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Lucro / Prejuízo</Text>
                    <Text style={[styles.metricValue, { color: stats.summary.profitLoss >= 0 ? colors.primary : colors.danger }]}>
                      {formatCurrency(stats.summary.profitLoss)}
                    </Text>
                    {prevStats && <DeltaBadge current={stats.summary.profitLoss} previous={prevStats.summary.profitLoss} format="currency" />}
                  </Card>
                </Animated.View>
              );

              case 'avg-odds': return (
                <Animated.View key="avg-odds" entering={FadeInDown.delay(80).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odd média (ganhas)</Text>
                    <Text style={[styles.metricValue, { color: colors.primary }]}>{formatOdds(stats.summary.averageWonOdds)}</Text>
                    {prevStats && <DeltaBadge current={stats.summary.averageWonOdds} previous={prevStats.summary.averageWonOdds} format="number" />}
                  </Card>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odd média (perdidas)</Text>
                    <Text style={[styles.metricValue, { color: colors.danger }]}>{formatOdds(stats.summary.averageLostOdds)}</Text>
                    {prevStats && <DeltaBadge current={stats.summary.averageLostOdds} previous={prevStats.summary.averageLostOdds} format="number" invertColors />}
                  </Card>
                </Animated.View>
              );

              case 'win-rate': return (
                <Animated.View key="win-rate" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <WinRateRing winRate={stats.summary.winRate} onInfoPress={() => pushInfo('win-rate', stats.summary.winRate)} />
                  {prevStats && (
                    <View style={styles.comparisonRow}>
                      <Text style={[styles.comparisonLabel, { color: colors.textMuted }]}>vs período anterior</Text>
                      <DeltaBadge current={stats.summary.winRate} previous={prevStats.summary.winRate} format="percentage" />
                    </View>
                  )}
                </Animated.View>
              );

              case 'streaks': return (
                <Animated.View key="streaks" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <StreakCard streaks={stats.summary.streaks} onInfoPress={() => pushInfo('streaks', stats.summary.streaks.currentType === 'WON' ? stats.summary.streaks.currentCount : stats.summary.streaks.currentType === 'LOST' ? -stats.summary.streaks.currentCount : 0)} />
                </Animated.View>
              );

              case 'stake-by-outcome': return (
                <Animated.View key="stake-by-outcome" entering={FadeInDown.delay(95).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <View style={styles.metricLabelRow}>
                      <InfoButton accessibilityLabel="Informação sobre stake média" onPress={() => pushInfo('avg-stake-outcome', stats.summary.averageWonStake - stats.summary.averageLostStake)} showLabel={false} size="sm" />
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Stake média (ganhas)</Text>
                    </View>
                    <Text style={[styles.metricValue, { color: colors.primary }]}>{formatCurrency(stats.summary.averageWonStake)}</Text>
                  </Card>
                  <Card style={styles.metricCard}>
                    <View style={styles.metricLabelRow}>
                      <InfoButton accessibilityLabel="Informação sobre stake média" onPress={() => pushInfo('avg-stake-outcome', stats.summary.averageWonStake - stats.summary.averageLostStake)} showLabel={false} size="sm" />
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Stake média (perdidas)</Text>
                    </View>
                    <Text style={[styles.metricValue, { color: colors.danger }]}>{formatCurrency(stats.summary.averageLostStake)}</Text>
                  </Card>
                </Animated.View>
              );

              case 'totals': return (
                <Animated.View key="totals" entering={FadeInDown.delay(95).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total boletins</Text>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{stats.summary.totalBoletins}</Text>
                    <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                      {stats.summary.settledBoletins} decidido{stats.summary.settledBoletins !== 1 ? 's' : ''} · {stats.summary.pendingBoletins} pendente{stats.summary.pendingBoletins !== 1 ? 's' : ''}
                    </Text>
                    {prevStats && <DeltaBadge current={stats.summary.totalBoletins} previous={prevStats.summary.totalBoletins} format="number" />}
                  </Card>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Stake média</Text>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.averageStake)}</Text>
                    <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                      Retorno médio: {formatCurrency(stats.summary.averageReturn)}
                    </Text>
                    {prevStats && <DeltaBadge current={stats.summary.averageStake} previous={prevStats.summary.averageStake} format="currency" />}
                  </Card>
                </Animated.View>
              );

              case 'averages': return (
                <Animated.View key="averages" entering={FadeInDown.delay(35).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odd média geral</Text>
                    <Text style={[styles.metricValue, { color: colors.info }]}>{formatOdds(stats.summary.averageOdds)}</Text>
                  </Card>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Ganhos / Perdidos</Text>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                      <Text style={{ color: colors.primary }}>{stats.summary.wonBoletins}</Text>
                      {' / '}
                      <Text style={{ color: colors.danger }}>{stats.summary.lostBoletins}</Text>
                    </Text>
                  </Card>
                </Animated.View>
              );

              case 'efficiency': return (
                <Animated.View key="efficiency" entering={FadeInDown.delay(35).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <View style={styles.metricLabelRow}>
                      <InfoButton accessibilityLabel="Informação sobre eficiência de odds" onPress={() => pushInfo('odds-efficiency', stats.summary.oddsEfficiency)} showLabel={false} size="sm" />
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Eficiência de odds</Text>
                    </View>
                    <Text style={[styles.metricValue, { color: stats.summary.oddsEfficiency >= 100 ? colors.primary : stats.summary.oddsEfficiency > 0 ? colors.danger : colors.textMuted }]}>
                      {stats.summary.oddsEfficiency > 0 ? formatPercentage(stats.summary.oddsEfficiency) : '–'}
                    </Text>
                    <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                      {stats.summary.oddsEfficiency >= 100 ? 'Acima da expectativa' : stats.summary.oddsEfficiency > 0 ? 'Abaixo da expectativa' : 'Sem dados'}
                    </Text>
                  </Card>
                  <Card style={styles.metricCard}>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Retorno médio</Text>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.averageReturn)}</Text>
                  </Card>
                </Animated.View>
              );

              case 'pnl-chart': return (
                <Animated.View key="pnl-chart" entering={FadeInDown.delay(100).duration(160).springify()}>
                  <PnLChart data={timelineData} granularity={granularity} onGranularityChange={setGranularity} onInfoPress={() => pushInfo('pnl', stats.summary.profitLoss)} />
                </Animated.View>
              );

              case 'by-sport': return (
                <Animated.View key="by-sport" entering={FadeInDown.delay(35).duration(160).springify()}>
                  <FilteredBreakdownTable rows={stats.bySport} title="Por desporto" filterTitle="Por desporto" onInfoPress={() => pushInfo('by-sport', stats.bySport.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterSport: row.key } })} renderLabel={(row) => (<Text numberOfLines={1} style={[styles.tableLabel, { color: colors.textPrimary }]}>{row.label}</Text>)} />
                </Animated.View>
              );

              case 'by-team': return (
                <Animated.View key="by-team" entering={FadeInDown.delay(130).duration(160).springify()}>
                  <FilteredBreakdownTable rows={stats.byTeam} title="Por equipa" filterTitle="Por equipa" onInfoPress={() => pushInfo('by-team', stats.byTeam.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterTeam: row.label } })} />
                </Animated.View>
              );

              case 'by-competition': return (
                <Animated.View key="by-competition" entering={FadeInDown.delay(35).duration(160).springify()}>
                  <FilteredBreakdownTable rows={stats.byCompetition} title="Por competição" filterTitle="Por competição" onInfoPress={() => pushInfo('by-competition', stats.byCompetition.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterCompetition: row.label } })} />
                </Animated.View>
              );

              case 'by-market': return (
                <Animated.View key="by-market" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <FilteredBreakdownTable expandLabels rows={stats.byMarket} title="Por mercado" filterTitle="Por mercado" onInfoPress={() => pushInfo('by-market', stats.byMarket.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterMarket: row.label } })} />
                </Animated.View>
              );

              case 'by-odds-range': return (
                <Animated.View key="by-odds-range" entering={FadeInDown.delay(160).duration(160).springify()}>
                  <OddsRangeBar rows={stats.byOddsRange} onInfoPress={() => pushInfo('by-odds-range', stats.byOddsRange.length)} />
                </Animated.View>
              );

              case 'by-site': return (
                <Animated.View key="by-site" entering={FadeInDown.delay(35).duration(160).springify()}>
                  <SiteROITable rows={stats.bySite} onInfoPress={() => pushInfo('by-site', stats.bySite.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterSite: row.siteSlug } })} />
                </Animated.View>
              );

              case 'by-weekday': return (
                <Animated.View key="by-weekday" entering={FadeInDown.delay(170).duration(160).springify()}>
                  <FilteredBreakdownTable maxRows={7} rows={stats.byWeekday} title="Por dia da semana" filterTitle="Por dia da semana" onInfoPress={() => pushInfo('by-weekday', stats.byWeekday.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterWeekday: String(row.weekday) } })} />
                </Animated.View>
              );

              case 'by-leg-count': return (
                <Animated.View key="by-leg-count" entering={FadeInDown.delay(50).duration(160).springify()}>
                  <FilteredBreakdownTable rows={stats.byLegCount} title="Por nº de seleções" filterTitle="Por nº de seleções" onInfoPress={() => pushInfo('by-leg-count', stats.byLegCount.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterLegCount: String(row.legCount) } })} />
                </Animated.View>
              );

              case 'freebet': return (
                <Animated.View key="freebet" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <FreebetCard summary={stats.summary.freebetSummary} onInfoPress={() => pushInfo('freebet', stats.summary.freebetSummary.totalFreebets)} />
                </Animated.View>
              );

              case 'heatmap': return boletinsQuery.data && boletinsQuery.data.length > 0 ? (
                <Animated.View key="heatmap" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <HeatmapCalendar boletins={boletinsQuery.data} onInfoPress={() => pushInfo('heatmap', nonPendingBoletinCount)} />
                </Animated.View>
              ) : null;

              case 'by-stake': return (
                <Animated.View key="by-stake" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <FilteredBreakdownTable rows={stats.byStakeBracket} title="Por faixa de stake" filterTitle="Por faixa de stake" onInfoPress={() => pushInfo('by-stake', stats.byStakeBracket.length)} onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterStakeMin: String(row.minStake), filterStakeMax: row.maxStake === null ? 'open' : String(row.maxStake) } })} />
                </Animated.View>
              );

              case 'sport-market-matrix': return (
                <Animated.View key="sport-market-matrix" entering={FadeInDown.delay(95).duration(160).springify()}>
                  <SportMarketMatrix cells={stats.bySportMarket} onInfoPress={() => pushInfo('sport-market-matrix', stats.bySportMarket.length)} />
                </Animated.View>
              );

              case 'insights': return stats.insights.length > 0 ? (
                <Animated.View key="insights" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <InsightsCard insights={stats.insights} onInfoPress={() => pushInfo('insights', stats.insights.length)} />
                </Animated.View>
              ) : (
                <Animated.View key="insights" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <Card style={{ gap: 6 }}>
                    <View style={styles.placeholderRow}>
                      <Ionicons name="bulb-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.placeholderTitle, { color: colors.textSecondary }]}>Insights</Text>
                    </View>
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                      Sem insights disponíveis. Regista mais apostas para desbloquear análises automáticas.
                    </Text>
                  </Card>
                </Animated.View>
              );

              case 'roi-trend': return stats.roiTrend.length >= 2 ? (
                <Animated.View key="roi-trend" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <ROITrendChart data={stats.roiTrend} onInfoPress={() => pushInfo('roi-trend')} />
                </Animated.View>
              ) : (
                <Animated.View key="roi-trend" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <Card style={{ gap: 6 }}>
                    <View style={styles.placeholderRow}>
                      <Ionicons name="trending-up-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.placeholderTitle, { color: colors.textSecondary }]}>Tendência do ROI</Text>
                    </View>
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                      Precisas de pelo menos 6 apostas liquidadas para ver a tendência do ROI.
                    </Text>
                  </Card>
                </Animated.View>
              );

              case 'calibration': return stats.calibration.length >= 2 ? (
                <Animated.View key="calibration" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <CalibrationChart data={stats.calibration} onInfoPress={() => pushInfo('calibration')} />
                </Animated.View>
              ) : (
                <Animated.View key="calibration" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <Card style={{ gap: 6 }}>
                    <View style={styles.placeholderRow}>
                      <Ionicons name="locate-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.placeholderTitle, { color: colors.textSecondary }]}>Calibração</Text>
                    </View>
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                      Precisas de apostas liquidadas com odds em intervalos distintos para ver a calibração.
                    </Text>
                  </Card>
                </Animated.View>
              );

              case 'home-away': return (
                <Animated.View key="home-away" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <HomeAwayCard summary={stats.summary} onInfoPress={() => pushInfo('home-away')} />
                </Animated.View>
              );

              case 'favourite-underdog': return (
                <Animated.View key="favourite-underdog" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <FavouriteUnderdogCard summary={stats.summary} onInfoPress={() => pushInfo('favourite-underdog')} />
                </Animated.View>
              );

              case 'leg-kill': return stats.legKillDistribution.length > 0 ? (
                <Animated.View key="leg-kill" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <LegKillChart data={stats.legKillDistribution} onInfoPress={() => pushInfo('leg-kill')} />
                </Animated.View>
              ) : (
                <Animated.View key="leg-kill" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <Card style={{ gap: 6 }}>
                    <View style={styles.placeholderRow}>
                      <Ionicons name="skull-outline" size={16} color={colors.textMuted} />
                      <Text style={[styles.placeholderTitle, { color: colors.textSecondary }]}>Perna Assassina</Text>
                    </View>
                    <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
                      Precisas de acumuladas perdidas registadas para ver qual seleção te traiu mais.
                    </Text>
                  </Card>
                </Animated.View>
              );

              case 'by-hour': return stats.byHour.length > 0 ? (
                <Animated.View key="by-hour" entering={FadeInDown.delay(45).duration(160).springify()}>
                  <ByHourSection rows={stats.byHour} onInfoPress={() => pushInfo('by-hour', stats.byHour.length)} />
                </Animated.View>
              ) : null;

              case 'variance': return (stats.summary.variance !== undefined && stats.summary.variance > 0) ? (
                <Animated.View key="variance" entering={FadeInDown.delay(45).duration(160).springify()} style={styles.heroMetricsRow}>
                  <Card style={styles.metricCard}>
                    <View style={styles.metricLabelRow}>
                      <InfoButton accessibilityLabel="Informação sobre variância" onPress={() => pushInfo('variance', stats.summary.variance)} showLabel={false} size="sm" />
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Variância</Text>
                    </View>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.variance)}</Text>
                  </Card>
                  <Card style={styles.metricCard}>
                    <View style={styles.metricLabelRow}>
                      <InfoButton accessibilityLabel="Informação sobre desvio padrão" onPress={() => pushInfo('std-dev', stats.summary.stdDev)} showLabel={false} size="sm" />
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Desvio padrão</Text>
                    </View>
                    <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.stdDev)}</Text>
                    <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                      {stats.summary.stdDev < 5 ? 'Baixa volatilidade' : stats.summary.stdDev < 15 ? 'Volatilidade média' : 'Alta volatilidade'}
                    </Text>
                  </Card>
                </Animated.View>
              ) : null;

              case 'best-worst': return (
                <React.Fragment key="best-worst">
                  <SectionTitle color={colors.textPrimary} title="Melhores boletins" />
                  <ScrollView contentContainerStyle={styles.horizontalCards} horizontal showsHorizontalScrollIndicator={false}>
                    {stats.bestBoletins.map((boletin) => (
                      <MiniBoletinCard key={boletin.id} accentColor={colors.primary} label="Melhor" profitLoss={boletin.profitLoss} stake={boletin.stake} title={boletin.name ?? 'Boletim sem nome'} totalOdds={boletin.totalOdds} onPress={() => router.push(`/boletins/${boletin.id}`)} />
                    ))}
                  </ScrollView>
                  <SectionTitle color={colors.textPrimary} title="Piores boletins" />
                  <ScrollView contentContainerStyle={styles.horizontalCards} horizontal showsHorizontalScrollIndicator={false}>
                    {stats.worstBoletins.map((boletin) => (
                      <MiniBoletinCard key={boletin.id} accentColor={colors.danger} label="Pior" profitLoss={boletin.profitLoss} stake={boletin.stake} title={boletin.name ?? 'Boletim sem nome'} totalOdds={boletin.totalOdds} onPress={() => router.push(`/boletins/${boletin.id}`)} />
                    ))}
                  </ScrollView>
                </React.Fragment>
              );

              default: return null;
              }
            })}

            {/* AI Review */}
            <AIReviewCard
              data={aiReview.data}
              isLoading={aiReview.isLoading}
              error={aiReview.error as Error | null}
              onGenerate={aiReview.generate}
            />

            {/* Custom metrics section */}
            {customMetrics.length > 0 && (
              <>
                <View style={styles.customMetricsHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>As tuas métricas</Text>
                  <Pressable hitSlop={8} onPress={() => router.push('/custom-metric')}>
                    <Ionicons color={colors.primary} name="add-circle-outline" size={22} />
                  </Pressable>
                </View>
                {customMetrics.map((cm) => (
                  <Animated.View key={cm.id} entering={FadeInDown.delay(45).duration(160).springify()}>
                    <CustomMetricCard
                      metric={cm}
                      stats={stats}
                      timeline={timelineData}
                      onEdit={() => router.push({ pathname: '/custom-metric', params: { id: cm.id } })}
                    />
                  </Animated.View>
                ))}
              </>
            )}

            {/* Add custom metric button */}
            <Pressable
              onPress={() => router.push('/custom-metric')}
              style={[styles.addMetricBtn, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons color={colors.primary} name="add-circle-outline" size={20} />
              <Text style={[styles.addMetricText, { color: colors.primary }]}>Criar métrica personalizada</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Rendered last so it paints on top of the ScrollView */}
      <StatsCustomizeSheet visible={showCustomize} onClose={() => setShowCustomize(false)} />
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
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  periodTabs: { gap: 8, marginBottom: 12 },
  dateRangeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  datePickerCol: { flex: 1 },
  filterZone: { gap: 7, marginBottom: 12 },
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
  miniLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  miniTitle: { fontSize: 18, fontWeight: '900', lineHeight: 24 },
  miniMeta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  miniProfit: { fontSize: 20, fontWeight: '900' },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  comparisonLabel: { fontSize: 10, fontWeight: '600' },
  placeholderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  placeholderTitle: { fontSize: 14, fontWeight: '700' },
  placeholderText: { fontSize: 13, lineHeight: 19 },
});
