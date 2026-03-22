import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import type { OddsEvent, OddsRow } from '../../services/oddsService';
import { OddsCell } from './OddsCell';
import { SiteLogoChip } from './SiteLogoChip';
import { LiveBadge } from './LiveBadge';
import { addSocketListener, subscribeToEvent, unsubscribeFromEvent } from '../../services/socketService';
import type { EventStatusChangePayload } from '@betintel/shared';

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

  // Real-time score + status tracking via WebSocket
  const [liveStatus, setLiveStatus] = useState(event.status);
  const [liveHomeScore, setLiveHomeScore] = useState(event.homeScore);
  const [liveAwayScore, setLiveAwayScore] = useState(event.awayScore);

  useEffect(() => {
    setLiveStatus(event.status);
    setLiveHomeScore(event.homeScore);
    setLiveAwayScore(event.awayScore);
  }, [event.status, event.homeScore, event.awayScore]);

  useEffect(() => {
    subscribeToEvent(event.id);

    const removeListener = addSocketListener('event:statusChange', (payload: EventStatusChangePayload) => {
      if (payload.eventId !== event.id) return;
      setLiveStatus(payload.status);
      if (payload.homeScore != null) setLiveHomeScore(payload.homeScore);
      if (payload.awayScore != null) setLiveAwayScore(payload.awayScore);
    });

    return () => {
      removeListener();
      unsubscribeFromEvent(event.id);
    };
  }, [event.id]);

  const isLive = liveStatus === 'LIVE';

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

  const sportEmoji = getSportEmoji(event.sport);

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
      {/* Top row: sport + league tag, live badge, add button */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={[styles.sportTag, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={styles.sportEmoji}>{sportEmoji}</Text>
            <Text style={[styles.league, { color: colors.textSecondary }]}>{event.league}</Text>
          </View>
          {isLive ? <LiveBadge /> : null}
        </View>
        <Pressable
          hitSlop={10}
          onPress={onAddPress}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <MaterialCommunityIcons color="#FFFFFF" name="plus" size={18} />
        </Pressable>
      </View>

      {/* Match title + score or date */}
      <View style={styles.matchInfo}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {event.homeTeam} vs {event.awayTeam}
        </Text>
        {isLive ? (
          <Text style={[styles.liveScore, { color: colors.primary }]}>
            {liveHomeScore != null && liveAwayScore != null
              ? `${liveHomeScore} – ${liveAwayScore}`
              : 'Ao vivo'}
          </Text>
        ) : (
          <Text style={[styles.date, { color: colors.textMuted }]}>{formatEventDate(event.eventDate)}</Text>
        )}
      </View>

      {/* Odds rows — one per site, no header */}
      <View style={styles.oddsSection}>
        {marketRows.map((row) => (
          <View key={row.site.id} style={styles.siteRow}>
            <SiteLogoChip compact logoUrl={row.site.logoUrl} name={row.site.name} slug={row.site.slug} />
            <View style={styles.oddsGroup}>
              {(['1', 'X', '2'] as const).map((selection) => {
                const odd = row.selections[selection];
                return odd ? (
                  <OddsCell
                    eventId={event.id}
                    key={`${row.site.id}-${selection}`}
                    highlight={Number(odd.value) === bestBySelection[selection] && bestBySelection[selection] > 0}
                    market={odd.market}
                    oddSelection={odd.selection}
                    selection={selection}
                    siteId={odd.site.id}
                    value={odd.value}
                  />
                ) : (
                  <View
                    key={`${row.site.id}-${selection}`}
                    style={[styles.emptyCell, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  >
                    <Text style={[styles.emptyCellText, { color: colors.textMuted }]}>–</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function getSportEmoji(sport: string): string {
  switch (sport) {
    case 'FOOTBALL': return '⚽';
    case 'BASKETBALL': return '🏀';
    case 'TENNIS': return '🎾';
    case 'VOLLEYBALL': return '🏐';
    case 'HANDBALL': return '🤾';
    case 'HOCKEY': return '🏒';
    case 'RUGBY': return '🏉';
    case 'AMERICAN_FOOTBALL': return '🏈';
    case 'BASEBALL': return '⚾';
    default: return '🏅';
  }
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
    gap: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 8,
  },
  sportTag: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sportEmoji: {
    fontSize: 13,
  },
  league: {
    fontSize: 12,
    fontWeight: '700',
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  matchInfo: {
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  liveScore: {
    fontSize: 15,
    fontWeight: '800',
  },
  date: {
    fontSize: 13,
    fontWeight: '500',
  },
  oddsSection: {
    gap: 10,
  },
  siteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  oddsGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  emptyCell: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 60,
  },
  emptyCellText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
