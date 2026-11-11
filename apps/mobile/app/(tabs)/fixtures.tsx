// Jogos — "Apostas" (every match the user bet on that day, any sport) plus football (followed
// leagues, UEFA and national teams), NBA and ATP/WTA tennis from ESPN, any day since 2020.
// Date navigator with a calendar, swipe left/right to change day, collapsible and sortable leagues,
// one elevated card per match.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Modal, PanResponder, Platform, RefreshControl, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from '../../components/ui/Pressable';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ItemResult } from '@betintel/shared';
import { AppText } from '../../components/ui/AppText';
import { CalendarPicker } from '../../components/ui/CalendarPicker';
import { Skeleton } from '../../components/ui/Skeleton';
import { useCardElevation } from '../../components/ui/ListCard';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { MatchCard, isLive, isDone, type AnyMatch } from '../../components/fixtures/MatchCard';
import { BetMatchCard } from '../../components/fixtures/BetMatchCard';
import { getCountryFlagUrl, getLeagueLogoUrl } from '../../utils/sportAssets';
import { useBasketballDay, useFootballDay, useTennisDay, type SportKey } from '../../services/sportsService';
import { useBoletins } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { hapticLight, hapticSelection } from '../../utils/haptics';
import { findMatchBet, indexBetsByDay, type MatchBet } from '../../utils/dayBets';
import { formatCurrency } from '../../utils/formatters';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

type Tab = 'bets' | SportKey;
type AnyGroup = { league: string; slug: string; matches: AnyMatch[] };
type SortMode = 'default' | 'bets' | 'az' | 'count';

