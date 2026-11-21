import React, { useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '../ui/AppText';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pressable } from '../ui/Pressable';
import { Skeleton } from '../ui/Skeleton';
import { useTheme } from '../../theme/useTheme';
import { useOddsDay } from '../../services/oddsService';
import { lisbonDay } from '../../utils/odds/format';
import { pickFeatured } from '../../utils/odds/featured';
import { flagUrlForCode } from '../../utils/odds/flags';
import { competitionsByCount } from '../../utils/odds/list';
import { applyFilters, matchesQuery, normalizeText } from '../../utils/odds/search';
import type { OddsEventListItem, OddsSport } from '../../utils/odds/types';
import { OddsEventCard } from './OddsEventCard';
import { SlipBar } from './SlipBar';

const SPORTS: Array<{ value: OddsSport; label: string; icon: 'soccer' | 'tennis' | 'basketball' }> = [
  { value: 'FOOTBALL', label: 'Futebol', icon: 'soccer' },
  { value: 'TENNIS', label: 'Ténis', icon: 'tennis' },
  { value: 'BASKETBALL', label: 'Basquetebol', icon: 'basketball' },
];

/**
 * "Odds" tab of Jogos: one compact row (search + sport icons) and one chip row (comparable / live
 * toggles, then competitions) above today's and tomorrow's games. Search spans every sport and also
 * finds competitions.
 */
