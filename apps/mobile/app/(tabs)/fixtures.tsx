// Jogos — football (followed leagues, UEFA and national teams), NBA and ATP/WTA tennis from ESPN,
// any day since 2020. Sofascore-like layout: sport tabs, date navigator with a calendar, swipe
// left/right to change day, league cards with crest, status column, winner in bold.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppText } from '../../components/ui/AppText';
import { CalendarPicker } from '../../components/ui/CalendarPicker';
import { Skeleton } from '../../components/ui/Skeleton';
import { LiveDot } from '../../components/ui/Appear';
import { useCardElevation } from '../../components/ui/ListCard';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { getCountryFlagUrl, getLeagueLogoUrl } from '../../utils/sportAssets';
import { useBasketballDay, useFootballDay, useTennisDay, type FootballMatch, type SimpleMatch, type SportKey } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';
import { useBoletins } from '../../services/boletinService';
import { findMatchBet, indexBetsByDay, type MatchBet } from '../../utils/dayBets';
import { formatCurrency } from '../../utils/formatters';
import { ItemResult } from '@betintel/shared';

type AnyMatch = FootballMatch | SimpleMatch;
type AnyGroup = { league: string; slug: string; matches: AnyMatch[] };

const DAY_MS = 24 * 3600e3;
const SWITCH_PAD = 3;
export const FIRST_DAY = new Date(2020, 0, 1);
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isLive = (m: { status: string }) => m.status === 'LIVE' || m.status === 'HALFTIME';
const isDone = (m: { status: string }) => m.status === 'FINISHED' || m.status === 'RETIRED' || m.status === 'WALKOVER';

/** Country line under the league name (flag + name), Sofascore-style. */
const LEAGUE_COUNTRY: Record<string, string> = {
  'Liga Portugal Betclic': 'Portugal', 'Premier League': 'Inglaterra', 'La Liga': 'Espanha', Bundesliga: 'Alemanha',
  'Serie A': 'Itália', 'Ligue 1': 'França', Eredivisie: 'Holanda', 'Süper Lig': 'Turquia',
};