const DAY_MS = 24 * 3600e3;
export const FIRST_DAY = new Date(2020, 0, 1);
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COLLAPSED_KEY = 'jogos:collapsed';
const SORT_KEY = 'jogos:sort';
const SORT_LABEL: Record<SortMode, string> = { default: 'Recomendado', bets: 'Com apostas primeiro', az: 'A–Z', count: 'Mais jogos' };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  const [tab, setTab] = useState<Tab>('bets');
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [liveOnly, setLiveOnly] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>('default');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.multiGet([COLLAPSED_KEY, SORT_KEY]).then(([[, c], [, s]]) => {
      if (c) setCollapsed(new Set(JSON.parse(c) as string[]));
      if (s && s in SORT_LABEL) setSort(s as SortMode);
    }).catch(() => undefined);
  }, []);
  const toggleLeague = (key: string) => {
    hapticSelection();
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  };
  const chooseSort = (s: SortMode) => {
    hapticSelection();
    setSort(s); setSortOpen(false);
    AsyncStorage.setItem(SORT_KEY, s).catch(() => undefined);
  };

  const iso = toIsoDate(day);
  const bets = tab === 'bets';
  const footballQuery = useFootballDay(iso, tab === 'football' || bets);
  const basketballQuery = useBasketballDay(iso, tab === 'basketball' || bets);
  const tennisQuery = useTennisDay(iso, tab === 'tennis' || bets);
  const queries = { football: footballQuery, basketball: basketballQuery, tennis: tennisQuery } as const;
  const dayQuery = bets ? footballQuery : queries[tab];

  const boletinsQuery = useBoletins();
  const betIndex = useMemo(() => indexBetsByDay(boletinsQuery.data ?? []), [boletinsQuery.data]);
  const betOf = useCallback(
    (m: AnyMatch): MatchBet | 'unknown' | null => findMatchBet(betIndex, m.kickoffAt, m.home.name, m.away.name) ?? (m.hasBet ? 'unknown' : null),
    [betIndex],
  );

  // ── Apostas: every match with a bet, all sports ──────────────────────────
  const betMatches = useMemo(() => {
    const out: Array<{ m: AnyMatch; sport: SportKey; league: string; slug: string; bet: MatchBet | 'unknown' }> = [];
    (['football', 'basketball', 'tennis'] as const).forEach((sp) => {
      for (const g of ((queries[sp].data?.groups ?? []) as AnyGroup[])) {
        for (const m of g.matches) {
          const b = betOf(m);
          if (b) out.push({ m, sport: sp, league: g.league, slug: g.slug, bet: b });
        }
      }
    });
    const rank = (m: AnyMatch) => (isLive(m) ? 0 : isDone(m) ? 2 : 1);
    return out.sort((a, b) => rank(a.m) - rank(b.m) || a.m.kickoffAt.localeCompare(b.m.kickoffAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footballQuery.data, basketballQuery.data, tennisQuery.data, betOf]);
  const betsLoading = footballQuery.isLoading || basketballQuery.isLoading || tennisQuery.isLoading;

  // ── Sport tabs ────────────────────────────────────────────────────────────
  const allGroups = (bets ? [] : (queries[tab].data?.groups ?? [])) as AnyGroup[];
  const groups = useMemo(() => {
    const list = allGroups
      .map((g) => ({ ...g, matches: g.matches.filter((m) => !liveOnly || isLive(m)) }))
      .filter((g) => g.matches.length > 0);
    const withBets = (g: AnyGroup) => g.matches.some((m) => betOf(m) !== null);
    if (sort === 'az') list.sort((a, b) => a.league.localeCompare(b.league));
    else if (sort === 'count') list.sort((a, b) => b.matches.length - a.matches.length);
    else if (sort === 'bets') list.sort((a, b) => Number(withBets(b)) - Number(withBets(a)));
    return list;
  }, [allGroups, liveOnly, sort, betOf]);
  const tabBets = useMemo(() => allGroups.flatMap((g) => g.matches.filter((m) => betOf(m) !== null)), [allGroups, betOf]);
  const liveCount = (bets ? betMatches.map((x) => x.m) : allGroups.flatMap((g) => g.matches)).filter(isLive).length;

  /** Direction of the last change (tab or day), so new content slides in from that side. */
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

  const tabs: TabDef[] = [
    { value: 'bets', label: 'Apostas', icon: (c) => <Ionicons color={c} name="receipt" size={20} />, badge: betMatches.length || undefined },
    { value: 'football', label: 'Futebol', icon: (c) => <Ionicons color={c} name="football" size={20} /> },
    { value: 'tennis', label: 'Ténis', icon: (c) => <MaterialCommunityIcons color={c} name="tennis" size={20} /> },
    { value: 'basketball', label: 'Basquetebol', icon: (c) => <Ionicons color={c} name="basketball" size={20} /> },
  ];
  const openMatch = (sp: SportKey, m: AnyMatch, slug: string) => () => {
    if (sp === 'football') router.push({ pathname: '/jogo/[id]', params: { id: m.providerMatchId, league: slug } });
    else if (sp === 'basketball') router.push({ pathname: '/jogo/nba/[id]', params: { id: m.providerMatchId } });
    else router.push({ pathname: '/jogo/tenis/[id]', params: { id: m.providerMatchId, date: iso } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TabBar
          onChange={(v) => {
            hapticLight();
            dirRef.current = tabs.findIndex((t) => t.value === v) > tabs.findIndex((t) => t.value === tab) ? 1 : -1;
            setTab(v); setLiveOnly(false);
          }}
          tabs={tabs}
          value={tab}
        />
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: liveOnly }}
          onPress={() => { hapticLight(); setLiveOnly((v) => !v); }}
          style={[styles.ctrl, { backgroundColor: liveOnly ? `${colors.live}26` : colors.surface }]}
        >
          <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
          <Text style={[styles.ctrlText, { color: liveOnly ? colors.live : colors.textSecondary }]}>{liveCount || ''}</Text>
        </Pressable>
        <View style={[styles.dateNav, { backgroundColor: colors.surface }]}>
          <Pressable accessibilityLabel="Dia anterior" hitSlop={8} onPress={() => shift(-1)} style={styles.navArrow}>
            <Ionicons color={colors.textPrimary} name="chevron-back" size={18} />
          </Pressable>
          <Pressable accessibilityHint="Abre o calendário" accessibilityRole="button" onPress={() => setCalendarOpen(true)} style={styles.dateCenter}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={14} />
            <Text numberOfLines={1} style={[styles.dateText, { color: isToday ? colors.primary : colors.textPrimary }]}>{dayTitle(day)}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Dia seguinte" hitSlop={8} onPress={() => shift(1)} style={styles.navArrow}>
            <Ionicons color={colors.textPrimary} name="chevron-forward" size={18} />
          </Pressable>
        </View>
        {!bets ? (
          <Pressable accessibilityLabel="Ordenar competições" accessibilityRole="button" onPress={() => setSortOpen(true)} style={[styles.ctrl, { backgroundColor: sort !== 'default' ? `${colors.primary}26` : colors.surface }]}>
            <Ionicons color={sort !== 'default' ? colors.primary : colors.textSecondary} name="swap-vertical" size={18} />
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="Pesquisar equipa" accessibilityRole="button" onPress={() => router.push('/equipa/pesquisa')} style={[styles.ctrl, { backgroundColor: colors.surface }]}>
            <Ionicons color={colors.textSecondary} name="search" size={18} />
          </Pressable>
        )}
      </View>

      <View style={styles.flex} {...swipe.panHandlers}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
          refreshControl={<RefreshControl onRefresh={() => { void footballQuery.refetch(); if (bets || tab === 'basketball') void basketballQuery.refetch(); if (bets || tab === 'tennis') void tennisQuery.refetch(); }} refreshing={dayQuery.isRefetching} tintColor={colors.primary} />}
        >
          <Animated.View entering={(dirRef.current > 0 ? FadeInRight : FadeInLeft).duration(240)} key={`${tab}-${iso}`} style={styles.groups}>
            {bets ? (
              betsLoading && betMatches.length === 0 ? (
                [0, 1].map((i) => <Skeleton height={190} key={i} width="100%" />)
              ) : (
                <>
                  <BetsSummary items={betMatches} />
                  {(liveOnly ? betMatches.filter((x) => isLive(x.m)) : betMatches).map((x, i) => (
                    <BetMatchCard bet={x.bet} index={i} key={`${x.sport}-${x.m.providerMatchId}`} league={x.league} match={x.m} onPress={openMatch(x.sport, x.m, x.slug)} sport={x.sport} />
                  ))}
                  {betMatches.length === 0 ? (
                    <Empty
                      action={() => router.push('/boletins/novo')}
                      actionLabel="Registar aposta"
                      icon="receipt-outline"
                      sub="Os jogos em que apostas aparecem aqui, de todos os desportos, com o estado de cada aposta."
                      title="Sem apostas neste dia"
                    />
                  ) : null}
                </>
              )
            ) : dayQuery.isLoading ? (
              [0, 1, 2].map((i) => <Skeleton height={76} key={i} width="100%" />)
            ) : dayQuery.isError ? (
              <Pressable onPress={() => void dayQuery.refetch()} style={[styles.errorCard, { backgroundColor: colors.surface }]}>
                <Ionicons color={colors.warning} name="cloud-offline-outline" size={22} />
                <AppText style={styles.flex} variant="bodyStrong">Não foi possível carregar. Toca para tentar outra vez.</AppText>
              </Pressable>
            ) : groups.length === 0 ? (
              <Empty
                icon="calendar-outline"
                sub={tab === 'football' ? 'Portugal, Inglaterra, Espanha, Alemanha, Itália, França, Países Baixos, Turquia, provas UEFA e seleções.' : tab === 'basketball' ? 'Jogos da NBA (horas de Portugal).' : 'Torneios ATP e WTA, singulares.'}
                title={liveOnly ? 'Nenhum jogo a decorrer' : 'Sem jogos neste dia'}
              />
            ) : (
              <>
                {tabBets.length > 0 ? <BetsBanner count={tabBets.length} items={tabBets.map(betOf)} onPress={() => { dirRef.current = -1; setTab('bets'); }} /> : null}
                {groups.map((g) => {
                  const key = `${tab}:${g.league}`;
                  const isCollapsed = collapsed.has(key);
                  const betCount = g.matches.filter((m) => betOf(m) !== null).length;
                  return (
                    <View key={g.slug} style={styles.section}>
                      <LeagueHeader betCount={betCount} collapsed={isCollapsed} count={g.matches.length} league={g.league} live={g.matches.filter(isLive).length} onPress={() => toggleLeague(key)} sport={tab} />
                      {!isCollapsed ? (
                        <View style={styles.matches}>
                          {g.matches.map((m, i) => (
                            <MatchCard bet={betOf(m)} index={i} key={m.providerMatchId} match={m} onPress={openMatch(tab, m, g.slug)} sport={tab} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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

      <Modal animationType="fade" onRequestClose={() => setSortOpen(false)} transparent visible={sortOpen}>
        <Pressable feedback="none" onPress={() => setSortOpen(false)} style={styles.sheetBackdrop}>
          <Animated.View entering={FadeInDown.duration(220)} style={[styles.sortSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.sortTitle, { color: colors.textPrimary }]}>Ordenar competições</Text>
            {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
              <Pressable key={s} onPress={() => chooseSort(s)} style={[styles.sortRow, { backgroundColor: sort === s ? `${colors.primary}1F` : 'transparent' }]}>
                <Text style={[styles.sortLabel, { color: sort === s ? colors.primary : colors.textPrimary }]}>{SORT_LABEL[s]}</Text>
                {sort === s ? <Ionicons color={colors.primary} name="checkmark" size={18} /> : null}
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                const keys = groups.map((g) => `${tab}:${g.league}`);
                const allClosed = keys.every((k) => collapsed.has(k));
                LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
                const next = new Set(collapsed);
                keys.forEach((k) => (allClosed ? next.delete(k) : next.add(k)));
                setCollapsed(next);
                AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])).catch(() => undefined);
                setSortOpen(false);
              }}
              style={[styles.sortRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>
                {groups.every((g) => collapsed.has(`${tab}:${g.league}`)) ? 'Expandir todas' : 'Recolher todas'}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

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

type TabDef = { value: Tab; label: string; icon: (c: string) => React.ReactNode; badge?: number };

/** Tabs with the icon above the label; a tinted thumb springs under the selected one. */
function TabBar({ tabs, value, onChange }: { tabs: TabDef[]; value: Tab; onChange: (v: Tab) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  const slot = width / tabs.length;
  const x = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (!slot) return;
    x.value = first.current ? index * slot : withSpring(index * slot, { damping: 20, mass: 0.7, stiffness: 240 });
    first.current = false;
  }, [index, slot, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: slot }));
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)} style={[styles.tabBar, { backgroundColor: colors.surface }]}>
      {slot ? <Animated.View pointerEvents="none" style={[styles.thumb, thumb, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}55` }]} /> : null}
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <Pressable accessibilityLabel={t.label} accessibilityRole="tab" accessibilityState={{ selected: active }} feedback="none" key={t.value} onPress={() => { if (!active) onChange(t.value); }} style={styles.tabItem}>
            <View>
              {t.icon(active ? colors.primary : colors.textMuted)}
              {t.badge ? <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{t.badge}</Text></View> : null}
            </View>
            <Text numberOfLines={1} style={[styles.tabLabel, { color: active ? colors.textPrimary : colors.textMuted }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Day summary at the top of "Apostas": counts by state and the settled profit. */
function BetsSummary({ items }: { items: Array<{ m: AnyMatch; bet: MatchBet | 'unknown' }> }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  if (items.length === 0) return null;
  const known = items.map((x) => x.bet).filter((b): b is MatchBet => b !== 'unknown');
  const won = known.filter((b) => b.result === ItemResult.WON).length;
  const lost = known.filter((b) => b.result === ItemResult.LOST).length;
  const live = items.filter((x) => isLive(x.m)).length;
  const pending = items.length - won - lost;
  // Each boletim counted once.
  const seen = new Set<string>();
  const profit = known.reduce((sum, b) => (b.profit === null || seen.has(b.boletinId) ? sum : (seen.add(b.boletinId), sum + b.profit)), 0);
  const stat = (n: number, label: string, color: string) => (
    <View style={styles.sumStat}>
      <Text style={[styles.sumValue, { color }]}>{n}</Text>
      <Text style={[styles.sumLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.sumWrap, elevation]}>
      <LinearGradient colors={[colors.heroFrom, colors.heroTo]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.sumCard}>
        <View style={styles.sumTop}>
          <Text style={[styles.sumTitle, { color: colors.heroText }]}>{items.length} jogo{items.length > 1 ? 's' : ''} com aposta</Text>
          {seen.size > 0 ? <Text style={[styles.sumProfit, { color: profit >= 0 ? colors.heroPositive : colors.heroNegative }]}>{profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(profit))}</Text> : null}
        </View>
        <View style={styles.sumStats}>
          {stat(won, 'certas', colors.heroPositive)}
          {stat(lost, 'falhadas', colors.heroNegative)}
          {stat(live, 'ao vivo', colors.live)}
          {stat(Math.max(pending - live, 0), 'por jogar', colors.heroText)}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

/** Compact link from a sport tab to "Apostas": crests of the bet matches and their states. */
function BetsBanner({ count, items, onPress }: { count: number; items: Array<MatchBet | 'unknown' | null>; onPress: () => void }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const won = items.filter((b) => b && b !== 'unknown' && b.result === ItemResult.WON).length;
  const lost = items.filter((b) => b && b !== 'unknown' && b.result === ItemResult.LOST).length;
  return (
    <Pressable onPress={onPress} style={[styles.banner, elevation, { backgroundColor: colors.surface, borderColor: `${colors.primary}55` }]}>
      <View style={[styles.bannerIcon, { backgroundColor: colors.primary }]}><Ionicons color="#06110B" name="receipt" size={16} /></View>
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>As tuas apostas · {count}</Text>
        <Text style={[styles.bannerSub, { color: colors.textMuted }]}>{[won ? `${won} certa${won > 1 ? 's' : ''}` : '', lost ? `${lost} falhada${lost > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Ver o estado de cada uma'}</Text>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function LeagueHeader({ league, sport, count, live, betCount, collapsed, onPress }: { league: string; sport: SportKey; count: number; live: number; betCount: number; collapsed: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [tour, tournament] = sport === 'tennis' && league.includes(' · ') ? league.split(' · ') as [string, string] : [null, league];
  const title = tournament ?? league;
  const sub = sport === 'tennis' ? tour : sport === 'basketball' ? 'EUA' : LEAGUE_COUNTRY[league] ?? (/^UEFA|Europeu|Liga das Nações/.test(league) ? 'Europa' : 'Mundo');
  const logo = getLeagueLogoUrl(title) ?? getLeagueLogoUrl(league);
  const flag = sub ? getCountryFlagUrl(sub) : null;
  const rot = useSharedValue(collapsed ? -90 : 0);
  useEffect(() => { rot.value = withTiming(collapsed ? -90 : 0, { duration: 200 }); }, [collapsed, rot]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} feedback="none" onPress={onPress} style={styles.leagueHead}>
      {logo ? <Image cachePolicy="memory-disk" contentFit="contain" source={{ uri: logo }} style={styles.leagueLogo} /> : (
        <View style={[styles.leagueLogo, styles.leagueLogoFallback, { backgroundColor: colors.surface }]}><Ionicons color={colors.textSecondary} name="trophy-outline" size={16} /></View>
      )}
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.leagueName, { color: colors.textPrimary }]}>{title}</Text>
        <View style={styles.leagueSub}>
          {flag ? <Image cachePolicy="memory-disk" contentFit="contain" source={{ uri: flag }} style={styles.flag} /> : null}
          <Text style={[styles.leagueMeta, { color: colors.textMuted }]}>{sub}</Text>
        </View>
      </View>
      {live > 0 ? <View style={[styles.countPill, { backgroundColor: `${colors.live}22` }]}><Text style={[styles.countText, { color: colors.live }]}>{live} ao vivo</Text></View> : null}
      {betCount > 0 ? <View style={[styles.countPill, { backgroundColor: `${colors.primary}22` }]}><Ionicons color={colors.primary} name="receipt" size={11} /><Text style={[styles.countText, { color: colors.primary }]}>{betCount}</Text></View> : null}
      <Text style={[styles.leagueMeta, { color: colors.textMuted }]}>{count}</Text>
      <Animated.View style={chevron}><Ionicons color={colors.textMuted} name="chevron-down" size={18} /></Animated.View>
    </Pressable>
  );
}

function Empty({ icon, title, sub, action, actionLabel }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; action?: () => void; actionLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons color={colors.textMuted} name={icon} size={40} />
      <AppText variant="heading">{title}</AppText>
      <AppText style={styles.center} variant="caption">{sub}</AppText>
      {action ? (
        <Pressable onPress={action} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.emptyBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : <AppText style={styles.center} variant="caption">Desliza para os lados para mudar de dia.</AppText>}
    </View>
  );
}

// TeamBadge is used by the cards; kept imported for the crest cache warm-up on this screen.
void TeamBadge;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: { paddingBottom: 4, paddingHorizontal: 16, paddingTop: 8 },
  tabBar: { borderRadius: 16, flexDirection: 'row', padding: 4 },
  thumb: { borderRadius: 12, borderWidth: 1, bottom: 4, left: 4, position: 'absolute', top: 4 },
  tabItem: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', paddingVertical: 8 },
  tabLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  badge: { alignItems: 'center', borderRadius: 8, height: 16, justifyContent: 'center', minWidth: 16, paddingHorizontal: 3, position: 'absolute', right: -12, top: -6 },
  badgeText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 10 },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  ctrl: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 5, height: 44, justifyContent: 'center', minWidth: 44, paddingHorizontal: 10 },
  ctrlText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  liveDot: { borderRadius: 4, height: 8, width: 8 },
  dateNav: { alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', height: 44 },
  navArrow: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 },
  dateCenter: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dateText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  content: { paddingHorizontal: 16 },
  groups: { gap: 14 },
  section: { gap: 8 },
  matches: { gap: 8 },
  errorCard: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 10, padding: 16 },
  leagueHead: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  leagueLogo: { height: 30, width: 30 },
  leagueLogoFallback: { alignItems: 'center', borderRadius: 8, justifyContent: 'center' },
  leagueName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  leagueSub: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 1 },
  leagueMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  flag: { borderRadius: 2, height: 10, width: 14 },
  countPill: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  sumWrap: { borderRadius: 22 },
  sumCard: { borderRadius: 22, gap: 14, padding: 16 },
  sumTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sumTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  sumProfit: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 },
  sumStats: { flexDirection: 'row', gap: 8 },
  sumStat: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, flex: 1, gap: 1, paddingVertical: 8 },
  sumValue: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  sumLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  banner: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  bannerIcon: { alignItems: 'center', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  bannerTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  bannerSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 48 },
  emptyBtn: { borderRadius: 14, marginTop: 6, paddingHorizontal: 18, paddingVertical: 12 },
  emptyBtnText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 14 },
  todayBtn: { alignItems: 'center', alignSelf: 'center', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 18, paddingVertical: 10, position: 'absolute' },
  todayText: { color: '#FFFFFF' },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' },
  sortSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 4, padding: 16 },
  sortTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 8, paddingHorizontal: 8 },
  sortRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 12 },
  sortLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
