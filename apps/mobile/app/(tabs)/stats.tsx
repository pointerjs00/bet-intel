import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
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
import { Skeleton } from '../../components/ui/Skeleton';
import { usePersonalStats } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds, formatPercentage } from '../../utils/formatters';

const PERIOD_OPTIONS: Array<{ key: StatsPeriod; label: string }> = [
  { key: 'week', label: 'Esta Semana' },
  { key: 'month', label: 'Este Mês' },
  { key: 'year', label: 'Este Ano' },
  { key: 'all', label: 'Sempre' },
];

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const statsQuery = usePersonalStats(period);

  const stats = statsQuery.data;

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

        <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
          <ScrollView contentContainerStyle={styles.periodTabs} horizontal showsHorizontalScrollIndicator={false}>
            {PERIOD_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={option.key === period}
                onPress={() => setPeriod(option.key)}
              />
            ))}
          </ScrollView>
        </Animated.View>

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
  periodTabs: { gap: 8, marginBottom: 22 },
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