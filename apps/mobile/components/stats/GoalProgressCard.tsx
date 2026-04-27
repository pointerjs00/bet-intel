import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BettingGoal, GoalType } from '@betintel/shared';
import { usePersonalStats } from '../../services/statsService';
import { useMeProfile } from '../../services/socialService';
import { useTheme } from '../../theme/useTheme';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

// ─── Goal config ──────────────────────────────────────────────────────────────

const GOAL_META: Record<GoalType, {
  label: string;
  unit: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  isLimit: boolean;
  format: (v: number) => string;
}> = {
  [GoalType.ROI]: {
    label: 'ROI',
    unit: '%',
    icon: 'trending-up-outline',
    isLimit: false,
    format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
  },
  [GoalType.WIN_RATE]: {
    label: 'Taxa de vitória',
    unit: '%',
    icon: 'trophy-outline',
    isLimit: false,
    format: (v) => `${v.toFixed(0)}%`,
  },
  [GoalType.PROFIT]: {
    label: 'Lucro',
    unit: '€',
    icon: 'cash-outline',
    isLimit: false,
    format: (v) => formatCurrency(v),
  },
  [GoalType.BET_COUNT]: {
    label: 'Máx. apostas',
    unit: '',
    icon: 'layers-outline',
    isLimit: true,
    format: (v) => String(Math.round(v)),
  },
};

// ─── Progress computation ─────────────────────────────────────────────────────

function computeProgress(goal: BettingGoal, current: number): number {
  const meta = GOAL_META[goal.type];
  if (goal.target === 0) return 0;
  if (meta.isLimit) {
    // For BET_COUNT: progress shows how close you are to the limit
    return Math.min(100, (current / goal.target) * 100);
  }
  // For positive goals: handle negative current values gracefully
  if (goal.target > 0) return Math.max(0, Math.min(100, (current / goal.target) * 100));
  // For negative targets (e.g. "limit loss to -€50"): goal.target < 0
  if (goal.target < 0) return Math.max(0, Math.min(100, (current / goal.target) * 100));
  return 0;
}

function progressColor(
  goal: BettingGoal,
  progress: number,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  const meta = GOAL_META[goal.type];
  if (meta.isLimit) {
    // limit: green = well within, amber = approaching, red = exceeded
    if (progress <= 70) return colors.primary;
    if (progress <= 90) return colors.warning;
    return colors.danger;
  }
  // target: green = on track, amber = close, red = behind
  if (progress >= 80) return colors.primary;
  if (progress >= 45) return colors.warning;
  return colors.danger;
}

// ─── GoalRow ─────────────────────────────────────────────────────────────────

function GoalRow({
  goal,
  current,
}: {
  goal: BettingGoal;
  current: number;
}) {
  const { colors } = useTheme();
  const meta = GOAL_META[goal.type];
  const progress = computeProgress(goal, current);
  const barColor = progressColor(goal, progress, colors);
  const isExceeded = meta.isLimit && progress > 100;
  const isMet = !meta.isLimit && progress >= 100;

  return (
    <View style={[styles.goalRow, { borderTopColor: colors.border }]}>
      <View style={styles.goalHeader}>
        <View style={styles.goalTitleRow}>
          <Ionicons name={meta.icon} size={14} color={barColor} />
          <Text style={[styles.goalLabel, { color: colors.textPrimary }]}>{meta.label}</Text>
          {isMet && <Ionicons name="checkmark-circle" size={14} color={colors.primary} />}
          {isExceeded && <Ionicons name="alert-circle" size={14} color={colors.danger} />}
        </View>
        <View style={styles.goalValues}>
          <Text style={[styles.goalCurrent, { color: barColor }]}>{meta.format(current)}</Text>
          <Text style={[styles.goalSeparator, { color: colors.textMuted }]}>/</Text>
          <Text style={[styles.goalTarget, { color: colors.textMuted }]}>
            {meta.isLimit ? `máx. ${meta.format(goal.target)}` : `obj. ${meta.format(goal.target)}`}
          </Text>
        </View>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: barColor,
              width: `${Math.min(progress, 100)}%` as unknown as number,
            },
          ]}
        />
      </View>

      <Text style={[styles.progressPct, { color: colors.textMuted }]}>
        {isExceeded
          ? `+${(progress - 100).toFixed(0)}% acima do limite`
          : isMet
            ? 'Objetivo atingido'
            : `${progress.toFixed(0)}%`}
      </Text>
    </View>
  );
}

// ─── GoalProgressCard ─────────────────────────────────────────────────────────

export function GoalProgressCard({ onInfoPress }: { onInfoPress?: () => void }) {
  const { colors } = useTheme();
  const profileQuery = useMeProfile();
  const statsQuery = usePersonalStats('month', []);

  const goals = (profileQuery.data?.goals ?? []).filter((g) => g.enabled);

  if (goals.length === 0) return null;

  const summary = statsQuery.data?.summary;

  function currentValue(type: GoalType): number {
    if (!summary) return 0;
    switch (type) {
      case GoalType.ROI: return summary.roi;
      case GoalType.WIN_RATE: return summary.winRate;
      case GoalType.PROFIT: return summary.profitLoss;
      case GoalType.BET_COUNT: return summary.totalBoletins;
    }
  }

  return (
    <Animated.View entering={FadeInDown.delay(30).duration(160).springify()}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="flag-outline" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Objetivos de Este Mês</Text>
          </View>
          {onInfoPress && (
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} onPress={onInfoPress} />
          )}
        </View>

        {statsQuery.isLoading || !summary ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Skeleton height={52} width="100%" borderRadius={8} />
            <Skeleton height={52} width="100%" borderRadius={8} />
          </View>
        ) : (
          goals.map((goal) => (
            <GoalRow key={goal.type} goal={goal} current={currentValue(goal.type)} />
          ))
        )}
      </Card>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: { gap: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },

  goalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8, gap: 6 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  goalLabel: { fontSize: 13, fontWeight: '700' },
  goalValues: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalCurrent: { fontSize: 14, fontWeight: '800' },
  goalSeparator: { fontSize: 12 },
  goalTarget: { fontSize: 12, fontWeight: '600' },

  barTrack: { height: 6, borderRadius: 999, overflow: 'hidden', width: '100%' },
  barFill: { height: 6, borderRadius: 999 },
  progressPct: { fontSize: 11, fontWeight: '600' },
});
