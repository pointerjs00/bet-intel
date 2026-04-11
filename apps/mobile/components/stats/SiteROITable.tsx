import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StatsBySiteRow } from '@betintel/shared';
import { InfoButton } from '../ui/InfoButton';
import { SiteBreakdownLabel } from './BreakdownTable';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { BETTING_SITES } from '../../utils/sportAssets';

const MAX_ROWS = 6;

interface SiteROITableProps {
  rows: StatsBySiteRow[];
  onInfoPress?: () => void;
  onRowPress?: (row: StatsBySiteRow) => void;
}

export const SiteROITable = React.memo(function SiteROITable({ rows, onInfoPress, onRowPress }: SiteROITableProps) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);

  const siteLookup = React.useMemo(
    () => new Map(BETTING_SITES.map((site) => [site.slug, site])),
    [],
  );

  if (rows.length === 0) return null;

  const visibleRows = showAll ? rows : rows.slice(0, MAX_ROWS);
  const hasMore = rows.length > MAX_ROWS;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Title */}
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre a análise por casa de apostas" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Por casa de apostas</Text>
      </View>

      {/* Header */}
      <View style={[styles.headerRow, { borderColor: colors.border }]}>
        <Text style={[styles.headerCellLabel, { color: colors.textSecondary }]}>Casa</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>Bets</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>Win</Text>
        <Text style={[styles.headerCellValue, { color: colors.textSecondary }]}>ROI</Text>
        {onRowPress ? <View style={{ width: 18 }} /> : null}
      </View>

      {/* Rows */}
      {visibleRows.map((row) => {
        const site = siteLookup.get(row.siteSlug);
        const siteName = site?.name ?? (row.siteSlug === 'unknown' ? 'Outra casa' : row.label);
        const logo = site?.logo;

        const rowInner = (
          <View style={[styles.dataRow, { borderColor: colors.border }]}>
            <View style={styles.labelCell}>
              <SiteBreakdownLabel logo={logo} name={siteName} />
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatCurrency(row.totalStaked)}</Text>
            </View>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{row.totalBets}</Text>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatPercentage(row.winRate)}</Text>
            <Text style={[styles.value, { color: row.roi >= 0 ? colors.primary : colors.danger }]}>
              {formatPercentage(row.roi)}
            </Text>
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
            {showAll ? 'Ver menos' : `Ver mais (${rows.length - MAX_ROWS})`}
          </Text>
          <Ionicons color={colors.info} name={showAll ? 'chevron-up' : 'chevron-down'} size={14} />
        </Pressable>
      )}
    </View>
  );
});

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
    gap: 8,
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
});
