// Match detail (redesign D8): score, incidents and team stats from ESPN via /api/sports.
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { ListCard, ListRow, useCardElevation } from '../../components/ui/ListCard';
import { StatusPill } from '../../components/ui/StatusPill';
import { HeroCard } from '../../components/ui/HeroCard';
import { MatchPreviewSection } from '../../components/fixtures/MatchPreviewSection';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFootballMatch, type MatchIncident, type TeamStats } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';
import { useBoletins } from '../../services/boletinService';
import { findMatchBets, indexBetsByDay } from '../../utils/dayBets';
import { MatchBetVerdict, OtherMarkets } from '../../components/fixtures/MatchBetVerdict';

const STAT_ROWS: Array<{ key: keyof TeamStats; label: string; percent?: boolean }> = [
  { key: 'possession', label: 'Posse de bola', percent: true },
  { key: 'shots', label: 'Remates' },
  { key: 'shotsOnTarget', label: 'Remates à baliza' },
  { key: 'corners', label: 'Cantos' },
  { key: 'fouls', label: 'Faltas' },
  { key: 'yellowCards', label: 'Cartões amarelos' },
  { key: 'redCards', label: 'Cartões vermelhos' },
];

function incidentIcon(type: MatchIncident['type'], colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'GOAL':
    case 'PENALTY_GOAL':
      return <Ionicons color={colors.textPrimary} name="football" size={16} />;
    case 'OWN_GOAL':
      return <Ionicons color={colors.danger} name="football" size={16} />;
    case 'PENALTY_MISSED':
      return <Ionicons color={colors.textMuted} name="close-circle-outline" size={16} />;
    case 'YELLOW':
      return <View style={[styles.card, { backgroundColor: '#F5C518' }]} />;
    case 'SECOND_YELLOW':
    case 'RED':
      return <View style={[styles.card, { backgroundColor: colors.danger }]} />;
    case 'SUB':
      return <MaterialCommunityIcons color={colors.textSecondary} name="swap-horizontal" size={16} />;
    default:
      return <Ionicons color={colors.textSecondary} name="tv-outline" size={16} />;
  }
}

const INCIDENT_LABEL: Record<MatchIncident['type'], string> = {
  GOAL: 'Golo', OWN_GOAL: 'Autogolo', PENALTY_GOAL: 'Golo (penálti)', PENALTY_MISSED: 'Penálti falhado',
  YELLOW: 'Amarelo', SECOND_YELLOW: 'Segundo amarelo', RED: 'Vermelho', SUB: 'Substituição', VAR: 'VAR',
};

