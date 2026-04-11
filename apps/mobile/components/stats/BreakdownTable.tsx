import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsBreakdownRow } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface BreakdownTableProps<TRow extends StatsBreakdownRow> {
  title: string;
  rows: TRow[];
  maxRows?: number;
  renderLabel?: (row: TRow) => React.ReactNode;
  onRowPress?: (row: TRow) => void;
  onInfoPress?: () => void;
  /** When true, label text uses numberOfLines={2} so full market names are visible. */
  expandLabels?: boolean;
}

/** Generic table for sport, site, and market breakdowns. */
export const BreakdownTable = React.memo(function BreakdownTable<TRow extends StatsBreakdownRow>({
  title,
  rows,
  maxRows = 6,
  renderLabel,
  onRowPress,
  onInfoPress,
  expandLabels,
}: BreakdownTableProps<TRow>) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.headerRow, { borderColor: colors.border }]}> 
        <Text style={[styles.headerCellLabel, { color: colors.textSecondary }]}>Grupo</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>Bets</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>Win</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>ROI</Text>
        {onRowPress ? <View style={{ width: 18 }} /> : null}
      </View>

      {visibleRows.map((row) => {
        const rowInner = (
          <View style={[styles.dataRow, { borderColor: colors.border }]}>
            <View style={styles.labelCell}>
              {renderLabel ? (
                renderLabel(row)
              ) : (
                <Text numberOfLines={expandLabels ? 2 : 1} style={[styles.label, { color: colors.textPrimary }]}>
                  {row.label}
                </Text>
              )}
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatCurrency(row.totalStaked)}</Text>
            </View>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{row.totalBets}</Text>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatPercentage(row.winRate)}</Text>
            <Text style={[styles.value, { color: row.roi >= 0 ? colors.primary : colors.danger }]}>{formatPercentage(row.roi)}</Text>
            {onRowPress ? (
              <View style={styles.chevronCell}>
                <Ionicons color={colors.textMuted} name="chevron-forward" size={14} />
              </View>
            ) : null}
          </View>
        );

        if (onRowPress) {
          return (
            <Pressable
              key={row.key}
              onPress={() => onRowPress(row)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              {rowInner}
            </Pressable>
          );
        }

        return React.cloneElement(rowInner, { key: row.key });
      })}

      {hasMore && (
        <Pressable onPress={() => setShowAll((v) => !v)} style={styles.showMoreBtn}>
          <Text style={[styles.showMoreText, { color: colors.info }]}>
            {showAll ? 'Ver menos' : `Ver mais (${rows.length - maxRows})`}
          </Text>
          <Ionicons color={colors.info} name={showAll ? 'chevron-up' : 'chevron-down'} size={14} />
        </Pressable>
      )}
    </View>
  );
}) as <TRow extends StatsBreakdownRow>(props: BreakdownTableProps<TRow>) => React.ReactElement;

interface SiteBreakdownLabelProps {
  name: string;
  logo?: ImageSourcePropType | null;
}

/** Compact site label with optional logo fallback for site breakdown tables. */
export function SiteBreakdownLabel({ name, logo }: SiteBreakdownLabelProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.siteLabelWrap}>
      {logo ? (
        <Image source={logo} style={styles.siteLogo} />
      ) : (
        <View style={[styles.siteFallback, { backgroundColor: colors.primary }]}>
          <Text style={styles.siteFallbackText}>{name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <Text numberOfLines={1} style={[styles.label, { color: colors.textPrimary }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  headerRow: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingBottom: 10,
  },
  headerCellLabel: {
    flex: 1.7,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerCellValue: {
    flex: 0.8,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  dataRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingBottom: 10,
    paddingTop: 2,
  },
  labelCell: {
    flex: 1.7,
    gap: 3,
    paddingRight: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
  },
  value: {
    flex: 0.8,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  chevronCell: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
  },
  showMoreBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingTop: 4,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
  siteLabelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  siteLogo: {
    borderRadius: 8,
    height: 22,
    width: 22,
  },
  siteFallback: {
    alignItems: 'center',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  siteFallbackText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});