import React, { useRef, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';

interface HeatmapCalendarProps {
  boletins: BoletinDetail[];
  onInfoPress?: () => void;
}

interface DayData {
  count: number;
  profitLoss: number;
}

const DAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // Mon-Sun in PT

function getDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseActualReturn(boletin: BoletinDetail): number {
  const stake = parseFloat(boletin.stake);
  if (boletin.status === 'WON') return parseFloat(boletin.actualReturn ?? boletin.potentialReturn) - stake;
  if (boletin.status === 'LOST') return -stake;
  if (boletin.status === 'CASHOUT') return parseFloat(boletin.cashoutAmount ?? boletin.stake) - stake;
  if (boletin.status === 'VOID' || boletin.status === 'PARTIAL') return 0;
  return 0; // PENDING
}

export const HeatmapCalendar = React.memo(function HeatmapCalendar({ boletins, onInfoPress }: HeatmapCalendarProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const { dayMap, weeks, monthLabels } = useMemo(() => {
    // Build map of date → { count, profitLoss } from settled boletins
    const map = new Map<string, DayData>();
    for (const b of boletins) {
      if (b.status === 'PENDING') continue;
      const date = new Date((b as any).betDate ?? b.createdAt);
      const key = getDateKey(date);
      const existing = map.get(key) ?? { count: 0, profitLoss: 0 };
      existing.count += 1;
      existing.profitLoss += parseActualReturn(b);
      map.set(key, existing);
    }

    // Build 26 weeks (≈6 months) grid ending at the end of the current week
    const today = new Date();
    const totalWeeks = 26;
    const grid: string[][] = [];
    const labels: Array<{ weekIndex: number; label: string }> = [];

    // Anchor to this week's Monday, then go back (totalWeeks-1) full weeks
    const endDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dayOfWeek = endDay.getUTCDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // currentWeekMonday = endDay minus days since Monday
    const currentWeekMonday = new Date(endDay);
    currentWeekMonday.setUTCDate(currentWeekMonday.getUTCDate() - mondayOffset);
    // Grid starts (totalWeeks-1) full weeks before this Monday
    const gridStart = new Date(currentWeekMonday);
    gridStart.setUTCDate(gridStart.getUTCDate() - (totalWeeks - 1) * 7);

    let lastMonth = -1;
    const cursor = new Date(gridStart);
    for (let w = 0; w < totalWeeks; w++) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) {
        const key = getDateKey(cursor);
        week.push(cursor <= today ? key : '');

        // Track month labels
        if (cursor.getUTCMonth() !== lastMonth && cursor <= today) {
          lastMonth = cursor.getUTCMonth();
          const monthName = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' }).format(cursor).replace('.', '');
          labels.push({ weekIndex: w, label: monthName });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      grid.push(week);
    }

    return { dayMap: map, weeks: grid, monthLabels: labels };
  }, [boletins]);

  const getCellColor = (key: string): string => {
    if (!key) return 'transparent';
    const data = dayMap.get(key);
    if (!data) return colors.surfaceRaised;
    if (data.profitLoss > 0) return colors.primary;
    if (data.profitLoss < 0) return colors.danger;
    return colors.warning; // break-even
  };

  const getCellOpacity = (key: string): number => {
    if (!key) return 0;
    const data = dayMap.get(key);
    if (!data) return 1;
    // Scale opacity by count (1 bet = 0.4, 5+ bets = 1.0)
    return Math.min(0.4 + data.count * 0.15, 1);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Frequência de apostas</Text>
        {onInfoPress ? (
          <Pressable hitSlop={8} onPress={onInfoPress}>
            <Ionicons color={colors.textMuted} name="information-circle-outline" size={18} />
          </Pressable>
        ) : null}
      </View>

      {/* Day labels */}
      <View style={styles.body}>
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={[styles.dayLabel, { color: colors.textMuted }]}>{label}</Text>
          ))}
        </View>

        <ScrollView
            ref={scrollRef}
            horizontal
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gridScroll}
          >
          {/* Month labels row */}
          <View>
            <View style={styles.monthRow}>
              {weeks.map((_, wi) => {
                const monthLabel = monthLabels.find((m) => m.weekIndex === wi);
                return (
                  <View key={wi} style={styles.monthCell}>
                    {monthLabel ? (
                      <Text style={[styles.monthLabel, { color: colors.textSecondary }]}>{monthLabel.label}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
              {weeks.map((week, wi) => (
                <View key={wi} style={styles.weekColumn}>
                  {week.map((key, di) => (
                    <View
                      key={`${wi}-${di}`}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: getCellColor(key),
                          opacity: getCellOpacity(key),
                        },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Lucro</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Prejuízo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Neutro</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.surfaceRaised }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Sem apostas</Text>
        </View>
      </View>
    </View>
  );
});

const CELL_SIZE = 14;
const CELL_GAP = 3;

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
  body: {
    flexDirection: 'row',
  },
  dayLabels: {
    marginRight: 6,
    paddingTop: 20, // aligns with grid below month labels
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
    height: CELL_SIZE + CELL_GAP,
    lineHeight: CELL_SIZE,
    textAlign: 'center',
    width: 14,
  },
  gridScroll: {
    flexDirection: 'row',
  },
  monthRow: {
    flexDirection: 'row',
    height: 16,
    marginBottom: 4,
  },
  monthCell: {
    width: CELL_SIZE + CELL_GAP,
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
  },
  weekColumn: {
    gap: CELL_GAP,
    marginRight: CELL_GAP,
  },
  cell: {
    borderRadius: 3,
    height: CELL_SIZE,
    width: CELL_SIZE,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    borderRadius: 3,
    height: 10,
    width: 10,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
