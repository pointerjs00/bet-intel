import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { Pressable } from '../../ui/Pressable';
import { useTheme } from '../../../theme/useTheme';
import { formatCurrency } from '../../../utils/formatters';
import { hapticSelection } from '../../../utils/haptics';
import { StatCard } from './StatCard';

const PRESETS = [5, 10, 20, 50];
const KEY = 'stats:lastN';
const SETTLED = new Set<string>([BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.VOID, BoletinStatus.CASHOUT, BoletinStatus.PARTIAL]);

/** Profit of one settled boletim (freebet stakes are not the user's money). */
function profitOf(b: BoletinDetail): number {
  const stake = Number(b.stake);
  const ret = Number(b.actualReturn ?? (b.status === BoletinStatus.CASHOUT ? b.cashoutAmount ?? 0 : 0));
  return ret - (b.isFreebet ? 0 : stake);
}

interface LastNCardProps {
  boletins: BoletinDetail[];
  /** ROI of the selected period, to say whether the recent run is above or below it. */
  periodRoi: number;
  index?: number;
}

/**
 * "Últimas N apostas": the user picks how far back to look (presets 5/10/20/50 or any number with
 * the stepper; remembered between sessions). Shows each result as a cell, profit, hit rate and
 * return, compared with the period's return.
 */
export function LastNCard({ boletins, periodRoi, index }: LastNCardProps) {
  const { colors } = useTheme();
  const settled = useMemo(
    () => boletins
      .filter((b) => SETTLED.has(b.status))
      .sort((a, b) => new Date(b.betDate ?? b.createdAt).getTime() - new Date(a.betDate ?? a.createdAt).getTime()),
    [boletins],
  );
  const total = settled.length;
  const [n, setN] = useState(10);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v && Number(v) > 0) setN(Number(v)); }).catch(() => undefined);
  }, []);
  const choose = (v: number) => {
    const next = Math.max(1, Math.min(v, Math.max(total, 1)));
    hapticSelection();
    setN(next);
    AsyncStorage.setItem(KEY, String(next)).catch(() => undefined);
  };

  const effective = Math.min(n, total);
  const slice = settled.slice(0, effective);
  const stats = useMemo(() => {
    let profit = 0, staked = 0, won = 0, lost = 0;
    for (const b of slice) {
      profit += profitOf(b);
      staked += b.isFreebet ? 0 : Number(b.stake);
      if (b.status === BoletinStatus.WON || b.status === BoletinStatus.CASHOUT) won++;
      else if (b.status === BoletinStatus.LOST) lost++;
    }
    const decided = won + lost;
    return { profit, roi: staked > 0 ? (profit / staked) * 100 : 0, hit: decided > 0 ? (won / decided) * 100 : 0, won, lost };
  }, [slice]);

  const verdict = effective === 0
    ? 'Ainda sem apostas resolvidas.'
    : stats.roi > periodRoi + 5
      ? 'Acima da tua média: boa fase.'
      : stats.roi < periodRoi - 5
        ? 'Abaixo da tua média: fase fria.'
        : 'Em linha com a tua média.';
  // Oldest on the left, most recent on the right.
  const cells = [...slice].reverse();
  const cellSize = effective <= 10 ? 22 : effective <= 25 ? 14 : 9;

  return (
    <StatCard icon={{ name: 'pulse', tone: 'blue' }} index={index} subtitle={verdict} title={`Últimas ${effective} apostas`}>
      <View style={styles.controls}>
        {PRESETS.map((p) => {
          const active = n === p;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={p}
              onPress={() => choose(p)}
              style={[styles.chip, { backgroundColor: active ? `${colors.info}26` : colors.background, borderColor: active ? colors.info : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: active ? colors.info : colors.textSecondary }]}>{p}</Text>
            </Pressable>
          );
        })}
        <View style={[styles.stepper, { backgroundColor: colors.background }]}>
          <Pressable accessibilityLabel="Menos uma aposta" hitSlop={6} onLongPress={() => choose(n - 10)} onPress={() => choose(n - 1)} style={styles.stepBtn}>
            <Ionicons color={colors.textPrimary} name="remove" size={16} />
          </Pressable>
          <Text style={[styles.stepValue, { color: PRESETS.includes(n) ? colors.textSecondary : colors.info }]}>{n}</Text>
          <Pressable accessibilityLabel="Mais uma aposta" hitSlop={6} onLongPress={() => choose(n + 10)} onPress={() => choose(n + 1)} style={styles.stepBtn}>
            <Ionicons color={colors.textPrimary} name="add" size={16} />
          </Pressable>
        </View>
      </View>

      {effective > 0 ? (
        <>
          <Animated.View layout={LinearTransition.springify().damping(18)} style={styles.cells}>
            {cells.map((b, i) => {
              const p = profitOf(b);
              return (
                <Animated.View
                  entering={ZoomIn.delay(Math.min(i, 30) * 12).duration(180)}
                  key={b.id}
                  style={{ backgroundColor: p > 0 ? colors.positive : p < 0 ? colors.negative : colors.textMuted, borderRadius: cellSize / 3.5, height: cellSize, opacity: b.status === BoletinStatus.VOID ? 0.4 : 1, width: cellSize }}
                />
              );
            })}
          </Animated.View>
          <Animated.View entering={FadeIn.duration(200)} key={effective} style={styles.figures}>
            <View style={styles.figure}>
              <Text style={[styles.figLabel, { color: colors.textMuted }]}>Lucro</Text>
              <Text style={[styles.figValue, { color: stats.profit >= 0 ? colors.positive : colors.negative }]}>
                {stats.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(stats.profit))}
              </Text>
            </View>
            <View style={styles.figure}>
              <Text style={[styles.figLabel, { color: colors.textMuted }]}>Ganhos</Text>
              <Text style={[styles.figValue, { color: colors.textPrimary }]}>{stats.won}/{stats.won + stats.lost}</Text>
            </View>
            <View style={styles.figure}>
              <Text style={[styles.figLabel, { color: colors.textMuted }]}>Retorno</Text>
              <Text style={[styles.figValue, { color: stats.roi >= 0 ? colors.positive : colors.negative }]}>
                {stats.roi >= 0 ? '+' : '−'}{Math.abs(stats.roi).toFixed(0)}%
              </Text>
            </View>
          </Animated.View>
          {n > total ? <Text style={[styles.note, { color: colors.textMuted }]}>Só tens {total} apostas resolvidas.</Text> : null}
        </>
      ) : null}
    </StatCard>
  );
}

const styles = StyleSheet.create({
  controls: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 34, justifyContent: 'center', minWidth: 38, paddingHorizontal: 8 },
  chipText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stepper: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', height: 34, marginLeft: 'auto' },
  stepBtn: { alignItems: 'center', height: 34, justifyContent: 'center', width: 30 },
  stepValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, minWidth: 26, textAlign: 'center' },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  figures: { flexDirection: 'row' },
  figure: { flex: 1, gap: 2 },
  figLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  figValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  note: { fontSize: 12 },
});
