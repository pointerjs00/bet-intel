import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StatsBySportMarketCell } from '@betintel/shared';
import { Card } from '../ui/Card';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../../theme/useTheme';

interface SportMarketMatrixProps {
  cells: StatsBySportMarketCell[];
  onInfoPress?: () => void;
}

const SPORT_LABELS: Record<string, string> = {
  FOOTBALL: 'Futebol',
  BASKETBALL: 'Basquetebol',
  TENNIS: 'Ténis',
  HANDBALL: 'Andebol',
  VOLLEYBALL: 'Voleibol',
  HOCKEY: 'Hóquei',
  RUGBY: 'Râguebi',
  AMERICAN_FOOTBALL: 'F. Americano',
  BASEBALL: 'Basebol',
  OTHER: 'Outro',
};

function formatROI(roi: number): string {
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(0)}%`;
}

export const SportMarketMatrix = React.memo(function SportMarketMatrix({ cells, onInfoPress }: SportMarketMatrixProps) {
  const { colors, tokens } = useTheme();

  const { sports, markets, matrix } = useMemo(() => {
    if (cells.length === 0) return { sports: [], markets: [], matrix: new Map<string, StatsBySportMarketCell>() };

    const sportSet = new Set<string>();
    const marketSet = new Set<string>();
    const cellMap = new Map<string, StatsBySportMarketCell>();

    for (const cell of cells) {
      sportSet.add(cell.sport);
      marketSet.add(cell.market);
      cellMap.set(`${cell.sport}::${cell.market}`, cell);
    }

    // Sort sports by total bets (descending)
    const sportTotals = new Map<string, number>();
    for (const cell of cells) {
      sportTotals.set(cell.sport, (sportTotals.get(cell.sport) ?? 0) + cell.totalBets);
    }
    const sortedSports = Array.from(sportSet).sort((a, b) => (sportTotals.get(b) ?? 0) - (sportTotals.get(a) ?? 0));

    // Sort markets by total bets (descending)
    const marketTotals = new Map<string, number>();
    for (const cell of cells) {
      marketTotals.set(cell.market, (marketTotals.get(cell.market) ?? 0) + cell.totalBets);
    }
    const sortedMarkets = Array.from(marketSet).sort((a, b) => (marketTotals.get(b) ?? 0) - (marketTotals.get(a) ?? 0));

    return { sports: sortedSports, markets: sortedMarkets, matrix: cellMap };
  }, [cells]);

  if (cells.length === 0) return null;

  return (
    <Card style={styles.container}>
      <View style={styles.titleRow}>
        {onInfoPress ? (
          <InfoButton accessibilityLabel="Mais informação sobre desporto por mercado" onPress={onInfoPress} />
        ) : null}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Desporto × Mercado</Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        ROI por combinação (cor = performance)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row — market names */}
          <View style={styles.row}>
            <View style={[styles.headerCell, styles.sportCol]} />
            {markets.map((market) => (
              <View key={market} style={[styles.headerCell, styles.valueCol]}>
                <Text numberOfLines={2} style={[styles.headerText, { color: colors.textSecondary }]}>
                  {market}
                </Text>
              </View>
            ))}
          </View>

          {/* Data rows — one per sport */}
          {sports.map((sport) => (
            <View key={sport} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <View style={[styles.sportCol, styles.sportCell]}>
                <Text numberOfLines={1} style={[styles.sportText, { color: colors.textPrimary }]}>
                  {SPORT_LABELS[sport] ?? sport}
                </Text>
              </View>
              {markets.map((market) => {
                const cell = matrix.get(`${sport}::${market}`);
                if (!cell || cell.totalBets === 0) {
                  return (
                    <View key={market} style={[styles.valueCol, styles.emptyCell, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>—</Text>
                    </View>
                  );
                }

                const bgColor =
                  cell.roi > 10 ? `${colors.primary}30` :
                  cell.roi > 0 ? `${colors.primary}18` :
                  cell.roi < -10 ? `${colors.danger}30` :
                  cell.roi < 0 ? `${colors.danger}18` :
                  `${colors.warning}18`;

                return (
                  <View key={market} style={[styles.valueCol, styles.dataCell, { backgroundColor: bgColor }]}>
                    <Text style={[styles.roiText, { color: cell.roi >= 0 ? colors.primary : colors.danger }]}>
                      {formatROI(cell.roi)}
                    </Text>
                    <Text style={[styles.countText, { color: colors.textMuted }]}>
                      {cell.totalBets}ap · {cell.winRate.toFixed(0)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
});

const styles = StyleSheet.create({
  container: { gap: 10 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '900' },
  subtitle: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  headerCell: { justifyContent: 'flex-end', paddingBottom: 6, paddingHorizontal: 4 },
  sportCol: { width: 90 },
  valueCol: { width: 88, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  headerText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  sportCell: { justifyContent: 'center', paddingRight: 4 },
  sportText: { fontSize: 12, fontWeight: '800' },
  emptyCell: { borderRadius: 4, margin: 1 },
  emptyText: { fontSize: 11 },
  dataCell: { borderRadius: 4, margin: 1, gap: 2 },
  roiText: { fontSize: 13, fontWeight: '900' },
  countText: { fontSize: 9, fontWeight: '600' },
});