export default function MatchDetailScreen() {
  const { id, league } = useLocalSearchParams<{ id: string; league: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const query = useFootballMatch(league ?? '', id ?? '');
  const m = query.data;

  const live = m?.status === 'LIVE' || m?.status === 'HALFTIME';
  const kickoff = m ? new Date(m.kickoffAt) : null;
  const keyIncidents = (m?.incidents ?? []).filter((i) => i.type !== 'SUB');
  // The user's selections on this match (one verdict per selection).
  const boletins = useBoletins();
  const bets = useMemo(() => {
    if (!m) return [];
    const seen = new Set<string>();
    return findMatchBets(indexBetsByDay(boletins.data ?? []), m.kickoffAt, m.home.name, m.away.name)
      .filter((x) => { const k = `${x.bet.boletinId}|${x.bet.selection}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [boletins.data, m]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl onRefresh={() => void query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />}
        style={{ backgroundColor: colors.background }}
      >
        <Pressable accessibilityLabel="Voltar" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]}>
          <Ionicons color={colors.textPrimary} name="chevron-back" size={22} />
        </Pressable>

        {!m ? (
          query.isError ? (
            <AppText variant="body">Não foi possível carregar o jogo.</AppText>
          ) : (
            <Skeleton height={180} width="100%" />
          )
        ) : (
          <>
            <HeroCard style={styles.hero}>
              <View style={styles.heroTop}>
                <AppText numberOfLines={1} style={styles.flex} variant="label">{m.competition.name}</AppText>
                {live ? <StatusPill compact status="LIVE" /> : null}
              </View>
              <View style={styles.teams}>
                <View style={styles.teamCol}>
                  <TeamBadge name={m.home.name} size={56} />
                  <AppText numberOfLines={2} style={styles.centerText} variant="bodyStrong">{m.home.name}</AppText>
                </View>
                <View style={styles.scoreBox}>
                  {m.score && (live || m.status === 'FINISHED') ? (
                    <AppText variant="numberLarge">{m.score.home} – {m.score.away}</AppText>
                  ) : (
                    <AppText variant="numberLarge">{kickoff?.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</AppText>
                  )}
                  <AppText tone={live ? undefined : 'secondary'} style={live ? { color: colors.live } : undefined} variant="label">
                    {live ? (m.status === 'HALFTIME' ? 'Intervalo' : m.statusDetail) : m.status === 'FINISHED' ? 'Terminado' : kickoff?.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </AppText>
                  {m.halfTime && (live || m.status === 'FINISHED') ? <AppText variant="caption">Intervalo {m.halfTime.home}–{m.halfTime.away}</AppText> : null}
                </View>
                <View style={styles.teamCol}>
                  <TeamBadge name={m.away.name} size={56} />
                  <AppText numberOfLines={2} style={styles.centerText} variant="bodyStrong">{m.away.name}</AppText>
                </View>
              </View>
              {m.venue ? <AppText style={styles.centerText} variant="caption">{m.venue}</AppText> : null}
            </HeroCard>

            {bets.map((x, i) => (
              <MatchBetVerdict
                bet={x.bet}
                key={`${x.bet.boletinId}-${i}`}
                match={m}
                onOpenBoletim={() => router.push(`/boletins/${x.bet.boletinId}`)}
              />
            ))}
            <OtherMarkets match={m} />
            {bets.length > 0 ? <AppText style={styles.sectionLabel} variant="label">O JOGO</AppText> : null}

            {keyIncidents.length > 0 ? (
              <>
                <AppText variant="heading">Eventos</AppText>
                <ListCard>
                  {keyIncidents.map((inc, i) => (
                    <ListRow key={`${inc.minute}-${i}`} style={inc.side === 'away' ? styles.awayRow : undefined}>
                      <AppText style={styles.minute} variant="label">{inc.minute}</AppText>
                      {incidentIcon(inc.type, colors)}
                      <View style={[styles.flex, inc.side === 'away' && styles.alignRight]}>
                        <AppText numberOfLines={1} variant="bodyStrong">{inc.player ?? INCIDENT_LABEL[inc.type]}</AppText>
                        <AppText numberOfLines={1} variant="caption">
                          {INCIDENT_LABEL[inc.type]}{inc.assist ? ` · assistência ${inc.assist}` : ''}{inc.side ? `${inc.type === 'OWN_GOAL' ? ' a favor do ' : ' · '}${inc.side === 'home' ? m.home.name : m.away.name}` : ''}
                        </AppText>
                      </View>
                    </ListRow>
                  ))}
                </ListCard>
              </>
            ) : null}

            {m.stats ? (
              <>
                <AppText variant="heading">Estatísticas</AppText>
                <View style={[styles.statsCard, elevation, { backgroundColor: colors.surface }]}>
                  {STAT_ROWS.map((row) => {
                    const h = m.stats!.home[row.key];
                    const a = m.stats!.away[row.key];
                    if (h === null && a === null) return null;
                    const hv = h ?? 0;
                    const av = a ?? 0;
                    const total = hv + av || 1;
                    return (
                      <View accessibilityLabel={`${row.label}: ${hv} contra ${av}`} key={row.key} style={styles.statRow}>
                        <View style={styles.statLabels}>
                          <AppText variant="number">{row.percent ? `${hv}%` : hv}</AppText>
                          <AppText variant="label">{row.label}</AppText>
                          <AppText variant="number">{row.percent ? `${av}%` : av}</AppText>
                        </View>
                        <View style={styles.bar}>
                          <View style={[styles.barHome, { flex: hv / total, backgroundColor: hv >= av ? colors.primary : colors.border }]} />
                          <View style={[styles.barAway, { flex: av / total, backgroundColor: av > hv ? colors.primary : colors.border }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : m.status === 'SCHEDULED' ? (
              <AppText style={styles.centerText} variant="caption">As estatísticas aparecem quando o jogo começar.</AppText>
            ) : null}

            {/* Pre-match context (#58): shown for every match, most useful before kick-off */}
            <MatchPreviewSection away={m.away.name} home={m.home.name} id={id ?? ''} league={league ?? ''} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 20 },
  sectionLabel: { letterSpacing: 0.6, marginTop: 6 },
  flex: { flex: 1 },
  back: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  hero: { gap: 12, padding: 20 },
  teamCol: { alignItems: 'center', flex: 1, gap: 8 },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  teams: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  team: { flex: 1 },
  left: { textAlign: 'left' },
  right: { textAlign: 'right' },
  scoreBox: { alignItems: 'center', gap: 2, minWidth: 110 },
  centerText: { textAlign: 'center' },
  minute: { width: 44 },
  card: { borderRadius: 2, height: 16, width: 12 },
  awayRow: { flexDirection: 'row-reverse' },
  alignRight: { alignItems: 'flex-end' },
  statsCard: { borderRadius: 20, gap: 16, padding: 20 },
  statRow: { gap: 6 },
  statLabels: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bar: { borderRadius: 3, flexDirection: 'row', gap: 4, height: 6, overflow: 'hidden' },
  barHome: { borderRadius: 3 },
  barAway: { borderRadius: 3 },
});
