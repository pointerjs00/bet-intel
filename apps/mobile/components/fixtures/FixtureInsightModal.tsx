import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFixtureInsight } from '../../services/teamStatsService';
import type { TeamInsight, H2HInsight, SharpOdds } from '../../services/teamStatsService';
import { useTheme } from '../../theme/useTheme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FixtureInsightModalProps {
  visible: boolean;
  fixtureId: string | null;
  homeTeam: string;
  awayTeam: string;
  onClose: () => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function fmt1(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toFixed(1);
}

function FormPills({ form }: { form: ('W' | 'D' | 'L')[] }) {
  return (
    <View style={pillStyles.row}>
      {form.map((r, i) => (
        <View
          key={i}
          style={[
            pillStyles.pill,
            { backgroundColor: r === 'W' ? '#22c55e' : r === 'D' ? '#94a3b8' : '#ef4444' },
          ]}
        >
          <Text style={pillStyles.pillText}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={secStyles.header}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={[secStyles.title, { color: colors.primary }]}>{title}</Text>
    </View>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={secStyles.statRow}>
      <Text style={[secStyles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          secStyles.statValue,
          { color: highlight ? colors.primary : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function TeamInsightCard({
  label,
  venue,
  insight,
}: {
  label: string;
  venue: 'Em casa' | 'Fora';
  insight: TeamInsight;
}) {
  const { colors } = useTheme();
  return (
    <View style={[teamCardStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={teamCardStyles.header}>
        <Text numberOfLines={1} style={[teamCardStyles.teamName, { color: colors.textPrimary }]}>
          {label}
        </Text>
        <Text style={[teamCardStyles.venueBadge, { color: colors.textMuted, backgroundColor: `${colors.primary}15` }]}>
          {venue}
        </Text>
      </View>
      {insight.formLast5.length > 0 && (
        <FormPills form={insight.formLast5} />
      )}
      <View style={teamCardStyles.grid}>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.textPrimary }]}>{fmt1(insight.avgGoalsFor)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>Méd. GM</Text>
        </View>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.textPrimary }]}>{fmt1(insight.avgGoalsAgainst)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>Méd. GS</Text>
        </View>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.primary }]}>{pct(insight.over25Pct)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>+2.5</Text>
        </View>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.primary }]}>{pct(insight.bttsPct)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>BTTS</Text>
        </View>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.textPrimary }]}>{pct(insight.cleanSheetPct)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>CS</Text>
        </View>
        <View style={teamCardStyles.gridItem}>
          <Text style={[teamCardStyles.gridVal, { color: colors.textPrimary }]}>{pct(insight.failedToScorePct)}</Text>
          <Text style={[teamCardStyles.gridLbl, { color: colors.textMuted }]}>Não M.</Text>
        </View>
      </View>
      <Text style={[teamCardStyles.sample, { color: colors.textMuted }]}>
        Baseado em {insight.sampleSize} {venue === 'Em casa' ? 'jogos em casa' : 'jogos fora'}
      </Text>
    </View>
  );
}

