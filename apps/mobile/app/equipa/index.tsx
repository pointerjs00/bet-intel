// Team history: every match since 2020 in the followed competitions, with the user's bets on each
// (market, selection, odd, result, stake) and a summary of how betting on this team has gone.
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { HeroCard, HeroTile } from '../../components/ui/HeroCard';
import { MetricTile } from '../../components/ui/SectionHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useCardElevation } from '../../components/ui/ListCard';
import { MarketSelection } from '../../components/boletins/MarketSelection';
import { useTeamHistory, type TeamBet, type TeamMatch } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';

type Filter = 'bets' | 'all' | 'next';
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();
const sameTeam = (a: string, b: string) => { const x = norm(a); const y = norm(b); return x === y || x.includes(y) || y.includes(x); };

export default function TeamHistoryScreen() {
  const { sport, id, name } = useLocalSearchParams<{ sport?: string; id?: string; name?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const q = useTeamHistory({ sport, id, name });
  const h = q.data;
  const [filter, setFilter] = useState<Filter | null>(null);
  const effective: Filter = filter ?? (h && h.summary.selections > 0 ? 'bets' : 'all');

  const rows = useMemo(() => {
    if (!h) return [] as Array<{ kind: 'match'; m: TeamMatch } | { kind: 'other'; b: TeamBet } | { kind: 'title'; text: string }>;
    const now = Date.now();
    if (effective === 'next') {
      return h.matches.filter((m) => m.status === 'SCHEDULED' && new Date(m.kickoffAt).getTime() > now - 3 * 3600e3)
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)).map((m) => ({ kind: 'match' as const, m }));
    }
    const played = h.matches.filter((m) => m.status !== 'SCHEDULED' || m.bets.length);
    const list = (effective === 'bets' ? played.filter((m) => m.bets.length) : played).map((m) => ({ kind: 'match' as const, m }));
    if (effective === 'bets' && h.otherBets.length) {
      return [...list, { kind: 'title' as const, text: 'Outras apostas (taças e provas não seguidas)' }, ...h.otherBets.map((b) => ({ kind: 'other' as const, b }))];
    }
    return list;
  }, [h, effective]);

  const teamName = h?.team.name ?? name ?? '';
  const variant = (h?.team.sport ?? sport) === 'TENNIS' ? 'player' : 'team';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: true, title: teamName }} />
      {q.isLoading || !h ? (
        <View style={styles.pad}>
          {q.isError ? <AppText variant="body">Não foi possível carregar a equipa.</AppText> : [0, 1, 2].map((i) => <Skeleton height={90} key={i} width="100%" />)}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.pad}
          data={rows}
          initialNumToRender={12}
          keyExtractor={(r, i) => (r.kind === 'match' ? r.m.id : r.kind === 'other' ? `${r.b.boletinId}-${i}` : `t${i}`)}
          ListHeaderComponent={
            <View style={styles.header}>
              <HeroCard>
                <View style={styles.teamHead}>
                  <TeamBadge imageUrl={h.team.logo} name={h.team.name} size={56} variant={variant} />
                  <View style={styles.flex}>
                    <AppText numberOfLines={2} variant="title">{h.team.name}</AppText>
                    {h.team.leagues.length ? <AppText numberOfLines={2} variant="caption">{h.team.leagues.join(' · ')}</AppText> : null}
                  </View>
                </View>
                <View style={styles.tiles}>
                  <HeroTile><MetricTile label="Seleções" value={String(h.summary.selections)} /></HeroTile>
                  <HeroTile><MetricTile label="Acerto" value={h.summary.hitRate === null ? '—' : `${h.summary.hitRate}%`} /></HeroTile>
                  <HeroTile><MetricTile label="Odd média" value={h.summary.averageOdd === null ? '—' : formatOdds(h.summary.averageOdd)} /></HeroTile>
                </View>
                <View style={styles.tiles}>
                  <HeroTile><MetricTile label="Ganhas / perdidas" value={`${h.summary.won} / ${h.summary.lost}`} /></HeroTile>
                  <HeroTile>
                    <MetricTile
                      label="Lucro (simples)"
                      tone={h.summary.singlesProfit > 0 ? 'positive' : h.summary.singlesProfit < 0 ? 'negative' : undefined}
                      value={`${h.summary.singlesProfit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(h.summary.singlesProfit))}`}
                    />
                  </HeroTile>
                </View>
              </HeroCard>
              <SegmentedControl
                onChange={setFilter}
                options={[{ value: 'bets', label: 'Com aposta' }, { value: 'all', label: `Jogos (${h.matches.filter((m) => m.status !== 'SCHEDULED').length})` }, { value: 'next', label: 'Próximos' }]}
                value={effective}
              />
            </View>
          }
          ListEmptyComponent={
            <AppText style={styles.empty} variant="caption">
              {effective === 'bets' ? 'Ainda não apostaste em jogos desta equipa.' : effective === 'next' ? 'Sem jogos marcados.' : 'Sem jogos nas competições seguidas.'}
            </AppText>
          }
          renderItem={({ item: r }) => {
            if (r.kind === 'title') return <AppText style={styles.sectionTitle} variant="label">{r.text}</AppText>;
            if (r.kind === 'other') return <BetRow bet={r.b} onPress={() => router.push(`/boletins/${r.b.boletinId}`)} withTeams />;
            return <MatchCard match={r.m} team={h.team.name} variant={variant} onOpenBet={(b) => router.push(`/boletins/${b}`)} />;
          }}
        />
      )}
    </View>
  );
}

