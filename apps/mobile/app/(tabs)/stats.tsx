import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StatsPeriod } from '@betintel/shared';
import { BreakdownTable, SiteBreakdownLabel } from '../../components/stats/BreakdownTable';
import { OddsRangeBar } from '../../components/stats/OddsRangeBar';
import { PnLChart } from '../../components/stats/PnLChart';
import { ROICard } from '../../components/stats/ROICard';
import { WinRateRing } from '../../components/stats/WinRateRing';
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
          paddingBottom: insets.bottom + tokens.spacing.xxl,
          paddingHorizontal: tokens.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerWrap}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Dashboard</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Lê o teu histórico e encontra onde tens vantagem.</Text>
        </View>

        <ScrollView contentContainerStyle={styles.periodTabs} horizontal showsHorizontalScrollIndicator={false}>
          {PERIOD_OPTIONS.map((option) => {
            const active = option.key === period;
            return (
              <Pressable
                key={option.key}
                onPress={() => setPeriod(option.key)}
                style={[
                  styles.periodChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceRaised,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.periodLabel, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {statsQuery.isLoading || !stats ? (
          <View style={styles.loadingStack}>
            <Skeleton height={160} width="100%" />
            <Skeleton height={220} width="100%" />
            <Skeleton height={220} width="100%" />
          </View>
        ) : (
          <View style={styles.contentStack}>
            <ROICard summary={stats.summary} title="ROI do período" />

            <View style={styles.heroMetricsRow}>
              <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Apostado</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(stats.summary.totalStaked)}</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Lucro / Prejuízo</Text>
                <Text style={[styles.metricValue, { color: stats.summary.profitLoss >= 0 ? colors.primary : colors.danger }]}>
                  {formatCurrency(stats.summary.profitLoss)}
                </Text>
              </View>
            </View>

            <WinRateRing winRate={stats.summary.winRate} />
            <PnLChart data={stats.timeline} />

            <BreakdownTable
              rows={stats.bySport}
              title="Por desporto"
              renderLabel={(row) => (
                <Text numberOfLines={1} style={[styles.tableLabel, { color: colors.textPrimary }]}>
                  {row.label}
                </Text>
              )}
            />

            <BreakdownTable
              rows={stats.bySite}
              title="Por casa"
              renderLabel={(row) => <SiteBreakdownLabel logoUrl={row.logoUrl} name={row.label} />}
            />

            <BreakdownTable rows={stats.byMarket} title="Por mercado" />
            <OddsRangeBar rows={stats.byOddsRange} />

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
    <View style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.miniLabel, { color: accentColor }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.miniTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.miniMeta, { color: colors.textSecondary }]}>Stake {formatCurrency(stake)} • Odds {formatOdds(totalOdds)}</Text>
      <Text style={[styles.miniProfit, { color: profitLoss >= 0 ? colors.primary : colors.danger }]}>{formatCurrency(profitLoss)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 8, marginBottom: 18 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  periodTabs: { gap: 8, marginBottom: 22 },
  periodChip: { borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  periodLabel: { fontSize: 13, fontWeight: '800' },
  loadingStack: { gap: 16 },
  contentStack: { gap: 18 },
  heroMetricsRow: { flexDirection: 'row', gap: 12 },
  metricCard: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 6, padding: 16 },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 18, fontWeight: '900' },
  tableLabel: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  horizontalCards: { gap: 12 },
  miniCard: { borderRadius: 22, borderWidth: 1, gap: 8, padding: 16, width: 250 },
  miniLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  miniTitle: { fontSize: 18, fontWeight: '900', lineHeight: 24 },
  miniMeta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  miniProfit: { fontSize: 20, fontWeight: '900' },
});