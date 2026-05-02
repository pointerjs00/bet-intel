import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

// Zone config — adjust thresholds to match competition rules
interface ZoneConfig {
  /** inclusive range of positions [from, to] */
  positions: [number, number];
  color: string;
  label: string;
  icon: string;
}

const DEFAULT_ZONES: ZoneConfig[] = [
  { positions: [1, 1], color: '#22c55e', label: 'Champions League', icon: '🏆' },
  { positions: [2, 3], color: '#3b82f6', label: 'Champions League (qualificação)', icon: '🏆' },
  { positions: [4, 4], color: '#06b6d4', label: 'UEFA Europa League', icon: '🌍' },
  { positions: [5, 5], color: '#8b5cf6', label: 'UEFA Conference League', icon: '🌐' },
];

const RELEGATION_ZONE_FROM_BOTTOM = 3; // last 3 positions = relegation

function getZone(pos: number, total: number, zones: ZoneConfig[]): ZoneConfig | null {
  // Check relegation first (from the bottom)
  if (pos > total - RELEGATION_ZONE_FROM_BOTTOM) {
    return { positions: [pos, pos], color: '#ef4444', label: 'Descida de divisão', icon: '⬇️' };
  }
  return zones.find((z) => pos >= z.positions[0] && pos <= z.positions[1]) ?? null;
}

// Fuzzy highlight matching (unchanged from original)
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

