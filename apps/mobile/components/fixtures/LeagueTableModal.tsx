import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLeagueTable } from '../../services/teamStatsService';
import type { TeamStatData } from '../../services/teamStatsService';
import { useTheme } from '../../theme/useTheme';

interface Props {
  visible: boolean;
  competition: string;
  season?: string;
  highlightTeams?: string[];
  onClose: () => void;
}

// Longest token ≥4 chars for fuzzy highlight matching
function primaryToken(name: string): string {
  const tokens = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return tokens.sort((a, b) => b.length - a.length)[0] ?? name.toLowerCase();
}

function isHighlighted(statTeam: string, highlights: string[]): boolean {
  const statNorm = statTeam.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return highlights.some((h) => {
    const tok = primaryToken(h);
    return statNorm.includes(tok);
  });
}

type SortKey = 'default' | 'home' | 'away';

export function LeagueTableModal({ visible, competition, season = '2025-26', highlightTeams = [], onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sortKey, setSortKey] = React.useState<SortKey>('default');
  const tableQuery = useLeagueTable(competition, season);

  const rows = useMemo(() => {
    const data = tableQuery.data ?? [];
    if (sortKey === 'home') {
      return [...data].sort((a, b) => {
        const aPts = a.homeWon * 3 + a.homeDrawn;
        const bPts = b.homeWon * 3 + b.homeDrawn;
        return bPts - aPts || (b.homeGoalsFor - b.homeGoalsAgainst) - (a.homeGoalsFor - a.homeGoalsAgainst);
      }).map((r, i) => ({ ...r, displayPos: i + 1 }));
    }
    if (sortKey === 'away') {
      return [...data].sort((a, b) => {
        const aPts = a.awayWon * 3 + a.awayDrawn;
        const bPts = b.awayWon * 3 + b.awayDrawn;
        return bPts - aPts || (b.awayGoalsFor - b.awayGoalsAgainst) - (a.awayGoalsFor - a.awayGoalsAgainst);
      }).map((r, i) => ({ ...r, displayPos: i + 1 }));
    }
    return data.map((r) => ({ ...r, displayPos: r.position ?? 0 }));
  }, [tableQuery.data, sortKey]);

  const total = rows.length;

  function rowBg(pos: number): string | undefined {
    if (total < 6) return undefined;
    if (pos <= 4) return `${colors.primary}14`; // European zone
    if (pos >= total - 2) return '#ef444418'; // Relegation zone
    return undefined;
  }

  function renderRow({ item }: { item: TeamStatData & { displayPos: number } }) {
    const highlight = isHighlighted(item.team, highlightTeams);
    const bg = rowBg(item.displayPos);
    const gf = sortKey === 'home' ? item.homeGoalsFor : sortKey === 'away' ? item.awayGoalsFor : item.goalsFor;
    const ga = sortKey === 'home' ? item.homeGoalsAgainst : sortKey === 'away' ? item.awayGoalsAgainst : item.goalsAgainst;
    const w = sortKey === 'home' ? item.homeWon : sortKey === 'away' ? item.awayWon : item.won;
    const d = sortKey === 'home' ? item.homeDrawn : sortKey === 'away' ? item.awayDrawn : item.drawn;
    const l = sortKey === 'home' ? item.homeLost : sortKey === 'away' ? item.awayLost : item.lost;
    const pts = sortKey === 'home' ? w * 3 + d : sortKey === 'away' ? w * 3 + d : item.points;
    const p = sortKey === 'home' ? w + d + l : sortKey === 'away' ? w + d + l : item.played;

    return (
      <View style={[s.row, { borderBottomColor: colors.border }, bg ? { backgroundColor: bg } : undefined, highlight && { backgroundColor: `${colors.primary}22` }]}>
        <Text style={[s.pos, { color: highlight ? colors.primary : colors.textMuted }]}>{item.displayPos}</Text>
        {highlight && <View style={[s.highlightDot, { backgroundColor: colors.primary }]} />}
        <Text numberOfLines={1} style={[s.teamName, { color: highlight ? colors.primary : colors.textPrimary, fontWeight: highlight ? '800' : '600' }]}>
          {item.team}
        </Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{p}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{w}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{d}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{l}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{gf}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{ga}</Text>
        <Text style={[s.pts, { color: highlight ? colors.primary : colors.textPrimary }]}>{pts}</Text>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.title, { color: colors.textPrimary }]}>{competition}</Text>
            <Text style={[s.subtitle, { color: colors.textMuted }]}>{season}</Text>
          </View>
          <Pressable hitSlop={12} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Sort tabs */}
        <View style={[s.tabs, { borderBottomColor: colors.border }]}>
          {(['default', 'home', 'away'] as SortKey[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setSortKey(key)}
              style={[s.tab, sortKey === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[s.tabText, { color: sortKey === key ? colors.primary : colors.textMuted }]}>
                {key === 'default' ? 'Geral' : key === 'home' ? '🏠 Casa' : '✈️ Fora'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Column headers */}
        <View style={[s.colHeader, { borderBottomColor: colors.border }]}>
          <Text style={[s.pos, { color: colors.textMuted }]}>#</Text>
          <Text style={[s.teamName, { color: colors.textMuted }]}>Equipa</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>J</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>V</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>E</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>D</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>GM</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>GS</Text>
          <Text style={[s.pts, { color: colors.textMuted }]}>Pts</Text>
        </View>

        {tableQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={[s.empty, { color: colors.textMuted }]}>Sem dados disponíveis</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  tabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 10,
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  colHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pos: { fontSize: 12, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  highlightDot: { borderRadius: 3, height: 6, width: 6 },
  teamName: { flex: 1, fontSize: 13 },
  cell: { fontSize: 12, minWidth: 22, textAlign: 'center' },
  pts: { fontSize: 13, fontWeight: '800', minWidth: 28, textAlign: 'right' },
  empty: { fontSize: 14, marginTop: 40, textAlign: 'center' },
});
