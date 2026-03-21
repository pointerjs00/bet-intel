import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import type { OddsEvent, OddsRow } from '../../services/oddsService';
import { OddsCell } from './OddsCell';
import { SiteLogoChip } from './SiteLogoChip';
import { LiveBadge } from './LiveBadge';

interface OddsCardProps {
  event: OddsEvent;
  onPress?: () => void;
  onAddPress?: () => void;
}

interface SiteMarketRow {
  site: OddsRow['site'];
  selections: Partial<Record<'1' | 'X' | '2', OddsRow>>;
}

export function OddsCard({ event, onPress, onAddPress }: OddsCardProps) {
  const { colors, tokens } = useTheme();

  const marketRows = useMemo(() => {
    const rows = new Map<string, SiteMarketRow>();

    event.odds
      .filter((odd) => odd.market === '1X2')
      .forEach((odd) => {
        const key = odd.site.id;
        const row = rows.get(key) ?? {
          site: odd.site,
          selections: {},
        };

        if (odd.selection === '1' || odd.selection === 'X' || odd.selection === '2') {
          row.selections[odd.selection] = odd;
        }

        rows.set(key, row);
      });

    return Array.from(rows.values());
  }, [event.odds]);

  const bestBySelection = useMemo(() => {
    const result: Record<'1' | 'X' | '2', number> = { '1': 0, X: 0, '2': 0 };
    marketRows.forEach((row) => {
      (['1', 'X', '2'] as const).forEach((selection) => {
        const oddValue = Number(row.selections[selection]?.value ?? 0);
        if (oddValue > result[selection]) result[selection] = oddValue;
      });
    });
    return result;
  }, [marketRows]);

  return (
    <Pressable
      onLongPress={onAddPress}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.textPrimary,
          padding: tokens.spacing.lg,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.league, { color: colors.textSecondary }]}>{event.league}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{event.homeTeam} vs {event.awayTeam}</Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{formatEventDate(event.eventDate)}</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={onAddPress}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <Ionicons color="#FFFFFF" name="add" size={18} />
        </Pressable>
      </View>

      {event.status === 'LIVE' ? (
        <View style={styles.liveRow}>
          <LiveBadge />
          <Text style={[styles.score, { color: colors.textPrimary }]}>
            {event.homeScore ?? 0} - {event.awayScore ?? 0}
          </Text>
        </View>
      ) : null}

      <View style={[styles.headerRow, { borderColor: colors.border }]}> 
        <Text style={[styles.headerCellSite, { color: colors.textMuted }]}>Site</Text>
        <Text style={[styles.headerCellMarket, { color: colors.textMuted }]}>1X2</Text>
        <View style={styles.headerOddsLabels}>
          <Text style={[styles.headerOddsLabel, { color: colors.textMuted }]}>1</Text>
          <Text style={[styles.headerOddsLabel, { color: colors.textMuted }]}>X</Text>
          <Text style={[styles.headerOddsLabel, { color: colors.textMuted }]}>2</Text>
        </View>
      </View>

      <FlatList
        data={marketRows}
        keyExtractor={(item) => item.site.id}
        renderItem={({ item }) => (
          <View style={[styles.marketRow, { borderColor: colors.border }]}> 
            <View style={styles.siteCell}>
              <SiteLogoChip compact logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
            </View>
            <Text style={[styles.marketCell, { color: colors.textSecondary }]}>1X2</Text>
            <View style={styles.oddsRow}>
              {(['1', 'X', '2'] as const).map((selection) => {
                const odd = item.selections[selection];
                return odd ? (
                  <OddsCell
                    eventId={event.id}
                    key={`${item.site.id}-${selection}`}
                    highlight={Number(odd.value) === bestBySelection[selection] && bestBySelection[selection] > 0}
                    market={odd.market}
                    oddSelection={odd.selection}
                    selection={selection}
                    siteId={odd.site.id}
                    value={odd.value}
                  />
                ) : (
                  <View
                    key={`${item.site.id}-${selection}`}
                    style={[styles.emptyCell, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  >
                    <Text style={[styles.emptyCellText, { color: colors.textMuted }]}>-</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        scrollEnabled={false}
      />
    </Pressable>
  );
}

function formatEventDate(date: string) {
  const parsed = new Date(date);
  return parsed.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  league: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  date: {
    fontSize: 13,
    fontWeight: '500',
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  liveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  score: {
    fontSize: 14,
    fontWeight: '800',
  },
  headerRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingBottom: 8,
  },
  headerCellSite: {
    flex: 1.2,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerCellMarket: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    width: 40,
  },
  headerOddsLabels: {
    flex: 1.8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  headerOddsLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: 64,
  },
  marketRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  siteCell: {
    flex: 1.2,
  },
  marketCell: {
    fontSize: 12,
    fontWeight: '700',
    width: 40,
  },
  oddsRow: {
    flex: 1.8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  emptyCell: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 64,
  },
  emptyCellText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
