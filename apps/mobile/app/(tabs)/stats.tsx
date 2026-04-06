import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import type { StatsPeriod } from '@betintel/shared';
import { BreakdownTable } from '../../components/stats/BreakdownTable';
import { OddsRangeBar } from '../../components/stats/OddsRangeBar';
import { PnLChart, type TimelineGranularity } from '../../components/stats/PnLChart';
import { ROICard } from '../../components/stats/ROICard';
import { WinRateRing } from '../../components/stats/WinRateRing';
import { Card } from '../../components/ui/Card';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { Skeleton } from '../../components/ui/Skeleton';
import { usePersonalStats } from '../../services/statsService';
import { useBoletins } from '../../services/boletinService';
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
  return date.toISOString().split('T')[0]!;
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

  // Resolve params for the query — each date is independent; either alone still filters
  const activeFrom = useCustomRange && dateFrom ? toISODate(dateFrom) : undefined;
  const activeTo = useCustomRange && dateTo ? toISODate(dateTo) : undefined;
  // Switch to 'all' whenever custom range mode is on, even if only one date is set
  const activePeriod: StatsPeriod = useCustomRange ? 'all' : period;

  const statsQuery = usePersonalStats(activePeriod, siteSlugs, activeFrom, activeTo, granularity);
  const stats = statsQuery.data;

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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Estatísticas' }} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.headerWrap}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Dashboard</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Lê o teu histórico e encontra onde tens vantagem.</Text>
        </Animated.View>

        {/* Period grid (2×2) + secondary controls row */}
        <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.filterZone}>
          <View style={styles.periodGrid}>
            {PERIOD_OPTIONS.map((option) => {
              const active = !useCustomRange && option.key === period;
              return (
                <TouchableOpacity
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
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.secondaryControlRow}>
            {/* Personalizado toggle */}
            <TouchableOpacity
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
            </TouchableOpacity>

            {/* Site filter button */}
            <TouchableOpacity
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
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Custom date range pickers */}
        {useCustomRange && (
          <Animated.View entering={FadeInDown.duration(250)} style={styles.dateRangeRow}>
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
        ) : (
          <View style={styles.contentStack}>
            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <ROICard summary={stats.summary} title="ROI do período" />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(250).duration(400).springify()} style={styles.heroMetricsRow}>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Apostado</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.totalStaked)}</Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Lucro / Prejuízo</Text>
                <Text style={[styles.metricValue, { color: stats.summary.profitLoss >= 0 ? colors.primary : colors.danger }]}>
                  {formatCurrency(stats.summary.profitLoss)}
                </Text>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(275).duration(400).springify()} style={styles.heroMetricsRow}>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odd média (ganhas)</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]}>{formatOdds(stats.summary.averageWonOdds)}</Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odd média (perdidas)</Text>
                <Text style={[styles.metricValue, { color: colors.danger }]}>{formatOdds(stats.summary.averageLostOdds)}</Text>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <WinRateRing winRate={stats.summary.winRate} />
            </Animated.View>

            {/* Additional metrics */}
            <Animated.View entering={FadeInDown.delay(320).duration(400).springify()} style={styles.heroMetricsRow}>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total boletins</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{stats.summary.totalBoletins}</Text>
                <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                  {stats.summary.settledBoletins} decidido{stats.summary.settledBoletins !== 1 ? 's' : ''} · {stats.summary.pendingBoletins} pendente{stats.summary.pendingBoletins !== 1 ? 's' : ''}
                </Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Stake média</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.averageStake)}</Text>
                <Text style={[styles.metricSmall, { color: colors.textMuted }]}>
                  Retorno médio: {formatCurrency(stats.summary.averageReturn)}
                </Text>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(335).duration(400).springify()} style={styles.heroMetricsRow}>
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

            <Animated.View entering={FadeInDown.delay(350).duration(400).springify()}>
              <PnLChart data={stats.timeline} granularity={granularity} onGranularityChange={setGranularity} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(400).springify()}>
              <BreakdownTable
                rows={stats.bySport}
                title="Por desporto"
                onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterSport: row.key } })}
                renderLabel={(row) => (
                  <Text numberOfLines={1} style={[styles.tableLabel, { color: colors.textPrimary }]}>
                    {row.label}
                  </Text>
                )}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(450).duration(400).springify()}>
              <BreakdownTable
                rows={stats.byTeam}
                title="Por equipa"
                onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterTeam: row.label } })}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(475).duration(400).springify()}>
              <BreakdownTable
                rows={stats.byCompetition}
                title="Por competição"
                onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterCompetition: row.label } })}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500).duration(400).springify()}>
              <BreakdownTable
                expandLabels
                rows={stats.byMarket}
                title="Por mercado"
                onRowPress={(row) => router.push({ pathname: '/(tabs)/', params: { filterMarket: row.label } })}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(550).duration(400).springify()}>
              <OddsRangeBar rows={stats.byOddsRange} />
            </Animated.View>

            <SectionTitle color={colors.textPrimary} title="Melhores boletins" />
            <ScrollView contentContainerStyle={styles.horizontalCards} horizontal showsHorizontalScrollIndicator={false}>
              {stats.bestBoletins.map((boletin) => (
                <MiniBoletinCard
                  key={boletin.id}
                  accentColor={colors.primary}
                  label="Melhor"
                  profitLoss={boletin.profitLoss}
                  stake={boletin.stake}
                  title={boletin.name ?? 'Boletin sem nome'}
                  totalOdds={boletin.totalOdds}
                  onPress={() => router.push(`/boletins/${boletin.id}`)}
                />
              ))}
            </ScrollView>

            <SectionTitle color={colors.textPrimary} title="Piores boletins" />
            <ScrollView contentContainerStyle={styles.horizontalCards} horizontal showsHorizontalScrollIndicator={false}>
              {stats.worstBoletins.map((boletin) => (
                <MiniBoletinCard
                  key={boletin.id}
                  accentColor={colors.danger}
                  label="Pior"
                  profitLoss={boletin.profitLoss}
                  stake={boletin.stake}
                  title={boletin.name ?? 'Boletin sem nome'}
                  totalOdds={boletin.totalOdds}
                  onPress={() => router.push(`/boletins/${boletin.id}`)}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
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
        <Text style={[styles.miniMeta, { color: colors.textSecondary }]}>Stake {formatCurrency(stake)} • Odds {formatOdds(totalOdds)}</Text>
        <Text style={[styles.miniProfit, { color: profitLoss >= 0 ? colors.primary : colors.danger }]}>{formatCurrency(profitLoss)}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 8, marginBottom: 18 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  periodTabs: { gap: 8, marginBottom: 12 },
  dateRangeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  datePickerCol: { flex: 1 },
  filterZone: { gap: 10, marginBottom: 18 },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodGridBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodGridBtnText: { fontSize: 13, fontWeight: '700' },
  secondaryControlRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  siteDropdownLogo: { width: 20, height: 20, borderRadius: 3 },
  loadingStack: { gap: 16 },
  contentStack: { gap: 18 },
  heroMetricsRow: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, gap: 6 },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricSmall: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tableLabel: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  horizontalCards: { gap: 12 },
  miniCard: { gap: 8, width: 250 },
  miniCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  miniTitle: { fontSize: 18, fontWeight: '900', lineHeight: 24 },
  miniMeta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  miniProfit: { fontSize: 20, fontWeight: '900' },
});