function MatchCard({ match: m, team, variant, onOpenBet }: { match: TeamMatch; team: string; variant: 'team' | 'player'; onOpenBet: (boletinId: string) => void }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const d = new Date(m.kickoffAt);
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  const isHome = sameTeam(m.home, team);
  // Win / draw / loss from this team's point of view.
  let wdl: 'V' | 'E' | 'D' | null = null;
  if (m.score && m.status === 'FINISHED') {
    const mine = isHome ? m.score.home : m.score.away;
    const theirs = isHome ? m.score.away : m.score.home;
    wdl = mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
  }
  const wdlColor = wdl === 'V' ? colors.positive : wdl === 'D' ? colors.negative : colors.textMuted;
  const side = (name: string, score: number | undefined, other: number | undefined) => {
    const lost = m.status === 'FINISHED' && score !== undefined && other !== undefined && score < other;
    const won = m.status === 'FINISHED' && score !== undefined && other !== undefined && score > other;
    return (
      <View style={styles.side}>
        <TeamBadge name={name} size={20} variant={variant} />
        <AppText numberOfLines={1} style={[styles.teamName, { color: lost ? colors.textSecondary : colors.textPrimary, fontWeight: won ? '700' : '500' }]}>{name}</AppText>
        {m.score ? <AppText style={[styles.score, { color: lost ? colors.textSecondary : colors.textPrimary }]} variant="number">{score}</AppText> : null}
      </View>
    );
  };
  return (
    <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
      <View style={styles.matchRow}>
        <View style={styles.statusCol}>
          <AppText style={styles.small} variant="caption">{date}</AppText>
          <AppText numberOfLines={1} style={styles.small} variant="caption">{m.status === 'FINISHED' ? 'FT' : m.status === 'SCHEDULED' ? d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : m.status === 'POSTPONED' ? 'Adiado' : m.status === 'LIVE' ? 'Ao vivo' : 'Cancel.'}</AppText>
        </View>
        <View style={styles.flex}>
          <AppText numberOfLines={1} style={styles.small} variant="caption">{m.leagueName}</AppText>
          {side(m.home, m.score?.home, m.score?.away)}
          {side(m.away, m.score?.away, m.score?.home)}
        </View>
        {wdl ? (
          <View style={[styles.wdl, { backgroundColor: `${wdlColor}26` }]}>
            <AppText style={{ color: wdlColor, fontWeight: '800' }} variant="label">{wdl}</AppText>
          </View>
        ) : <View style={styles.wdlSpacer} />}
      </View>
      {m.bets.map((b, i) => <BetRow bet={b} key={`${b.boletinId}-${i}`} onPress={() => onOpenBet(b.boletinId)} />)}
    </View>
  );
}

function resultMeta(result: string, colors: ReturnType<typeof useTheme>['colors']) {
  if (result === 'WON') return { label: 'Ganha', color: colors.positive, icon: 'checkmark-circle' as const };
  if (result === 'LOST') return { label: 'Perdida', color: colors.negative, icon: 'close-circle' as const };
  if (result === 'VOID') return { label: 'Anulada', color: colors.info, icon: 'remove-circle' as const };
  return { label: 'Pendente', color: colors.warning, icon: 'time' as const };
}

function BetRow({ bet: b, onPress, withTeams }: { bet: TeamBet; onPress: () => void; withTeams?: boolean }) {
  const { colors } = useTheme();
  const r = resultMeta(b.result, colors);
  const date = b.kickoffAt ? new Date(b.kickoffAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null;
  return (
    <Pressable accessibilityHint="Abre o boletim" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.bet, { backgroundColor: pressed ? colors.surfaceRaised : `${colors.surfaceRaised}99` }]}>
      <Ionicons color={r.color} name={r.icon} size={20} />
      <View style={styles.flex}>
        {withTeams ? <AppText numberOfLines={1} variant="bodyStrong">{b.homeTeam} vs {b.awayTeam}{date ? ` · ${date}` : ''}</AppText> : null}
        <MarketSelection market={b.market} selection={b.selection} trailing={`@${formatOdds(b.odd)}`} />
        <AppText numberOfLines={1} style={styles.small} variant="caption">
          {b.multiple > 1 ? `Múltipla de ${b.multiple}` : 'Simples'} · {formatCurrency(b.stake)}{b.boletinName ? ` · ${b.boletinName}` : ''}
        </AppText>
      </View>
      <View style={styles.betRight}>
        <AppText style={{ color: r.color, fontWeight: '700' }} variant="label">{r.label}</AppText>
        {b.singleProfit !== null ? (
          <AppText style={{ color: b.singleProfit >= 0 ? colors.positive : colors.negative }} variant="number">
            {b.singleProfit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(b.singleProfit))}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pad: { gap: 10, padding: 16, paddingBottom: 48 },
  header: { gap: 14, marginBottom: 4 },
  teamHead: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 8 },
  empty: { paddingVertical: 32, textAlign: 'center' },
  sectionTitle: { marginTop: 10 },
  card: { borderRadius: 18, gap: 8, padding: 12 },
  matchRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  statusCol: { gap: 4, width: 58 },
  small: { fontSize: 11 },
  side: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  teamName: { flexShrink: 1, fontSize: 14 },
  score: { fontSize: 15, marginLeft: 'auto' },
  wdl: { alignItems: 'center', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
  wdlSpacer: { width: 28 },
  bet: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, padding: 10 },
  betRight: { alignItems: 'flex-end', gap: 2 },
});