export function OddsTab() {
  const { colors, tokens } = useTheme();
  const [sport, setSport] = useState<OddsSport>('FOOTBALL');
  const [competition, setCompetition] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [comparable, setComparable] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  const searching = normalizeText(text).length >= 2;
  const d0 = lisbonDay(0);
  const d1 = lisbonDay(1);
  // The selected sport always loads; the other two only while searching (search spans every sport).
  const on = (s: OddsSport) => s === sport || searching;
  const days = {
    FOOTBALL: [useOddsDay('FOOTBALL', d0, on('FOOTBALL')), useOddsDay('FOOTBALL', d1, on('FOOTBALL'))],
    TENNIS: [useOddsDay('TENNIS', d0, on('TENNIS')), useOddsDay('TENNIS', d1, on('TENNIS'))],
    BASKETBALL: [useOddsDay('BASKETBALL', d0, on('BASKETBALL')), useOddsDay('BASKETBALL', d1, on('BASKETBALL'))],
  } as const;
  const [today, tomorrow] = days[sport];

  const all = useMemo(() => [...(today.data ?? []), ...(tomorrow.data ?? [])], [today.data, tomorrow.data]);
  const competitions = useMemo(() => competitionsByCount(all), [all]);
  const countryOf = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const i of all) if (!m.get(i.event.competition)) m.set(i.event.competition, i.event.countryCode);
    return m;
  }, [all]);
  const active = competition && competitions.includes(competition) ? competition : null;
  const liveCount = useMemo(() => all.filter((i) => i.event.live).length, [all]);
  const live = liveOnly && liveCount > 0;

  const searchLists = (Object.values(days) as Array<typeof days.FOOTBALL>).map(([t, m]) => [t.data, m.data] as const);
  const sections = useMemo(() => {
    if (searching) {
      const pick = (lists: Array<OddsEventListItem[] | undefined>) =>
        applyFilters(lists.flatMap((l) => l ?? []), { comparable })
          .filter((i) => matchesQuery(i, text))
          .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
      return [
        { title: 'Hoje', data: pick(searchLists.map(([t]) => t)) },
        { title: 'Amanhã', data: pick(searchLists.map(([, m]) => m)) },
      ].filter((s) => s.data.length > 0);
    }
    const filters = { competition: active, comparable, live };
    // Without a competition or live filter, the biggest games go first, in "Em destaque", and leave the day lists.
    const featured = active || live ? [] : pickFeatured(applyFilters(all, filters));
    const shown = new Set(featured.map((i) => i.eventKey));
    const keep = (l: OddsEventListItem[] | undefined) => applyFilters(l ?? [], filters).filter((i) => !shown.has(i.eventKey));
    return [
      { title: 'Em destaque', data: featured },
      { title: 'Hoje', data: keep(today.data) },
      { title: 'Amanhã', data: keep(tomorrow.data) },
    ].filter((s) => s.data.length > 0);
    // searchLists changes identity every render; its data arrays are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, text, active, comparable, live, all, today.data, tomorrow.data, ...searchLists.flat()]);

  const loading = (today.isLoading || tomorrow.isLoading) && all.length === 0;
  const refreshing = today.isRefetching || tomorrow.isRefetching;
  const refresh = () => { void today.refetch(); void tomorrow.refetch(); };
  const pickSport = (s: OddsSport) => { setSport(s); setCompetition(null); setLiveOnly(false); };

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.border, borderRadius: tokens.radius.md }]}>
          <Ionicons color={colors.textMuted} name="search" size={16} />
          <TextInput
            accessibilityLabel="Procurar equipa, jogador ou competição"
            autoCorrect={false}
            clearButtonMode="never"
            onBlur={() => setFocused(false)}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            placeholder="Equipa, jogador ou competição"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={text}
          />
          {text ? (
            <Pressable accessibilityLabel="Limpar pesquisa" hitSlop={10} onPress={() => setText('')}>
              <Ionicons color={colors.textMuted} name="close-circle" size={16} />
            </Pressable>
          ) : null}
        </View>
        {searching || focused ? null : (
          <View accessibilityRole="tablist" style={[styles.sports, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: tokens.radius.md }]}>
            {SPORTS.map((s) => {
              const selected = s.value === sport;
              return (
                <Pressable
                  accessibilityLabel={s.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  key={s.value}
                  onPress={() => pickSport(s.value)}
                  style={[styles.sportBtn, { borderRadius: tokens.radius.sm }, selected && { backgroundColor: `${colors.primary}24` }]}
                >
                  <MaterialCommunityIcons color={selected ? colors.primary : colors.textMuted} name={s.icon} size={19} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.chipsWrap}
      >
        <Chip
          icon={<Ionicons color={comparable ? colors.primary : colors.textSecondary} name="git-compare-outline" size={13} />}
          label="2+ casas"
          onPress={() => setComparable((v) => !v)}
          selected={comparable}
          style={styles.chip}
        />
        {!searching && liveCount > 0 ? (
          <Chip
            icon={<View style={[styles.liveDot, { backgroundColor: colors.live }]} />}
            label={`Ao vivo ${liveCount}`}
            onPress={() => setLiveOnly((v) => !v)}
            selected={live}
            style={styles.chip}
          />
        ) : null}
        {!searching && competitions.length > 0 ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Chip label="Todas" onPress={() => setCompetition(null)} selected={active === null} style={styles.chip} />
            {competitions.map((c) => {
              const flag = flagUrlForCode(countryOf.get(c));
              return (
                <Chip
                  icon={flag ? <Image source={{ uri: flag }} style={styles.chipFlag} /> : undefined}
                  key={c}
                  label={c}
                  onPress={() => setCompetition(active === c ? null : c)}
                  selected={active === c}
                  style={styles.chip}
                />
              );
            })}
          </>
        ) : null}
      </ScrollView>
      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <Skeleton height={130} key={i} width="100%" />)}
        </View>
      ) : (
        <SectionList
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={(
            <EmptyState
              icon={searching ? 'magnify' : 'trending-up'}
              title={searching ? `Nenhum jogo com odds para "${text.trim()}"` : comparable || live ? 'Nenhum jogo com estes filtros' : 'Sem odds para estes jogos'}
            />
          )}
          contentContainerStyle={styles.list}
          keyExtractor={(i) => i.eventKey}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={colors.primary} />}
          renderItem={({ item, section }) => <OddsEventCard item={item} showDay={searching || section.title === 'Em destaque'} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHead, { backgroundColor: colors.background }]}>
              {section.title === 'Em destaque' ? <Ionicons color={colors.gold} name="star" size={16} /> : null}
              <AppText variant="heading">{section.title}</AppText>
            </View>
          )}
          sections={sections}
          stickySectionHeadersEnabled={false}
        />
      )}
      <SlipBar aboveTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 6 },
  search: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, flex: 1, flexDirection: 'row', gap: 6, height: 38, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  sports: { borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 2, height: 38, padding: 3 },
  sportBtn: { alignItems: 'center', justifyContent: 'center', width: 36 },
  chip: { paddingHorizontal: 11, paddingVertical: 5 },
  chipFlag: { borderRadius: 2, height: 10, width: 14 },
  liveDot: { borderRadius: 3, height: 6, width: 6 },
  divider: { alignSelf: 'center', height: 18, width: StyleSheet.hairlineWidth },
  // Fixed height: a horizontal ScrollView in a flex column can be squeezed and clip the chips.
  chipsWrap: { flexGrow: 0, flexShrink: 0, minHeight: 42 },
  chips: { alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7 },
  list: { gap: 10, paddingBottom: 160, paddingHorizontal: 16 },
  sep: { height: 10 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 6, paddingTop: 10 },
});
