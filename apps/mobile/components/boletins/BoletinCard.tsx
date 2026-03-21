import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BoletinDetail } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatOdds } from '../../utils/formatters';
import { StatusBadge } from './StatusBadge';
import { Button } from '../ui/Button';

interface BoletinCardProps {
  boletin: BoletinDetail;
  onPress?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
}

/** Summary card used on the user's boletin list. */
export function BoletinCard({ boletin, onPress, onDelete, onShare }: BoletinCardProps) {
  const { colors } = useTheme();
  const previewItems = boletin.items.slice(0, 3);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <StatusBadge status={boletin.status} />
        <Text style={[styles.date, { color: colors.textSecondary }]}>{formatLongDate(boletin.createdAt)}</Text>
      </View>

      <Text style={[styles.name, { color: colors.textPrimary }]}>
        {boletin.name || `Boletin com ${boletin.items.length} seleção${boletin.items.length === 1 ? '' : 'ões'}`}
      </Text>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Stake</Text>
          <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Odds</Text>
          <Text style={[styles.metricValue, { color: colors.gold }]}>{formatOdds(boletin.totalOdds)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Retorno</Text>
          <Text style={[styles.metricValue, { color: colors.primary }]}>
            {formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}
          </Text>
        </View>
      </View>

      <View style={styles.previewList}>
        {previewItems.map((item) => (
          <Text key={item.id} numberOfLines={1} style={[styles.previewLine, { color: colors.textSecondary }]}>
            {item.event.homeTeam} vs {item.event.awayTeam} • {item.selection} @ {formatOdds(item.oddValue)}
          </Text>
        ))}
        {boletin.items.length > 3 ? (
          <Text style={[styles.previewLine, { color: colors.textMuted }]}>+ {boletin.items.length - 3} mais</Text>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <Button
          leftSlot={<Ionicons color={colors.textPrimary} name="share-social-outline" size={16} />}
          onPress={onShare}
          size="sm"
          title="Partilhar"
          variant="secondary"
        />
        <Button
          leftSlot={<Ionicons color="#FFFFFF" name="trash-outline" size={16} />}
          onPress={onDelete}
          size="sm"
          title="Eliminar"
          variant="danger"
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  date: {
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  previewList: {
    gap: 6,
  },
  previewLine: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
});