export function LeagueTableModal({
  visible,
  competition,
  season = '2025-26',
  highlightTeams = [],
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sortKey, setSortKey] = React.useState<SortKey>('default');
  const [showRules, setShowRules] = useState(false);
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

  // Build the active zones legend from the actual table data
  const activeLegend = useMemo(() => {
    if (total < 6) return [];
    const seen = new Map<string, ZoneConfig>();
    for (let pos = 1; pos <= total; pos++) {
      const zone = getZone(pos, total, DEFAULT_ZONES);
      if (zone && !seen.has(zone.label)) seen.set(zone.label, zone);
    }
    return Array.from(seen.values());
  }, [total]);

  // Column headers that change with sort mode
  const colHeaders = useMemo(() => {
    if (sortKey === 'home') return { j: 'J', w: 'V', d: 'E', l: 'D', gf: 'GM', ga: 'GS' };
    if (sortKey === 'away') return { j: 'J', w: 'V', d: 'E', l: 'D', gf: 'GM', ga: 'GS' };
    return { j: 'J', w: 'V', d: 'E', l: 'D', gf: 'GM', ga: 'GS' };
  }, [sortKey]);

  function renderRow({ item }: { item: TeamStatData & { displayPos: number } }) {
    const highlight = isHighlighted(item.team, highlightTeams);
    const zone = sortKey === 'default' ? getZone(item.displayPos, total, DEFAULT_ZONES) : null;

    const gf = sortKey === 'home' ? item.homeGoalsFor : sortKey === 'away' ? item.awayGoalsFor : item.goalsFor;
    const ga = sortKey === 'home' ? item.homeGoalsAgainst : sortKey === 'away' ? item.awayGoalsAgainst : item.goalsAgainst;
    const w = sortKey === 'home' ? item.homeWon : sortKey === 'away' ? item.awayWon : item.won;
    const d = sortKey === 'home' ? item.homeDrawn : sortKey === 'away' ? item.awayDrawn : item.drawn;
    const l = sortKey === 'home' ? item.homeLost : sortKey === 'away' ? item.awayLost : item.lost;
    const pts = sortKey === 'home' ? w * 3 + d : sortKey === 'away' ? w * 3 + d : item.points;
    const p = sortKey === 'home' ? w + d + l : sortKey === 'away' ? w + d + l : item.played;

    const zoneColor = zone?.color;
    const rowBg = highlight
      ? `${colors.primary}22`
      : undefined;

    return (
      <View
        style={[
          s.row,
          { borderBottomColor: colors.border },
          rowBg ? { backgroundColor: rowBg } : undefined,
        ]}
      >
        {/* Zone colour strip on the left */}
        <View
          style={[
            s.zoneStrip,
            { backgroundColor: zoneColor ?? 'transparent' },
          ]}
        />

        <Text
          style={[
            s.pos,
            { color: highlight ? colors.primary : zoneColor ?? colors.textMuted },
          ]}
        >
          {item.displayPos}
        </Text>

        {highlight && <View style={[s.highlightDot, { backgroundColor: colors.primary }]} />}

        <Text
          numberOfLines={1}
          style={[
            s.teamName,
            {
              color: highlight ? colors.primary : colors.textPrimary,
              fontWeight: highlight ? '800' : '600',
            },
          ]}
        >
          {item.team}
        </Text>

        <Text style={[s.cell, { color: colors.textSecondary }]}>{p}</Text>
        <Text style={[s.cell, { color: '#22c55e' }]}>{w}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{d}</Text>
        <Text style={[s.cell, { color: '#ef4444' }]}>{l}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{gf}</Text>
        <Text style={[s.cell, { color: colors.textSecondary }]}>{ga}</Text>
        <Text
          style={[
            s.pts,
            { color: highlight ? colors.primary : colors.textPrimary },
          ]}
        >
          {pts}
        </Text>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.title, { color: colors.textPrimary }]}>
              {competition}
            </Text>
            <Text style={[s.subtitle, { color: colors.textMuted }]}>Época {season}</Text>
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
              style={[
                s.tab,
                sortKey === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
            >
              <Text style={[s.tabText, { color: sortKey === key ? colors.primary : colors.textMuted }]}>
                {key === 'default' ? 'Geral' : key === 'home' ? '🏠 Casa' : '✈️ Fora'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Column headers */}
        <View style={[s.colHeader, { borderBottomColor: colors.border, backgroundColor: `${colors.primary}08` }]}>
          <View style={s.zoneStrip} />
          <Text style={[s.pos, { color: colors.textMuted }]}>#</Text>
          <Text style={[s.teamName, { color: colors.textMuted }]}>Equipa</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>J</Text>
          <Text style={[s.cell, { color: '#22c55e', fontWeight: '700' }]}>V</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>E</Text>
          <Text style={[s.cell, { color: '#ef4444', fontWeight: '700' }]}>D</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>GM</Text>
          <Text style={[s.cell, { color: colors.textMuted }]}>GS</Text>
          <Text style={[s.pts, { color: colors.textMuted }]}>Pts</Text>
        </View>

        {/* Column abbreviation legend */}
        <View style={[s.abbrevBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.abbrevScroll}>
            {[
              { k: 'J', v: 'Jogos' },
              { k: 'V', v: 'Vitórias' },
              { k: 'E', v: 'Empates' },
              { k: 'D', v: 'Derrotas' },
              { k: 'GM', v: 'Golos marcados' },
              { k: 'GS', v: 'Golos sofridos' },
              { k: 'Pts', v: 'Pontos' },
            ].map(({ k, v }) => (
              <View key={k} style={s.abbrevItem}>
                <Text style={[s.abbrevKey, { color: colors.primary }]}>{k}</Text>
                <Text style={[s.abbrevVal, { color: colors.textMuted }]}>{v}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {tableQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : rows.length === 0 ? (
          <Text style={[s.empty, { color: colors.textMuted }]}>Sem dados disponíveis</Text>
        ) : (
          <>
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              renderItem={renderRow}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                <View>
                  {/* Zone legend */}
                  {activeLegend.length > 0 && sortKey === 'default' && (
                    <View style={[s.legendBox, { borderTopColor: colors.border, backgroundColor: `${colors.primary}05` }]}>
                      <Text style={[s.legendTitle, { color: colors.textMuted }]}>LEGENDA DE ZONAS</Text>
                      {activeLegend.map((zone) => (
                        <View key={zone.label} style={s.legendRow}>
                          <View style={[s.legendStrip, { backgroundColor: zone.color }]} />
                          <Text style={s.legendIcon}>{zone.icon}</Text>
                          <Text style={[s.legendLabel, { color: colors.textSecondary }]}>{zone.label}</Text>
                        </View>
                      ))}
                      <View style={s.legendRow}>
                        <View style={[s.legendStrip, { backgroundColor: '#ef4444' }]} />
                        <Text style={s.legendIcon}>⬇️</Text>
                        <Text style={[s.legendLabel, { color: colors.textSecondary }]}>Descida de divisão</Text>
                      </View>
                    </View>
                  )}

                  {/* Rules section */}
                  <Pressable
                    style={[s.rulesToggle, { borderTopColor: colors.border }]}
                    onPress={() => setShowRules(!showRules)}
                  >
                    <View style={s.rulesToggleLeft}>
                      <Ionicons name="book-outline" size={14} color={colors.primary} />
                      <Text style={[s.rulesToggleText, { color: colors.textSecondary }]}>Regras de desempate</Text>
                    </View>
                    <Ionicons
                      name={showRules ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  {showRules && (
                    <View style={[s.rulesBox, { borderTopColor: colors.border, backgroundColor: `${colors.primary}05` }]}>
                      <Text style={[s.rulesTitle, { color: colors.textMuted }]}>EM CASO DE EMPATE DE PONTOS</Text>
                      {[
                        '1. Confronto directo (pontos e diferença de golos)',
                        '2. Diferença de golos geral',
                        '3. Total de golos marcados',
                        '4. Fair play (cartões)',
                      ].map((rule) => (
                        <View key={rule} style={s.ruleRow}>
                          <View style={[s.ruleDot, { backgroundColor: colors.primary }]} />
                          <Text style={[s.ruleText, { color: colors.textSecondary }]}>{rule}</Text>
                        </View>
                      ))}

                      {/* Column key */}
                      <View style={[s.colKeyBox, { borderTopColor: colors.border }]}>
                        <Text style={[s.rulesTitle, { color: colors.textMuted }]}>ABREVIATURAS</Text>
                        <View style={s.colKeyGrid}>
                          {[
                            { k: 'J', v: 'Jogos disputados' },
                            { k: 'V', v: 'Vitórias' },
                            { k: 'E', v: 'Empates' },
                            { k: 'D', v: 'Derrotas' },
                            { k: 'GM', v: 'Golos marcados' },
                            { k: 'GS', v: 'Golos sofridos' },
                            { k: 'Pts', v: 'Pontos' },
                          ].map(({ k, v }) => (
                            <View key={k} style={s.colKeyRow}>
                              <Text style={[s.colKeyK, { color: colors.primary }]}>{k}</Text>
                              <Text style={[s.colKeyV, { color: colors.textSecondary }]}>{v}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={{ height: 24 }} />
                </View>
              }
            />
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    paddingVertical: 7,
  },

  abbrevBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  abbrevScroll: {
    paddingHorizontal: 12,
    gap: 16,
    flexDirection: 'row',
  },
  abbrevItem: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  abbrevKey: { fontSize: 11, fontWeight: '800' },
  abbrevVal: { fontSize: 11 },

  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  zoneStrip: {
    width: 3,
    height: 28,
    borderRadius: 2,
    marginRight: 4,
  },
  pos: { fontSize: 12, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  highlightDot: { borderRadius: 3, height: 6, width: 6 },
  teamName: { flex: 1, fontSize: 13 },
  cell: { fontSize: 12, minWidth: 22, textAlign: 'center' },
  pts: { fontSize: 13, fontWeight: '800', minWidth: 28, textAlign: 'right' },
  empty: { fontSize: 14, marginTop: 40, textAlign: 'center' },

  // Zone legend
  legendBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendStrip: { width: 4, height: 16, borderRadius: 2 },
  legendIcon: { fontSize: 13 },
  legendLabel: { fontSize: 13, fontWeight: '500' },

  // Rules
  rulesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rulesToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rulesToggleText: { fontSize: 13, fontWeight: '600' },
  rulesBox: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  rulesTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 18 },
  colKeyBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4, gap: 6 },
  colKeyGrid: { gap: 4 },
  colKeyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  colKeyK: { fontSize: 12, fontWeight: '800', minWidth: 28 },
  colKeyV: { fontSize: 12 },
});