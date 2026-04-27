import React, { useMemo, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSwipeToDismiss } from '../../hooks/useSwipeToDismiss';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { usePersonalStats } from '../../services/statsService';
import { useTheme } from '../../theme/useTheme';
import { formatLongDate } from '../../utils/formatters';
import {
  type ExplainBoletinData,
  type ExplainerVerdict,
  type StatExplanation,
  explainImpliedProbability,
  explainLegCount,
  explainMarketWinRate,
  explainOddsEfficiency,
  explainProfit,
  explainPotentialReturn,
  explainROI,
  explainTotalOdds,
} from '../../utils/statExplainers';

// ─── Stat key definitions ─────────────────────────────────────────────────────

type StatKey = 'roi' | 'totalOdds' | 'potentialReturn' | 'profit' | 'oddsEfficiency' | 'impliedProb' | 'legCount' | 'marketWinRate';

interface StatChip {
  key: StatKey;
  label: string;
  showFor: BoletinStatus[];
}

const STAT_CHIPS: StatChip[] = [
  { key: 'roi',           label: 'ROI',              showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT] },
  { key: 'totalOdds',     label: 'Odds Totais',      showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT, BoletinStatus.VOID] },
  { key: 'potentialReturn', label: 'Retorno',        showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT] },
  { key: 'profit',        label: 'Lucro/Prejuízo',   showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT] },
  { key: 'oddsEfficiency', label: 'Eficiência',      showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT] },
  { key: 'impliedProb',   label: 'Prob. Implícita',  showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT, BoletinStatus.VOID] },
  { key: 'legCount',      label: 'Seleções',         showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT, BoletinStatus.VOID] },
  { key: 'marketWinRate', label: 'Taxa Mercado',     showFor: [BoletinStatus.WON, BoletinStatus.LOST, BoletinStatus.CASHOUT, BoletinStatus.VOID] },
];

// ─── Verdict badge ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict, label, colors }: { verdict: ExplainerVerdict; label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (verdict === 'info-only' || !label) return null;
  const color = verdict === 'good' ? colors.primary : verdict === 'neutral' ? colors.warning : colors.danger;
  const icon = verdict === 'good' ? 'checkmark-circle' : verdict === 'neutral' ? 'remove-circle' : 'close-circle';
  return (
    <View style={[vbStyles.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[vbStyles.text, { color }]}>{label}</Text>
    </View>
  );
}
const vbStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5 },
  text: { fontSize: 13, fontWeight: '800' },
});

// ─── Explanation content ──────────────────────────────────────────────────────

function ExplanationPanel({ explanation, colors }: { explanation: StatExplanation; colors: ReturnType<typeof useTheme>['colors'] }) {
  const [showCalc, setShowCalc] = useState(false);

  return (
    <View style={panelStyles.wrap}>
      {/* Large stat value */}
      <Text style={[panelStyles.statValue, { color: colors.textPrimary }]}>{explanation.statValue}</Text>

      {/* Verdict */}
      <VerdictBadge verdict={explanation.verdict} label={explanation.verdictLabel} colors={colors} />

      {/* Plain explanation */}
      <Text style={[panelStyles.explanation, { color: colors.textSecondary }]}>
        {explanation.plainExplanation}
      </Text>

      {/* Collapsible calculation */}
      {explanation.calculationSteps ? (
        <View>
          <Pressable
            onPress={() => setShowCalc((v) => !v)}
            style={[panelStyles.calcToggle, { borderTopColor: colors.border }]}
          >
            <Ionicons name={showCalc ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
            <Text style={[panelStyles.calcToggleText, { color: colors.textMuted }]}>Como foi calculado?</Text>
          </Pressable>
          {showCalc && (
            <View style={[panelStyles.calcBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[panelStyles.calcText, { color: colors.textSecondary }]}>
                {explanation.calculationSteps}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const panelStyles = StyleSheet.create({
  wrap: { gap: 14 },
  statValue: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  explanation: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  calcToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  calcToggleText: { fontSize: 13, fontWeight: '600' },
  calcBox: { borderRadius: 10, borderWidth: 1, marginTop: 8, padding: 12 },
  calcText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 20 },
});

// ─── Main sheet ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  boletin: BoletinDetail;
  onClose: () => void;
}

export function ExplainBoletinSheet({ visible, boletin, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { panHandlers, animatedStyle } = useSwipeToDismiss(onClose, { visible });
  const statsQuery = usePersonalStats('all', [], undefined, undefined, visible);
  const [selectedStat, setSelectedStat] = useState<StatKey>('roi');

  const visibleChips = useMemo(
    () => STAT_CHIPS.filter((c) => c.showFor.includes(boletin.status)),
    [boletin.status],
  );

  // Ensure selected stat is always valid for the current boletin status
  const activeStat = visibleChips.some((c) => c.key === selectedStat) ? selectedStat : visibleChips[0]?.key ?? 'roi';

  // Build the ExplainBoletinData object from the boletin
  const explainData = useMemo((): ExplainBoletinData => {
    const stake = Number(boletin.stake);
    const totalOdds = Number(boletin.totalOdds);
    const potentialReturn = Number(boletin.potentialReturn);
    const actualReturn = boletin.actualReturn != null ? Number(boletin.actualReturn) : (boletin.status === BoletinStatus.WON ? potentialReturn : 0);
    const profit = actualReturn - stake;
    const roi = stake > 0 ? (profit / stake) * 100 : 0;
    const impliedProbability = totalOdds > 0 ? (1 / totalOdds) * 100 : 0;
    const oddsEfficiency = boletin.status !== BoletinStatus.VOID && potentialReturn > 0
      ? (actualReturn / potentialReturn) * 100
      : null;

    return {
      stake,
      totalOdds,
      potentialReturn,
      actualReturn,
      profit,
      roi,
      status: boletin.status,
      isFreebet: boletin.isFreebet,
      items: boletin.items.map((i) => ({ oddValue: Number(i.oddValue), market: i.market, result: i.result })),
      impliedProbability,
      oddsEfficiency,
      selectionCount: boletin.items.length,
      boletinName: boletin.name ?? null,
    };
  }, [boletin]);

  // Derive explanation for the active stat
  const explanation = useMemo((): StatExplanation => {
    const marketStats = statsQuery.data?.byMarket ?? [];
    switch (activeStat) {
      case 'roi':           return explainROI(explainData);
      case 'totalOdds':     return explainTotalOdds(explainData);
      case 'potentialReturn': return explainPotentialReturn(explainData);
      case 'profit':        return explainProfit(explainData);
      case 'oddsEfficiency': return explainOddsEfficiency(explainData);
      case 'impliedProb':   return explainImpliedProbability(explainData);
      case 'legCount':      return explainLegCount(explainData);
      case 'marketWinRate': return explainMarketWinRate(explainData, marketStats);
    }
  }, [activeStat, explainData, statsQuery.data]);

  const boletinLabel = boletin.name ?? `Boletim de ${formatLongDate(boletin.betDate ?? boletin.createdAt)}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tap-outside to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }, animatedStyle]}>
        {/* Drag handle */}
        <View {...panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="search" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Explica-me esta aposta</Text>
            <Text numberOfLines={1} style={[styles.headerSub, { color: colors.textMuted }]}>{boletinLabel}</Text>
          </View>
          <Pressable hitSlop={12} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Stat chip selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {visibleChips.map((chip) => {
            const active = chip.key === activeStat;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setSelectedStat(chip.key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceRaised,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Explanation content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <ExplanationPanel key={activeStat} explanation={explanation} colors={colors} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
    flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 4,
  },
});
