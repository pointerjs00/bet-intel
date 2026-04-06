import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import type { StatsPeriod } from '@betintel/shared';
import { BreakdownTable } from '../../components/stats/BreakdownTable';
import { OddsRangeBar } from '../../components/stats/OddsRangeBar';
import { PnLChart } from '../../components/stats/PnLChart';
import { ROICard } from '../../components/stats/ROICard';
import { WinRateRing } from '../../components/stats/WinRateRing';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { Skeleton } from '../../components/ui/Skeleton';
import { usePersonalStats } from '../../services/statsService';
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
  const { colors, tokens } = useTheme();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  // Custom date range (overrides period chips when both are set)
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  // Multi-site filter
  const [siteSlugs, setSiteSlugs] = useState<string[]>([]);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  // Resolve params for the query
  const activeFrom = useCustomRange && dateFrom ? toISODate(dateFrom) : undefined;
  const activeTo = useCustomRange && dateTo ? toISODate(dateTo) : undefined;
  const activePeriod: StatsPeriod = useCustomRange ? 'all' : period;

  const statsQuery = usePersonalStats(activePeriod, siteSlugs, activeFrom, activeTo);
  const stats = statsQuery.data;

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

        {/* Period chips */}
        <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
          <ScrollView contentContainerStyle={styles.periodTabs} horizontal showsHorizontalScrollIndicator={false}>
            {PERIOD_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={!useCustomRange && option.key === period}
                onPress={() => { setPeriod(option.key); setUseCustomRange(false); }}
              />
            ))}
            <Chip
              label="Personalizado"
              selected={useCustomRange}
              onPress={() => setUseCustomRange(true)}
            />
          </ScrollView>
        </Animated.View>

        {/* Custom date range pickers */}
        {useCustomRange && (
          <Animated.View entering={FadeInDown.duration(250)} style={styles.dateRangeRow}>
            <View style={styles.datePickerCol}>
              <DatePickerField
                label="De"
                maxDate={dateTo ?? undefined}
                value={dateFrom}
                onChange={setDateFrom}
                onClear={() => setDateFrom(null)}
              />
            </View>
            <View style={styles.datePickerCol}>
              <DatePickerField
                label="Até"
                minDate={dateFrom ?? undefined}
                value={dateTo}
                onChange={setDateTo}
                onClear={() => setDateTo(null)}
              />
            </View>
          </Animated.View>
        )}

        {/* Site filter — multi-select dropdown trigger */}
        <Animated.View entering={FadeInDown.delay(130).duration(400).springify()} style={styles.siteFilterRow}>
          <Pressable
            onPress={() => setSiteDropdownOpen(true)}
            style={[styles.siteFilterBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <Ionicons color={colors.textSecondary} name="business-outline" size={15} />
            <Text style={[styles.siteFilterLabel, { color: siteSlugs.length > 0 ? colors.textPrimary : colors.textSecondary }]}>
              {siteLabel}
            </Text>
            {siteSlugs.length > 0 && (
              <Pressable
                hitSlop={8}
                onPress={() => setSiteSlugs([])}
                style={styles.siteClearBtn}
              >
                <Ionicons color={colors.textMuted} name="close-circle" size={15} />
              </Pressable>
            )}
            <Ionicons color={colors.textMuted} name="chevron-down" size={14} />
          </Pressable>
        </Animated.View>

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

            <Animated.View entering={FadeInDown.delay(350).duration(400).springify()}>
              <PnLChart data={stats.timeline} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(400).springify()}>
              <BreakdownTable
                rows={stats.bySport}
                title="Por desporto"
                renderLabel={(row) => (
                  <Text numberOfLines={1} style={[styles.tableLabel, { color: colors.textPrimary }]}>
                    {row.label}
                  </Text>
                )}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(450).duration(400).springify()}>
              <BreakdownTable rows={stats.byTeam} title="Por equipa" />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(475).duration(400).springify()}>
              <BreakdownTable rows={stats.byCompetition} title="Por competição" />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500).duration(400).springify()}>
              <BreakdownTable rows={stats.byMarket} title="Por mercado" />
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
}: {
  title: string;
  label: string;
  stake: number;
  totalOdds: number;
  profitLoss: number;
  accentColor: string;
}) {
  const { colors } = useTheme();

  return (
    <Card style={styles.miniCard}>
      <Text style={[styles.miniLabel, { color: accentColor }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.miniTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.miniMeta, { color: colors.textSecondary }]}>Stake {formatCurrency(stake)} • Odds {formatOdds(totalOdds)}</Text>
      <Text style={[styles.miniProfit, { color: profitLoss >= 0 ? colors.primary : colors.danger }]}>{formatCurrency(profitLoss)}</Text>
    </Card>
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
  siteFilterRow: { marginBottom: 22 },
  siteFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  siteFilterLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  siteClearBtn: {},
  siteDropdownLogo: { width: 20, height: 20, borderRadius: 3 },
  loadingStack: { gap: 16 },
  contentStack: { gap: 18 },
  heroMetricsRow: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, gap: 6 },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 18, fontWeight: '900' },
  tableLabel: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  horizontalCards: { gap: 12 },
  miniCard: { gap: 8, width: 250 },
  miniLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  miniTitle: { fontSize: 18, fontWeight: '900', lineHeight: 24 },
  miniMeta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  miniProfit: { fontSize: 20, fontWeight: '900' },
});