function dayTitle(d: Date): string {
  const today = startOfDay(new Date()).getTime();
  const diff = Math.round((startOfDay(d).getTime() - today) / DAY_MS);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  if (diff === 1) return 'Amanhã';
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}${year}`;
}

export default function JogosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const [sport, setSport] = useState<SportKey>('football');
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [liveOnly, setLiveOnly] = useState(false);
  const [betsOnly, setBetsOnly] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const iso = toIsoDate(day);
  const footballQuery = useFootballDay(iso, sport === 'football');
  const basketballQuery = useBasketballDay(iso, sport === 'basketball');
  const tennisQuery = useTennisDay(iso, sport === 'tennis');
  const dayQuery = sport === 'football' ? footballQuery : sport === 'basketball' ? basketballQuery : tennisQuery;
  const allGroups = (dayQuery.data?.groups ?? []) as AnyGroup[];
  // The user's bets on listed matches, from the cached boletins (no extra request).
  const boletinsQuery = useBoletins();
  const betIndex = useMemo(() => indexBetsByDay(boletinsQuery.data ?? []), [boletinsQuery.data]);
  const betOf = useCallback(
    (m: AnyMatch): MatchBet | 'unknown' | null => findMatchBet(betIndex, m.kickoffAt, m.home.name, m.away.name) ?? (m.hasBet ? 'unknown' : null),
    [betIndex],
  );
  const groups = useMemo(() => allGroups
    .map((g) => ({ ...g, matches: g.matches.filter((m) => (!liveOnly || isLive(m)) && (!betsOnly || betOf(m) !== null)) }))
    .filter((g) => g.matches.length > 0), [allGroups, liveOnly, betsOnly, betOf]);
  const myMatches = useMemo(
    () => allGroups.flatMap((g) => g.matches.filter((m) => betOf(m) !== null).map((m) => ({ m, slug: g.slug }))),
    [allGroups, betOf],
  );
  const liveCount = allGroups.reduce((n, g) => n + g.matches.filter(isLive).length, 0);

  /** Direction of the last change (sport or day), so new content slides in from that side. */
  const dirRef = useRef<1 | -1>(1);
  const today = startOfDay(new Date());
  const isToday = day.getTime() === today.getTime();
  const shift = (n: number) => {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
    if (next < FIRST_DAY) return;
    hapticLight();
    dirRef.current = n > 0 ? 1 : -1;
    setDay(next);
  };
  // Swipe left → next day, swipe right → previous day. Captured before the rows' presses once the
  // movement is clearly horizontal, so a swipe never opens a match.
  const shiftRef = useRef(shift);
  shiftRef.current = shift;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_e, g) => {
      if (g.dx < -60) shiftRef.current(1);
      else if (g.dx > 60) shiftRef.current(-1);
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const tabs: SportTab[] = [
    { value: 'football', label: 'Futebol', icon: (c) => <Ionicons color={c} name="football" size={18} /> },
    { value: 'tennis', label: 'Ténis', icon: (c) => <MaterialCommunityIcons color={c} name="tennis" size={18} /> },
    { value: 'basketball', label: 'Basquetebol', icon: (c) => <Ionicons color={c} name="basketball" size={18} /> },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header: sliding sport switcher + search */}
      <View style={styles.header}>
        <SportSwitcher
          onChange={(v) => {
            hapticLight();
            dirRef.current = tabs.findIndex((t) => t.value === v) > tabs.findIndex((t) => t.value === sport) ? 1 : -1;
            setSport(v); setLiveOnly(false); setBetsOnly(false);
          }}
          tabs={tabs}
          value={sport}
        />
        <Pressable
          accessibilityLabel="Pesquisar equipa"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/equipa/pesquisa')}
          style={[styles.searchBtn, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.textPrimary} name="search" size={20} />
        </Pressable>
      </View>

      {/* Controls: live, with bet, date navigator */}
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: liveOnly }}
          onPress={() => { hapticLight(); setLiveOnly((v) => !v); }}
          style={[styles.pill, { borderColor: colors.live, backgroundColor: liveOnly ? `${colors.live}26` : 'transparent' }]}
        >
          <AppText style={{ color: colors.live, fontWeight: '700' }} variant="label">Ao vivo{liveCount ? ` ${liveCount}` : ''}</AppText>
          <View style={[styles.liveRing, { borderColor: colors.live }]} />
        </Pressable>
        <Pressable
          accessibilityLabel="Só jogos com aposta"
          accessibilityRole="button"
          accessibilityState={{ selected: betsOnly }}
          onPress={() => { hapticLight(); setBetsOnly((v) => !v); }}
          style={[styles.pill, styles.iconPill, { borderColor: betsOnly ? colors.primary : colors.surfaceRaised, backgroundColor: betsOnly ? `${colors.primary}26` : colors.surface }]}
        >
          <Ionicons color={betsOnly ? colors.primary : colors.textSecondary} name="receipt-outline" size={16} />
        </Pressable>
        <View style={[styles.dateNav, { backgroundColor: colors.surface }]}>
          <Pressable accessibilityLabel="Dia anterior" hitSlop={8} onPress={() => shift(-1)} style={styles.navArrow}>
            <Ionicons color={colors.accentText} name="chevron-back" size={20} />
          </Pressable>
          <Pressable accessibilityHint="Abre o calendário" accessibilityRole="button" onPress={() => setCalendarOpen(true)} style={styles.dateCenter}>
            <AppText numberOfLines={1} style={isToday ? { color: colors.accentText } : undefined} variant="bodyStrong">{dayTitle(day)}</AppText>
          </Pressable>
          <Pressable accessibilityLabel="Dia seguinte" hitSlop={8} onPress={() => shift(1)} style={styles.navArrow}>
            <Ionicons color={colors.accentText} name="chevron-forward" size={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.flex} {...swipe.panHandlers}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
          refreshControl={<RefreshControl onRefresh={() => void dayQuery.refetch()} refreshing={dayQuery.isRefetching} tintColor={colors.primary} />}
        >
          <Animated.View
            entering={(dirRef.current > 0 ? FadeInRight : FadeInLeft).duration(240)}
            key={`${sport}-${iso}`}
            style={styles.groups}
          >
            {dayQuery.isLoading ? (
              [0, 1].map((i) => <View key={i} style={[styles.card, { backgroundColor: colors.surface }]}><Skeleton height={120} width="100%" /></View>)
            ) : dayQuery.isError ? (
              <Pressable onPress={() => void dayQuery.refetch()} style={[styles.card, styles.row, { backgroundColor: colors.surface }]}>
                <Ionicons color={colors.warning} name="cloud-offline-outline" size={22} />
                <AppText style={styles.flex} variant="bodyStrong">Não foi possível carregar. Toca para tentar outra vez.</AppText>
              </Pressable>
            ) : groups.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons color={colors.textMuted} name="calendar-outline" size={40} />
                <AppText variant="heading">{liveOnly ? 'Nenhum jogo a decorrer' : betsOnly ? 'Sem jogos com aposta neste dia' : 'Sem jogos neste dia'}</AppText>
                <AppText style={styles.center} variant="caption">
                  {sport === 'football'
                    ? 'Portugal, Inglaterra, Espanha, Alemanha, Itália, França, Países Baixos, Turquia, provas UEFA e seleções.'
                    : sport === 'basketball' ? 'Jogos da NBA (horas de Portugal).' : 'Torneios ATP e WTA, singulares.'}
                </AppText>
                <AppText style={styles.center} variant="caption">Desliza para os lados para mudar de dia.</AppText>
              </View>
            ) : (
              <>
                {myMatches.length > 0 && !betsOnly ? (
                  <View style={[styles.card, elevation, styles.myCard, { backgroundColor: colors.surface, borderColor: `${colors.primary}40` }]}>
                    <View style={styles.myHead}>
                      <View style={[styles.myIcon, { backgroundColor: colors.primary }]}><Ionicons color="#06110B" name="receipt" size={13} /></View>
                      <AppText style={styles.flex} variant="bodyStrong">As tuas apostas</AppText>
                      <MyBetsSummary bets={myMatches.map(({ m }) => betOf(m))} />
                    </View>
                    {myMatches.map(({ m, slug }, i) => (
                      <MatchRow
                        bet={betOf(m)}
                        index={i}
                        key={`my-${m.providerMatchId}`}
                        match={m}
                        onPress={sport === 'football' ? () => router.push({ pathname: '/jogo/[id]', params: { id: m.providerMatchId, league: slug } }) : undefined}
                        sport={sport}
                      />
                    ))}
                  </View>
                ) : null}
                {groups.map((g) => (
                  <View key={g.slug} style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
                    <LeagueHeader league={g.league} sport={sport} />
                    {g.matches.map((m, i) => (
                      <MatchRow
                        bet={betOf(m)}
                        index={i}
                        key={m.providerMatchId}
                        match={m}
                        onPress={sport === 'football' ? () => router.push({ pathname: '/jogo/[id]', params: { id: m.providerMatchId, league: g.slug } }) : undefined}
                        sport={sport}
                      />
                    ))}
                  </View>
                ))}
              </>
            )}
          </Animated.View>
        </ScrollView>
      </View>

      {!isToday ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { hapticLight(); dirRef.current = day > today ? -1 : 1; setDay(today); }}
          style={[styles.todayBtn, { backgroundColor: colors.accent, bottom: insets.bottom + 96 }]}
        >
          {day > today ? <Ionicons color="#FFFFFF" name="chevron-back" size={16} /> : null}
          <AppText style={styles.todayText} variant="bodyStrong">Hoje</AppText>
          {day < today ? <Ionicons color="#FFFFFF" name="chevron-forward" size={16} /> : null}
        </Pressable>
      ) : null}

      <CalendarPicker
        maxDate={new Date(today.getTime() + 60 * DAY_MS)}
        minDate={FIRST_DAY}
        onClose={() => setCalendarOpen(false)}
        onSelect={(d) => { dirRef.current = startOfDay(d) > day ? 1 : -1; setDay(startOfDay(d)); setCalendarOpen(false); }}
        selected={day}
        visible={calendarOpen}
      />
    </View>
  );
}

type SportTab = { value: SportKey; label: string; icon: (c: string) => React.ReactNode };

/**
 * Segmented sport switcher: a tinted thumb springs under the selected sport, and the icon and
 * label colours cross-fade, instead of a static underline jumping between tabs.
 */
function SportSwitcher({ tabs, value, onChange }: { tabs: SportTab[]; value: SportKey; onChange: (v: SportKey) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  const slot = width / tabs.length;
  const x = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (!slot) return;
    // Jump into place on first layout, spring afterwards.
    x.value = first.current ? index * slot : withSpring(index * slot, { damping: 20, mass: 0.7, stiffness: 240 });
    first.current = false;
  }, [index, slot, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: slot }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - SWITCH_PAD * 2)}
      style={[styles.switcher, { backgroundColor: colors.surface }]}
    >
      {slot ? <Animated.View pointerEvents="none" style={[styles.switchThumb, thumb, { backgroundColor: `${colors.primary}26`, borderColor: `${colors.primary}55` }]} /> : null}
      {tabs.map((t) => {
        const active = t.value === value;
        const c = active ? colors.primary : colors.textMuted;
        return (
          <Pressable
            accessibilityLabel={t.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={t.value}
            onPress={() => { if (!active) onChange(t.value); }}
            style={styles.switchTab}
          >
            {t.icon(c)}
            <AppText numberOfLines={1} style={[styles.switchLabel, { color: active ? colors.textPrimary : colors.textMuted }]}>{t.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function LeagueHeader({ league, sport }: { league: string; sport: SportKey }) {
  const { colors } = useTheme();
  // Tennis groups come as "ATP · Tournament".
  const [tour, tournament] = sport === 'tennis' && league.includes(' · ') ? league.split(' · ') as [string, string] : [null, league];
  const title = tournament ?? league;
  const sub = sport === 'tennis' ? tour : sport === 'basketball' ? 'EUA' : LEAGUE_COUNTRY[league] ?? (/^UEFA|Europeu|Liga das Nações/.test(league) ? 'Europa' : 'Mundo');
  const logo = getLeagueLogoUrl(title) ?? getLeagueLogoUrl(league);
  const flag = sub ? getCountryFlagUrl(sub) : null;
  return (
    <View style={styles.leagueHead}>
      {logo ? <Image cachePolicy="memory-disk" contentFit="contain" source={{ uri: logo }} style={styles.leagueLogo} /> : (
        <View style={[styles.leagueLogo, styles.leagueLogoFallback, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons color={colors.textSecondary} name="trophy-outline" size={18} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText numberOfLines={1} variant="bodyStrong">{title}</AppText>
        {sub ? (
          <View style={styles.row}>
            {flag ? <Image cachePolicy="memory-disk" contentFit="contain" source={{ uri: flag }} style={styles.flag} /> : null}
            <AppText variant="caption">{sub}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "2 certas · 1 em jogo" for the pinned card. */
function MyBetsSummary({ bets }: { bets: Array<MatchBet | 'unknown' | null> }) {
  const { colors } = useTheme();
  const known = bets.filter((b): b is MatchBet => b !== null && b !== 'unknown');
  const won = known.filter((b) => b.result === ItemResult.WON).length;
  const lost = known.filter((b) => b.result === ItemResult.LOST).length;
  const pending = known.filter((b) => b.result === ItemResult.PENDING).length;
  const parts = [won ? `${won} certa${won > 1 ? 's' : ''}` : '', lost ? `${lost} falhada${lost > 1 ? 's' : ''}` : '', pending ? `${pending} em jogo` : ''].filter(Boolean);
  return <AppText style={{ color: won > lost ? colors.positive : lost > won ? colors.negative : colors.textSecondary, fontWeight: '700' }} variant="caption">{parts.join(' · ') || `${bets.length}`}</AppText>;
}

function MatchRow({ match: m, onPress, sport, bet, index = 0 }: { match: AnyMatch; onPress?: () => void; sport: SportKey; bet: MatchBet | 'unknown' | null; index?: number }) {
  const { colors } = useTheme();
  const live = isLive(m);
  const done = isDone(m);
  const kick = new Date(m.kickoffAt);
  const time = kick.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const date = `${String(kick.getDate()).padStart(2, '0')}/${String(kick.getMonth() + 1).padStart(2, '0')}/${String(kick.getFullYear()).slice(2)}`;
  const status = live
    ? (m.status === 'HALFTIME' ? 'Int.' : sport === 'tennis' ? 'Ao vivo' : m.statusDetail)
    : done ? (m.status === 'RETIRED' ? 'Desist.' : m.status === 'WALKOVER' ? 'W.O.' : 'FT')
      : m.status === 'POSTPONED' ? 'Adiado' : m.status === 'CANCELLED' ? 'Cancel.' : time;
  const variant = sport === 'tennis' ? 'player' : 'team';
  const red = 'redCards' in m ? m.redCards : null;
  const line = 'line' in m ? m.line : null;
  // NBA: away team first, "@ Home" second (US convention, like Sofascore).
  const top = sport === 'basketball' ? { name: m.away.name, score: m.score?.away, other: m.score?.home, reds: 0 } : { name: m.home.name, score: m.score?.home, other: m.score?.away, reds: red?.home ?? 0 };
  const bottom = sport === 'basketball' ? { name: m.home.name, score: m.score?.home, other: m.score?.away, reds: 0, at: true } : { name: m.away.name, score: m.score?.away, other: m.score?.home, reds: red?.away ?? 0, at: false };
  const showScore = m.score && (live || done);

  const side = (s: typeof top & { at?: boolean }) => {
    const won = done && s.score !== undefined && s.other !== undefined && s.score > s.other;
    const lost = done && s.score !== undefined && s.other !== undefined && s.score < s.other;
    return (
      <View style={styles.side}>
        <TeamBadge name={s.name} size={22} variant={variant} />
        <AppText numberOfLines={1} style={[styles.teamName, { color: lost ? colors.textSecondary : colors.textPrimary, fontWeight: won ? '700' : '500' }]}>
          {s.at ? '@ ' : ''}{s.name}
        </AppText>
        {s.reds > 0 ? <View style={[styles.redCard, { backgroundColor: colors.live }]} /> : null}
        {showScore ? (
          <AppText style={[styles.score, { color: live ? colors.live : lost ? colors.textSecondary : colors.textPrimary, fontWeight: won || live ? '800' : '600' }]} variant="number">{s.score}</AppText>
        ) : null}
      </View>
    );
  };

  const known = bet && bet !== 'unknown' ? bet : null;
  const betTone = !bet ? 'transparent'
    : known?.result === ItemResult.WON ? colors.positive
    : known?.result === ItemResult.LOST ? colors.negative
    : live ? colors.info : colors.warning;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 30).duration(240)}>
    <Pressable
      accessibilityLabel={`${m.home.name} ${showScore ? `${m.score!.home} - ${m.score!.away}` : 'contra'} ${m.away.name}, ${status}${bet ? ', tens aposta' : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.matchRow, bet ? { backgroundColor: `${betTone}0F` } : null, pressed && { backgroundColor: colors.surfaceRaised }]}
    >
      {bet ? <View style={[styles.betBar, { backgroundColor: betTone }]} /> : null}
      <View style={styles.statusCol}>
        <AppText style={styles.dateText} variant="caption">{date}</AppText>
        <View style={styles.row}>
          {live ? <LiveDot color={colors.live} size={6} /> : null}
          <AppText style={[styles.statusText, { color: live ? colors.live : m.status === 'POSTPONED' || m.status === 'CANCELLED' ? colors.negative : colors.textSecondary }]} variant="caption">{status}</AppText>
        </View>
      </View>
      <View style={styles.teams}>
        {side(top)}
        {side(bottom)}
        {sport === 'tennis' && line ? <AppText numberOfLines={1} variant="caption">{line}</AppText> : null}
        {known ? (
          <View style={[styles.betChip, { backgroundColor: colors.surfaceRaised }]}>
            <View style={[styles.betDot, { backgroundColor: betTone }]} />
            <AppText numberOfLines={1} style={styles.betChipText} variant="caption">{known.selection} · {known.odd.toFixed(2)}{known.legs > 1 ? ` · múltipla ${known.wonLegs}/${known.legs}` : ''}</AppText>
          </View>
        ) : null}
      </View>
      {bet ? (
        <View style={styles.sealCol}>
          <View style={[styles.seal, { backgroundColor: known?.result === ItemResult.PENDING || !known ? `${betTone}2E` : betTone }]}>
            {known?.result === ItemResult.WON ? <Ionicons color="#06110B" name="checkmark" size={14} />
              : known?.result === ItemResult.LOST ? <Ionicons color="#2A0E14" name="close" size={14} />
              : <Ionicons color={betTone} name="receipt" size={12} />}
          </View>
          {known && known.profit !== null && known.legs === 1 ? (
            <AppText style={[styles.sealText, { color: known.profit >= 0 ? colors.positive : colors.negative }]} variant="caption">
              {known.profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(known.profit)).replace(/,00(?=\s?€)/, '')}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingBottom: 6, paddingHorizontal: 16, paddingTop: 8 },
  switcher: { borderRadius: 14, flex: 1, flexDirection: 'row', height: 46, padding: SWITCH_PAD },
  switchThumb: { borderRadius: 11, borderWidth: 1, bottom: SWITCH_PAD, left: SWITCH_PAD, position: 'absolute', top: SWITCH_PAD },
  switchTab: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', paddingHorizontal: 2 },
  switchLabel: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  searchBtn: { alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  pill: { alignItems: 'center', borderRadius: 999, borderWidth: 1.5, flexDirection: 'row', gap: 6, height: 40, paddingHorizontal: 14 },
  iconPill: { paddingHorizontal: 12 },
  liveRing: { borderRadius: 6, borderWidth: 1.5, height: 11, width: 11 },
  dateNav: { alignItems: 'center', borderRadius: 999, flex: 1, flexDirection: 'row', height: 40 },
  navArrow: { alignItems: 'center', height: 40, justifyContent: 'center', width: 36 },
  dateCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 12 },
  groups: { gap: 12 },
  card: { borderRadius: 22, overflow: 'hidden', paddingVertical: 6 },
  leagueHead: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  leagueLogo: { height: 40, width: 40 },
  leagueLogoFallback: { alignItems: 'center', borderRadius: 10, justifyContent: 'center' },
  flag: { borderRadius: 3, height: 13, width: 18 },
  matchRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  betBar: { bottom: 6, borderRadius: 2, left: 4, position: 'absolute', top: 6, width: 3 },
  betChip: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 7, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3 },
  betDot: { borderRadius: 3, height: 6, width: 6 },
  betChipText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  sealCol: { alignItems: 'center', gap: 3, width: 46 },
  seal: { alignItems: 'center', borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  sealText: { fontSize: 10, fontWeight: '800' },
  myCard: { borderWidth: 1 },
  myHead: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  myIcon: { alignItems: 'center', borderRadius: 7, height: 24, justifyContent: 'center', width: 24 },
  statusCol: { alignItems: 'center', gap: 6, width: 62 },
  dateText: { fontSize: 11 },
  statusText: { fontSize: 12, fontWeight: '600' },
  teams: { flex: 1, gap: 8 },
  side: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  teamName: { flexShrink: 1, fontSize: 15 },
  redCard: { borderRadius: 2, height: 14, width: 10 },
  score: { fontSize: 16, marginLeft: 'auto', marginRight: 14, minWidth: 22, textAlign: 'right' },
  betCol: { alignItems: 'center', width: 34 },
  betIcon: { alignItems: 'center', borderRadius: 17, borderWidth: 1.5, height: 32, justifyContent: 'center', width: 32 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 40 },
  todayBtn: { alignItems: 'center', alignSelf: 'center', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 22, paddingVertical: 12, position: 'absolute' },
  todayText: { color: '#FFFFFF' },
});
