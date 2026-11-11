import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StatsTimelinePoint } from '@betintel/shared';
import { Area, CartesianChart, Line } from 'victory-native';
import { DashPathEffect, LinearGradient, Line as SkiaLine, vec } from '@shopify/react-native-skia';
import { useTheme } from '../../../theme/useTheme';
import { formatCurrency } from '../../../utils/formatters';
import { ColumnChart } from './ColumnChart';
import { MiniToggle, StatCard } from './StatCard';

type Mode = 'cumulative' | 'buckets';

interface Datum extends Record<string, number> { x: number; y: number }

const euros = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v)).replace(/,00(?=\s?€)/, '')}`;

/**
 * "Evolução do lucro": cumulative profit as a smooth gradient area that animates in, with the
 * final value pinned; "Por período" switches to columns per bucket.
 */
export function ProfitCurve({ data, index, best, worst }: { data: StatsTimelinePoint[]; index?: number; best?: number; worst?: number }) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('cumulative');

  const trimmed = useMemo(() => {
    const first = data.findIndex((d) => d.totalStaked > 0 || d.profitLoss !== 0);
    return first > 0 ? data.slice(first - 1) : data;
  }, [data]);

  const points = useMemo<Datum[]>(() => {
    let run = 0;
    const pts = trimmed.map((d, i) => { run += d.profitLoss; return { x: i, y: run }; });
    if (pts.length === 0) return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    if (pts.length === 1) return [{ x: 0, y: 0 }, { x: 1, y: pts[0]!.y }];
    return pts;
  }, [trimmed]);

  const final = points[points.length - 1]!.y;
  const ys = points.map((p) => p.y);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const pad = Math.max((yMax - yMin) * 0.12, 1);
  const domain: [number, number] = [yMin - (yMin < 0 ? pad : 0), yMax + pad];
  const lineColor = final >= 0 ? colors.positive : colors.negative;

  const labels = useMemo(() => {
    if (trimmed.length <= 5) return trimmed.map((d) => d.label);
    const step = (trimmed.length - 1) / 4;
    return Array.from({ length: 5 }, (_, i) => trimmed[Math.round(i * step)]!.label);
  }, [trimmed]);

  const columns = useMemo(
    () => trimmed.slice(-8).map((d) => ({ key: d.key, label: d.label, value: d.profitLoss })),
    [trimmed],
  );

  return (
    <StatCard
      icon={{ name: 'trending-up', tone: 'green' }}
      index={index}
      right={<MiniToggle onChange={setMode} options={[{ value: 'cumulative', label: 'Total' }, { value: 'buckets', label: 'Período' }]} value={mode} />}
      title="Evolução do lucro"
    >
      {mode === 'cumulative' ? (
        <View>
          <View style={[styles.pill, { backgroundColor: lineColor }]}>
            <Text style={styles.pillText}>{euros(final)}</Text>
          </View>
          <View style={styles.chart}>
            <CartesianChart<Datum, 'x', 'y'> data={points} domain={{ y: domain }} xKey="x" yKeys={['y']}>
              {({ points: p, chartBounds }) => {
                const range = domain[1] - domain[0] || 1;
                const zeroY = chartBounds.top + ((domain[1] - 0) / range) * (chartBounds.bottom - chartBounds.top);
                return (
                  <>
                    <SkiaLine color={colors.border} p1={{ x: chartBounds.left, y: zeroY }} p2={{ x: chartBounds.right, y: zeroY }} strokeWidth={1}>
                      <DashPathEffect intervals={[5, 5]} />
                    </SkiaLine>
                    <Area animate={{ duration: 700, type: 'timing' }} curveType="natural" points={p.y} y0={zeroY}>
                      <LinearGradient colors={[`${lineColor}66`, `${lineColor}00`]} end={vec(0, chartBounds.bottom)} start={vec(0, chartBounds.top)} />
                    </Area>
                    <Line animate={{ duration: 700, type: 'timing' }} color={lineColor} curveType="natural" points={p.y} strokeCap="round" strokeWidth={2.5} />
                  </>
                );
              }}
            </CartesianChart>
          </View>
          <View style={styles.axis}>
            {labels.map((l, i) => <Text key={i} style={[styles.axisText, { color: colors.textMuted }]}>{l}</Text>)}
          </View>
        </View>
      ) : (
        <ColumnChart format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v))} €`} items={columns} />
      )}
      {best !== undefined && worst !== undefined ? (
        <View style={styles.extremes}>
          <View style={[styles.extreme, { backgroundColor: colors.background }]}>
            <Text style={[styles.exLabel, { color: colors.textMuted }]}>Melhor boletim</Text>
            <Text style={[styles.exValue, { color: colors.positive }]}>{euros(best)}</Text>
          </View>
          <View style={[styles.extreme, { backgroundColor: colors.background }]}>
            <Text style={[styles.exLabel, { color: colors.textMuted }]}>Pior boletim</Text>
            <Text style={[styles.exValue, { color: colors.negative }]}>{euros(worst)}</Text>
          </View>
        </View>
      ) : null}
    </StatCard>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-end', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 12 },
  chart: { height: 160, marginTop: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  extremes: { flexDirection: 'row', gap: 8 },
  extreme: { borderRadius: 12, flex: 1, gap: 2, padding: 10 },
  exLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  exValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15 },
});
