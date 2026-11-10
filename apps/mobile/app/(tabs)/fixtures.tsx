// Jogos — redesign D8 / plan #60: free ESPN data for the 8 leagues + UEFA competitions.
// (The old API-Football fixtures screen still powers "Novo boletim → Por jogo".)
import React, { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { ListCard, ListRow } from '../../components/ui/ListCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { Appear, LiveDot } from '../../components/ui/Appear';
import { useGlow } from '../../components/ui/ListCard';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { getLeagueLogoUrl } from '../../utils/sportAssets';
import { useFootballDay, type FootballMatch } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

type Filter = 'all' | 'live' | 'bets';

const DAY_MS = 24 * 3600e3;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

function dayLabel(d: Date, offset: number): { top: string; day: string } {
  if (offset === 0) return { top: 'Hoje', day: String(d.getDate()) };
  if (offset === 1) return { top: 'Amanhã', day: String(d.getDate()) };
  if (offset === -1) return { top: 'Ontem', day: String(d.getDate()) };
  return { top: WEEKDAYS[d.getDay()]!, day: String(d.getDate()) };
}

const isLive = (m: FootballMatch) => m.status === 'LIVE' || m.status === 'HALFTIME';

export default function JogosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const accentGlow = useGlow(colors.accent);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');

  const date = useMemo(() => new Date(Date.now() + offset * DAY_MS), [offset]);
  const dayQuery = useFootballDay(toIsoDate(date));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => i - 2), []);

  const groups = useMemo(() => {
    const all = dayQuery.data?.groups ?? [];
    return all
      .map((g) => ({
        ...g,
        matches: g.matches.filter((m) => (filter === 'live' ? isLive(m) : filter === 'bets' ? m.hasBet : true)),
      }))
      .filter((g) => g.matches.length > 0);
  }, [dayQuery.data, filter]);

  const liveCount = (dayQuery.data?.groups ?? []).reduce((n, g) => n + g.matches.filter(isLive).length, 0);
  const betCount = (dayQuery.data?.groups ?? []).reduce((n, g) => n + g.matches.filter((m) => m.hasBet).length, 0);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}
      refreshControl={<RefreshControl onRefresh={() => void dayQuery.refetch()} refreshing={dayQuery.isRefetching} tintColor={colors.primary} />}
      style={{ backgroundColor: colors.background }}
    >
      <AppText accessibilityRole="header" variant="title">Jogos</AppText>

      {/* Day strip */}
      <ScrollView contentContainerStyle={styles.days} horizontal showsHorizontalScrollIndicator={false}>
        {days.map((o) => {
          const d = new Date(Date.now() + o * DAY_MS);
          const label = dayLabel(d, o);
          const active = o === offset;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={o}
              onPress={() => { hapticLight(); setOffset(o); }}
              style={[styles.day, { backgroundColor: active ? colors.accent : colors.surface }, active ? accentGlow : null]}
            >
              <AppText style={[styles.dayTop, active && styles.onAccent]} tone={active ? undefined : 'secondary'} variant="label">{label.top}</AppText>
              <AppText style={active ? styles.onAccent : undefined} variant="number">{label.day}</AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Filters */}
      <View style={styles.filters}>
        {([
          { key: 'all', label: 'Todos' },
          { key: 'live', label: liveCount > 0 ? `Ao vivo · ${liveCount}` : 'Ao vivo' },
          { key: 'bets', label: betCount > 0 ? `Com aposta · ${betCount}` : 'Com aposta' },
        ] as const).map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.pill, { backgroundColor: active ? `${colors.primary}26` : colors.surface }]}
            >
              <AppText style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '700' : '500' }} variant="label">{f.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      {dayQuery.isLoading ? (
        <ListCard>{[0, 1, 2, 3].map((i) => <ListRow key={i}><Skeleton height={40} width="100%" /></ListRow>)}</ListCard>
      ) : dayQuery.isError ? (
        <ListCard>
          <ListRow onPress={() => void dayQuery.refetch()}>
            <Ionicons color={colors.warning} name="cloud-offline-outline" size={22} />
            <AppText style={styles.flex} variant="bodyStrong">Não foi possível carregar. Toca para tentar outra vez.</AppText>
          </ListRow>
        </ListCard>
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons color={colors.textMuted} name="calendar-outline" size={40} />
          <AppText variant="heading">
            {filter === 'live' ? 'Nenhum jogo a decorrer' : filter === 'bets' ? 'Sem jogos com aposta neste dia' : 'Sem jogos neste dia'}
          </AppText>
          <AppText style={styles.center} variant="caption">Ligas seguidas: Portugal, Inglaterra, Espanha, Alemanha, Itália, França, Países Baixos, Turquia e provas UEFA.</AppText>
          {filter === 'all' ? (
            <Pressable accessibilityRole="button" onPress={() => setOffset((o) => o + 1)} style={[styles.emptyBtn, { backgroundColor: colors.surface }]}>
              <AppText tone="accent" variant="bodyStrong">Ver o dia seguinte</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        groups.map((g, gi) => (
          <Appear index={gi} key={g.slug} style={styles.group}>
            <View style={styles.groupHead}>
              {getLeagueLogoUrl(g.league) ? (
                <Image resizeMode="contain" source={{ uri: getLeagueLogoUrl(g.league)! }} style={styles.leagueLogo} />
              ) : null}
              <AppText variant="bodyStrong">{g.league}</AppText>
            </View>
            <ListCard>
              {g.matches.map((m) => (
                <MatchRow key={m.providerMatchId} match={m} onPress={() => router.push({ pathname: '/jogo/[id]', params: { id: m.providerMatchId, league: g.slug } })} />
              ))}
            </ListCard>
          </Appear>
        ))
      )}
    </ScrollView>
  );
}

function MatchRow({ match: m, onPress }: { match: FootballMatch; onPress: () => void }) {
  const { colors } = useTheme();
  const live = isLive(m);
  const time = new Date(m.kickoffAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const left = live ? (m.status === 'HALFTIME' ? 'Int.' : m.statusDetail) : m.status === 'FINISHED' ? 'Fim' : m.status === 'POSTPONED' ? 'Adiado' : m.status === 'CANCELLED' ? 'Cancel.' : time;
  const showScore = m.score && (live || m.status === 'FINISHED');
  return (
    <ListRow accessibilityLabel={`${m.home.name} ${showScore ? `${m.score!.home} - ${m.score!.away}` : 'contra'} ${m.away.name}, ${left}`} onPress={onPress}>
      <View style={styles.time}>
        {live ? <LiveDot color={colors.live} size={7} /> : null}
        <AppText style={live ? { color: colors.live } : undefined} variant="label">{left}</AppText>
      </View>
      <View style={[styles.flex, styles.teams]}>
        <View style={styles.team}>
          <TeamBadge name={m.home.name} size={22} />
          <AppText numberOfLines={1} style={styles.flex} variant="body">{m.home.name}</AppText>
        </View>
        <View style={styles.team}>
          <TeamBadge name={m.away.name} size={22} />
          <AppText numberOfLines={1} style={styles.flex} variant="body">{m.away.name}</AppText>
        </View>
      </View>
      {showScore ? (
        <View style={styles.score}>
          <AppText variant="number">{m.score!.home}</AppText>
          <AppText variant="number">{m.score!.away}</AppText>
        </View>
      ) : null}
      {m.hasBet ? (
        <View accessibilityLabel="Tens aposta neste jogo" style={[styles.betDot, { backgroundColor: colors.primary }]} />
      ) : (
        <View style={styles.betDotSpacer} />
      )}
    </ListRow>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 20 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  days: { gap: 8, paddingVertical: 2 },
  day: { alignItems: 'center', borderRadius: 14, gap: 2, justifyContent: 'center', minHeight: 60, width: 56 },
  dayTop: { textTransform: 'capitalize' },
  onAccent: { color: '#FFFFFF' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, justifyContent: 'center', minHeight: 32, paddingHorizontal: 14 },
  group: { gap: 8 },
  time: { alignItems: 'center', gap: 4, width: 44 },
  teams: { gap: 6 },
  team: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  groupHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  leagueLogo: { height: 20, width: 20 },
  score: { alignItems: 'flex-end', gap: 2 },
  betDot: { borderRadius: 4, height: 8, width: 8 },
  betDotSpacer: { width: 8 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyBtn: { borderRadius: 14, marginTop: 6, paddingHorizontal: 18, paddingVertical: 12 },
});
