import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { BoletinDetail, ItemResult } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { TeamBadge } from '../ui/TeamBadge';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatOdds } from '../../utils/formatters';
import { StatusBadge } from './StatusBadge';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface BoletinCardProps {
  boletin: BoletinDetail;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
}

function statusAccentColor(status: BoletinStatus): string {
  switch (status) {
    case BoletinStatus.WON:     return '#00C851';
    case BoletinStatus.LOST:    return '#FF3B30';
    case BoletinStatus.CASHOUT: return '#FFD700';
    case BoletinStatus.VOID:
    case BoletinStatus.PARTIAL: return '#A0A0A0';
    default:                    return '#FF9500'; // PENDING
  }
}

function itemResultIcon(result: ItemResult): { name: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  switch (result) {
    case 'WON': return { name: 'checkmark-circle', color: '#00C851' };
    case 'LOST': return { name: 'close-circle', color: '#FF3B30' };
    case 'VOID': return { name: 'remove-circle', color: '#A0A0A0' };
    default: return { name: 'time-outline', color: '#FF9500' };
  }
}

/** Summary card used on the user's boletin list. */
export function BoletinCard({ boletin, onPress, onDelete, onShare }: BoletinCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const chevronRotation = useSharedValue(0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    chevronRotation.value = withTiming(expanded ? 0 : 180, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
    setExpanded((prev) => !prev);
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Status accent stripe */}
      <View
        style={[
          styles.statusStripe,
          { backgroundColor: statusAccentColor(boletin.status) },
        ]}
      />
      {/* Header row */}
      <View style={styles.headerRow}>
        <StatusBadge status={boletin.status} />
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatLongDate(boletin.betDate ?? boletin.createdAt)}
        </Text>
      </View>

      {/* Name */}
      <Text style={[styles.name, { color: colors.textPrimary }]}>
        {boletin.name || `Boletim com ${boletin.items.length} seleç${boletin.items.length === 1 ? 'ão' : 'ões'}`}
      </Text>

      {/* Metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💰 Stake</Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>🎯 Odds</Text>
          <Text style={[styles.metricValue, { color: colors.gold }]}>{formatOdds(boletin.totalOdds)}</Text>
        </View>
        {boletin.status === BoletinStatus.LOST ? (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>📉 Perdido</Text>
            <Text style={[styles.metricValue, { color: colors.danger }]}>
              -{formatCurrency(boletin.stake)}
            </Text>
          </View>
        ) : boletin.status === BoletinStatus.CASHOUT ? (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💵 Cashout</Text>
            <Text style={[styles.metricValue, { color: colors.gold }]}>
              {formatCurrency(boletin.cashoutAmount ?? boletin.actualReturn ?? '0')}
            </Text>
          </View>
        ) : (
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>💸 Retorno</Text>
            <Text style={[styles.metricValue, { color: colors.primary }]}>
              {formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}
            </Text>
          </View>
        )}
      </View>

      {/* Collapsed preview (always shown, up to 3 items) */}
      {!expanded ? (
        <View style={styles.previewList}>
          {boletin.items.slice(0, 3).map((item) => {
            const icon = itemResultIcon(item.result);
            return (
              <View key={item.id} style={styles.previewRow}>
                <View style={[styles.resultDot, { backgroundColor: icon.color }]} />
                <TeamBadge name={item.homeTeam} size={13} />
                <Text numberOfLines={1} style={[styles.previewTeamName, { color: colors.textSecondary }]}>
                  {item.homeTeam}
                </Text>
                <Text style={[styles.previewVs, { color: colors.textMuted }]}>vs</Text>
                <Text numberOfLines={1} style={[styles.previewTeamNameAway, { color: colors.textSecondary }]}>
                  {item.awayTeam}
                </Text>
                <TeamBadge name={item.awayTeam} size={13} />
                <Text style={[styles.previewMeta, { color: colors.textMuted }]}>
                  {'• '}{item.selection} @ {formatOdds(item.oddValue)}
                </Text>
              </View>
            );
          })}
          {boletin.items.length > 3 ? (
            <Text style={[styles.previewMore, { color: colors.textMuted }]}>
              + {boletin.items.length - 3} mais
            </Text>
          ) : null}
        </View>
      ) : (
        /* Expanded: all items with full detail */
        <View style={styles.expandedList}>
          {boletin.items.map((item) => {
            const icon = itemResultIcon(item.result);
            return (
              <View
                key={item.id}
                style={[
                  styles.expandedItem,
                  {
                    backgroundColor: `${icon.color}10`,
                    borderColor: colors.border,
                    borderLeftColor: icon.color,
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <View style={styles.expandedItemTop}>
                  <Ionicons color={icon.color} name={icon.name} size={16} />
                  <View style={styles.expandedTeams}>
                    <TeamBadge name={item.homeTeam} size={14} />
                    <Text numberOfLines={1} style={[styles.expandedTeamText, { color: colors.textPrimary }]}>
                      {item.homeTeam}
                    </Text>
                    <Text style={[styles.expandedVs, { color: colors.textMuted }]}>vs</Text>
                    <Text numberOfLines={1} style={[styles.expandedTeamText, { color: colors.textPrimary }]}>
                      {item.awayTeam}
                    </Text>
                    <TeamBadge name={item.awayTeam} size={14} />
                  </View>
                  <Text style={[styles.expandedOdd, { color: colors.gold }]}>
                    {formatOdds(item.oddValue)}
                  </Text>
                </View>
                <View style={styles.expandedMetaRow}>
                  <CompetitionBadge name={item.competition} size={13} />
                  <Text numberOfLines={1} style={[styles.expandedMeta, { color: colors.textMuted, flex: 1 }]}>
                    {item.competition} • {item.market} • {item.selection}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Action + expand row */}
      <View style={styles.actionRow}>
        {/* Icon-only action buttons */}
        <View style={styles.iconActions}>
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); onShare?.(); }}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <Ionicons color={colors.textSecondary} name="share-social-outline" size={17} />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); onDelete?.(); }}
            style={[styles.iconBtn, { backgroundColor: 'rgba(255,59,48,0.10)', borderColor: 'rgba(255,59,48,0.25)' }]}
          >
            <Ionicons color="#FF3B30" name="trash-outline" size={17} />
          </Pressable>
        </View>

        {/* Expand/collapse chevron */}
        <Pressable
          hitSlop={10}
          onPress={(e) => { e.stopPropagation(); toggleExpand(); }}
          style={[styles.expandBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <Text style={[styles.expandBtnLabel, { color: colors.textSecondary }]}>
            {expanded ? 'Fechar' : `Ver Detalhes`}
          </Text>
          <Animated.View style={chevronStyle}>
            <Ionicons color={colors.textSecondary} name="chevron-down" size={16} />
          </Animated.View>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
  },
  statusStripe: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  date: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '900', lineHeight: 26 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  metricValue: { fontSize: 14, fontWeight: '800' },
  resultDot: { borderRadius: 4, flexShrink: 0, height: 8, width: 8 },
  previewList: { gap: 6 },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  previewTeamName: { flexShrink: 1, fontSize: 12, fontWeight: '600', minWidth: 0 },
  previewVs: { flexShrink: 0, fontSize: 11, fontWeight: '500', paddingHorizontal: 1 },
  previewTeamNameAway: { flexShrink: 1, fontSize: 12, fontWeight: '600', minWidth: 0 },
  previewMeta: { flexShrink: 0, fontSize: 12, fontWeight: '600' },
  previewMore: { fontSize: 12, fontWeight: '600' },
  expandedList: { gap: 8 },
  expandedItem: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  expandedItemTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  expandedTeams: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4 },
  expandedTeamText: { flexShrink: 1, fontSize: 12, fontWeight: '700', minWidth: 0 },
  expandedVs: { fontSize: 11, fontWeight: '500' },
  expandedOdd: { fontSize: 13, fontWeight: '800', marginLeft: 'auto' },
  expandedMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginLeft: 22 },
  expandedMeta: { fontSize: 11, fontWeight: '500' },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  iconActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  expandBtn: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  expandBtnLabel: { fontSize: 13, fontWeight: '600' },
});