function CombinedCard({ over25, btts }: { over25: number | null | undefined; btts: number | null | undefined }) {
  const { colors } = useTheme();
  const hasOver25 = over25 != null && isFinite(over25);
  const hasBtts = btts != null && isFinite(btts);
  // Nothing meaningful to show — both values are absent or NaN
  if (!hasOver25 && !hasBtts) return null;
  return (
    <View style={[combinedStyles.card, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
      <SectionHeader icon="analytics-outline" title="Probabilidade combinada" />
      <View style={combinedStyles.row}>
        {hasOver25 && (
          <View style={combinedStyles.item}>
            <Text style={[combinedStyles.pct, { color: colors.primary }]}>{pct(over25)}</Text>
            <Text style={[combinedStyles.lbl, { color: colors.textSecondary }]}>Over 2.5 combinado</Text>
          </View>
        )}
        {hasOver25 && hasBtts && (
          <View style={[combinedStyles.divider, { backgroundColor: colors.border }]} />
        )}
        {hasBtts && (
          <View style={combinedStyles.item}>
            <Text style={[combinedStyles.pct, { color: colors.primary }]}>{pct(btts)}</Text>
            <Text style={[combinedStyles.lbl, { color: colors.textSecondary }]}>BTTS combinado</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function H2HCard({ h2h, homeTeam, awayTeam }: { h2h: H2HInsight; homeTeam: string; awayTeam: string }) {
  const { colors } = useTheme();
  const total = h2h.homeWins + h2h.draws + h2h.awayWins;
  return (
    <View>
      <SectionHeader icon="swap-horizontal-outline" title="Head-to-Head" />
      <View style={[h2hStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {/* Win bar */}
        {total > 0 && (
          <View style={h2hStyles.barWrap}>
            <Text style={[h2hStyles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{homeTeam}</Text>
            <View style={[h2hStyles.barTrack, { backgroundColor: colors.border }]}>
              <View style={[h2hStyles.barSegment, { flex: h2h.homeWins, backgroundColor: '#22c55e' }]} />
              <View style={[h2hStyles.barSegment, { flex: h2h.draws, backgroundColor: '#94a3b8' }]} />
              <View style={[h2hStyles.barSegment, { flex: h2h.awayWins, backgroundColor: '#ef4444' }]} />
            </View>
            <Text style={[h2hStyles.barLabel, { color: colors.textSecondary, textAlign: 'right' }]} numberOfLines={1}>{awayTeam}</Text>
          </View>
        )}
        <View style={h2hStyles.statsRow}>
          <Text style={[h2hStyles.stat, { color: '#22c55e' }]}>{h2h.homeWins}V</Text>
          <Text style={[h2hStyles.stat, { color: colors.textMuted }]}>{h2h.draws}E</Text>
          <Text style={[h2hStyles.stat, { color: '#ef4444' }]}>{h2h.awayWins}D</Text>
          <View style={[h2hStyles.divider, { backgroundColor: colors.border }]} />
          <Text style={[h2hStyles.stat, { color: colors.textSecondary }]}>{fmt1(h2h.avgGoalsPerGame)} GM/j</Text>
          <Text style={[h2hStyles.stat, { color: colors.primary }]}>{pct(h2h.over25Pct)} +2.5</Text>
          <Text style={[h2hStyles.stat, { color: colors.primary }]}>{pct(h2h.bttsPct)} BTTS</Text>
        </View>
        {h2h.recentMatches.length > 0 && (
          <View style={h2hStyles.recentList}>
            <Text style={[h2hStyles.recentTitle, { color: colors.textMuted }]}>RECENTES</Text>
            {h2h.recentMatches.slice(0, 5).map((m, i) => (
              <View key={i} style={[h2hStyles.recentRow, { borderTopColor: colors.border }]}>
                <Text style={[h2hStyles.recentDate, { color: colors.textMuted }]}>
                  {new Date(m.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </Text>
                <Text numberOfLines={1} style={[h2hStyles.recentTeam, { color: colors.textSecondary }]}>{m.homeTeam}</Text>
                <Text style={[h2hStyles.recentScore, { color: colors.textPrimary }]}>
                  {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
                </Text>
                <Text numberOfLines={1} style={[h2hStyles.recentTeam, { color: colors.textSecondary, textAlign: 'right' }]}>{m.awayTeam}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function SharpOddsCard({ odds }: { odds: SharpOdds }) {
  const { colors } = useTheme();
  if (!odds.pinnacleHome && !odds.pinnacleDraw && !odds.pinnacleAway) return null;
  return (
    <View>
      <SectionHeader icon="trending-up-outline" title="Odds Pinnacle (sharp)" />
      <View style={[sharpStyles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={sharpStyles.row}>
          {[
            { lbl: '1', odd: odds.pinnacleHome, implied: odds.impliedHome },
            { lbl: 'X', odd: odds.pinnacleDraw, implied: odds.impliedDraw },
            { lbl: '2', odd: odds.pinnacleAway, implied: odds.impliedAway },
          ].map(({ lbl, odd, implied }) =>
            odd !== null ? (
              <View key={lbl} style={sharpStyles.col}>
                <Text style={[sharpStyles.colLbl, { color: colors.textMuted }]}>{lbl}</Text>
                <Text style={[sharpStyles.colOdd, { color: colors.textPrimary }]}>{odd.toFixed(2)}</Text>
                {implied !== null && (
                  <Text style={[sharpStyles.colImplied, { color: colors.primary }]}>{pct(implied * 100)}</Text>
                )}
              </View>
            ) : null,
          )}
        </View>
        {odds.note ? (
          <Text style={[sharpStyles.note, { color: colors.textMuted }]}>{odds.note}</Text>
        ) : null}
      </View>
    </View>
  );
}

function PlayerList({
  title,
  players,
  isInjury,
}: {
  title: string;
  players: { playerName: string; goals?: number; assists?: number; type?: string; reason?: string }[];
  isInjury?: boolean;
}) {
  const { colors } = useTheme();
  if (players.length === 0) return null;
  return (
    <View style={playerStyles.wrap}>
      <Text style={[playerStyles.title, { color: colors.textMuted }]}>{title}</Text>
      {players.map((p, i) => (
        <View key={i} style={playerStyles.row}>
          <Ionicons
            name={isInjury ? 'bandage-outline' : 'football-outline'}
            size={13}
            color={isInjury ? '#ef4444' : colors.primary}
          />
          <Text style={[playerStyles.name, { color: colors.textSecondary }]} numberOfLines={1}>
            {p.playerName}
          </Text>
          {!isInjury && p.goals !== undefined && (
            <Text style={[playerStyles.stat, { color: colors.textMuted }]}>
              {p.goals}G{p.assists !== undefined ? ` ${p.assists}A` : ''}
            </Text>
          )}
          {isInjury && p.type && (
            <Text style={[playerStyles.stat, { color: '#ef4444' }]}>{p.type}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function FixtureInsightModal({
  visible,
  fixtureId,
  homeTeam,
  awayTeam,
  onClose,
}: FixtureInsightModalProps) {
  const { colors, tokens } = useTheme();
  const { data: insight, isLoading, isError } = useFixtureInsight(fixtureId);

  const hasInjuries =
    (insight?.homeInjuries?.length ?? 0) > 0 || (insight?.awayInjuries?.length ?? 0) > 0;
  const hasScorers =
    (insight?.homeTopScorers?.length ?? 0) > 0 || (insight?.awayTopScorers?.length ?? 0) > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[modalStyles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[modalStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              Análise do jogo
            </Text>
            <Text style={[modalStyles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {homeTeam} vs {awayTeam}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Body */}
        {isLoading ? (
          <View style={modalStyles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[modalStyles.loadingText, { color: colors.textMuted }]}>
              A carregar análise…
            </Text>
          </View>
        ) : isError || !insight ? (
          <View style={modalStyles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={[modalStyles.loadingText, { color: colors.textMuted }]}>
              Não foi possível carregar a análise.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              modalStyles.scrollContent,
              { paddingBottom: tokens.spacing.xl ?? 32 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Graceful degradation message */}
            {insight.message && (
              <View style={[msgStyles.box, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28` }]}>
                <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                <Text style={[msgStyles.text, { color: colors.textSecondary }]}>{insight.message}</Text>
              </View>
            )}

            {/* Combined stats */}
            <CombinedCard over25={insight.combinedOver25} btts={insight.combinedBtts} />

            {/* Home team at home */}
            {insight.homeTeamAtHome && (
              <TeamInsightCard
                label={insight.homeTeam}
                venue="Em casa"
                insight={insight.homeTeamAtHome}
              />
            )}

            {/* Away team away */}
            {insight.awayTeamAway && (
              <TeamInsightCard
                label={insight.awayTeam}
                venue="Fora"
                insight={insight.awayTeamAway}
              />
            )}

            {/* H2H */}
            {insight.h2h && insight.h2h.total > 0 && (
              <H2HCard h2h={insight.h2h} homeTeam={insight.homeTeam} awayTeam={insight.awayTeam} />
            )}

            {/* Sharp odds */}
            {insight.sharpOdds && (
              <SharpOddsCard odds={insight.sharpOdds} />
            )}

            {/* Injuries */}
            {hasInjuries && (
              <View>
                <SectionHeader icon="bandage-outline" title="Lesões / Baixas" />
                <View style={[sideStyles.wrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <PlayerList
                    title={insight.homeTeam.toUpperCase()}
                    players={insight.homeInjuries}
                    isInjury
                  />
                  <PlayerList
                    title={insight.awayTeam.toUpperCase()}
                    players={insight.awayInjuries}
                    isInjury
                  />
                </View>
              </View>
            )}

            {/* Top scorers */}
            {hasScorers && (
              <View>
                <SectionHeader icon="football-outline" title="Melhores marcadores" />
                <View style={[sideStyles.wrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <PlayerList
                    title={insight.homeTeam.toUpperCase()}
                    players={insight.homeTopScorers}
                  />
                  <PlayerList
                    title={insight.awayTeam.toUpperCase()}
                    players={insight.awayTopScorers}
                  />
                </View>
              </View>
            )}

            {/* Computed at */}
            {insight.computedAt && (
              <Text style={[modalStyles.computedAt, { color: colors.textMuted }]}>
                Análise calculada em{' '}
                {new Date(insight.computedAt).toLocaleString('pt-PT', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  scrollContent: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  computedAt: { fontSize: 11, marginTop: 4, textAlign: 'center' },
});

const pillStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  pill: {
    alignItems: 'center',
    borderRadius: 4,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

const secStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  statLabel: { fontSize: 13, fontWeight: '500' },
  statValue: { fontSize: 13, fontWeight: '700' },
});

const teamCardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  teamName: { flex: 1, fontSize: 14, fontWeight: '800' },
  venueBadge: {
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    alignItems: 'center',
    minWidth: '28%',
    flex: 1,
  },
  gridVal: { fontSize: 17, fontWeight: '800' },
  gridLbl: { fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  sample: { fontSize: 10, fontWeight: '500' },
});

const combinedStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  item: { alignItems: 'center', flex: 1 },
  pct: { fontSize: 28, fontWeight: '900' },
  lbl: { fontSize: 12, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 40 },
});

const h2hStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  barWrap: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  barLabel: { flex: 1, fontSize: 11, fontWeight: '600' },
  barTrack: {
    borderRadius: 4,
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    width: 100,
  },
  barSegment: { height: '100%' },
  statsRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { fontSize: 12, fontWeight: '700' },
  divider: { height: 14, width: StyleSheet.hairlineWidth },
  recentList: { gap: 0 },
  recentTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  recentRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  recentDate: { fontSize: 11, fontWeight: '500', minWidth: 44 },
  recentTeam: { flex: 1, fontSize: 12, fontWeight: '500' },
  recentScore: { fontSize: 13, fontWeight: '800', minWidth: 36, textAlign: 'center' },
});

const sharpStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  col: { alignItems: 'center', flex: 1 },
  colLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  colOdd: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  colImplied: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  note: { fontSize: 11, fontStyle: 'italic', textAlign: 'center' },
});

const playerStyles = StyleSheet.create({
  wrap: { gap: 4, marginBottom: 6 },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 3 },
  name: { flex: 1, fontSize: 13, fontWeight: '500' },
  stat: { fontSize: 12, fontWeight: '700' },
});

const sideStyles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, gap: 4, padding: 12 },
});

const msgStyles = StyleSheet.create({
  box: {
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '500' },
});