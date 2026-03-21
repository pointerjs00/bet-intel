import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ItemResult } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatOdds, formatShortDateTime } from '../../utils/formatters';

interface BoletinItemProps {
  item: {
    market: string;
    selection: string;
    oddValue: string;
    result: ItemResult;
    event: {
      league: string;
      homeTeam: string;
      awayTeam: string;
      eventDate: string;
    };
    site: {
      name: string;
    };
  };
  onRemove?: () => void;
}

/** Renders one selection row in builder and detail contexts. */
export function BoletinItem({ item, onRemove }: BoletinItemProps) {
  const { colors } = useTheme();
  const resultMeta = getResultMeta(item.result, colors);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
            {item.event.homeTeam} vs {item.event.awayTeam}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {item.event.league} • {formatShortDateTime(item.event.eventDate)}
          </Text>
        </View>

        {onRemove ? (
          <Pressable hitSlop={10} onPress={onRemove}>
            <Ionicons color={colors.danger} name="trash-outline" size={18} />
          </Pressable>
        ) : (
          <View style={[styles.resultIcon, { backgroundColor: resultMeta.background }]}>
            <Ionicons color={resultMeta.color} name={resultMeta.icon} size={14} />
          </View>
        )}
      </View>

      <View style={styles.footerRow}>
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Mercado</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
            {item.market} • {item.selection}
          </Text>
        </View>

        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Site</Text>
          <Text style={[styles.metaValue, { color: colors.textPrimary }]}>{item.site.name}</Text>
        </View>

        <View style={styles.metaBlockRight}>
          <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Odd</Text>
          <Text style={[styles.metaValue, { color: colors.gold }]}>{formatOdds(item.oddValue)}</Text>
        </View>
      </View>
    </View>
  );
}

function getResultMeta(result: ItemResult, colors: ReturnType<typeof useTheme>['colors']) {
  switch (result) {
    case ItemResult.WON:
      return { icon: 'checkmark', color: colors.primary, background: 'rgba(0, 200, 81, 0.12)' } as const;
    case ItemResult.LOST:
      return { icon: 'close', color: colors.danger, background: 'rgba(255, 59, 48, 0.12)' } as const;
    case ItemResult.VOID:
      return { icon: 'remove', color: colors.info, background: 'rgba(0, 122, 255, 0.12)' } as const;
    case ItemResult.PENDING:
    default:
      return { icon: 'time-outline', color: colors.warning, background: 'rgba(255, 149, 0, 0.12)' } as const;
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaBlock: {
    flex: 1,
    gap: 4,
  },
  metaBlockRight: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 64,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
});