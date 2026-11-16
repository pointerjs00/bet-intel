import React, { useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui/AppText';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Pressable } from '../ui/Pressable';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/Skeleton';
import { useTheme } from '../../theme/useTheme';
import { useOddsDay } from '../../services/oddsService';
import { lisbonDay } from '../../utils/odds/format';
import { pickFeatured } from '../../utils/odds/featured';
import { flagUrlForCode } from '../../utils/odds/flags';
import { competitionsByCount } from '../../utils/odds/list';
import { matchesQuery, normalizeText } from '../../utils/odds/search';
import type { OddsEventListItem, OddsSport } from '../../utils/odds/types';
import { OddsEventCard } from './OddsEventCard';
import { SlipBar } from './SlipBar';

const SPORTS: Array<{ value: OddsSport; label: string }> = [
  { value: 'FOOTBALL', label: 'Futebol' },
  { value: 'TENNIS', label: 'Ténis' },
  { value: 'BASKETBALL', label: 'Basquetebol' },
];

/** "Odds" tab of Jogos: search, sport and competition filters, today's and tomorrow's games. */
export function OddsTab() {
  const { colors, tokens } = useTheme();
  const [sport, setSport] = useState<OddsSport>('FOOTBALL');
  const [competition, setCompetition] = useState<string | null>(null);
  const [text, setText] = useState('');
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

  const searchLists = (Object.values(days) as Array<typeof days.FOOTBALL>).map(([t, m]) => [t.data, m.data] as const);
  const sections = useMemo(() => {
    if (searching) {
      const pick = (lists: Array<OddsEventListItem[] | undefined>) =>
        lists.flatMap((l) => l ?? []).filter((i) => matchesQuery(i, text)).sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
      return [
        { title: 'Hoje', data: pick(searchLists.map(([t]) => t)) },
        { title: 'Amanhã', data: pick(searchLists.map(([, m]) => m)) },
      ].filter((s) => s.data.length > 0);
    }
    // Without a competition filter, the biggest games go first, in "Em destaque", and leave the day lists.
    const featured = active ? [] : pickFeatured([...(today.data ?? []), ...(tomorrow.data ?? [])]);
    const shown = new Set(featured.map((i) => i.eventKey));
    const keep = (l: OddsEventListItem[] | undefined) =>
      (l ?? []).filter((i) => (!active || i.event.competition === active) && !shown.has(i.eventKey));
    return [
      { title: 'Em destaque', data: featured },
      { title: 'Hoje', data: keep(today.data) },
      { title: 'Amanhã', data: keep(tomorrow.data) },
    ].filter((s) => s.data.length > 0);
    // searchLists changes identity every render; its data arrays are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, text, active, today.data, tomorrow.data, ...searchLists.flat()]);

  const loading = (today.isLoading || tomorrow.isLoading) && all.length === 0;
  const refreshing = today.isRefetching || tomorrow.isRefetching;
  const refresh = () => { void today.refetch(); void tomorrow.refetch(); };

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: tokens.radius.md }]}>
          <Ionicons color={colors.textMuted} name="search" size={18} />
          <TextInput
            accessibilityLabel="Procurar equipa ou jogador"
            autoCorrect={false}
            clearButtonMode="never"
            onChangeText={setText}
            placeholder="Procurar equipa ou jogador"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={text}
          />
          {text ? (
            <Pressable accessibilityLabel="Limpar pesquisa" hitSlop={10} onPress={() => setText('')}>
              <Ionicons color={colors.textMuted} name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>
        {searching ? null : (
          <SegmentedControl
            onChange={(s) => { setSport(s); setCompetition(null); }}
            options={SPORTS}
            value={sport}
          />
        )}
      </View>
      {!searching && competitions.length > 0 ? (
        <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap}>
          <Chip label="Todas" onPress={() => setCompetition(null)} selected={active === null} />
          {competitions.map((c) => {
            const flag = flagUrlForCode(countryOf.get(c));
            return (
              <Chip
                icon={flag ? <Image source={{ uri: flag }} style={styles.chipFlag} /> : undefined}
                key={c}
                label={c}
                onPress={() => setCompetition(c)}
                selected={active === c}
              />
            );
          })}
        </ScrollView>
      ) : null}
      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <Skeleton height={130} key={i} width="100%" />)}
        </View>
      ) : (
        <SectionList
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<EmptyState icon={searching ? 'magnify' : 'trending-up'} title={searching ? `Nenhum jogo com odds para "${text.trim()}"` : 'Sem odds para estes jogos'} />}
          contentContainerStyle={styles.list}
          keyExtractor={(i) => i.eventKey}
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
  top: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  search: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  chipFlag: { borderRadius: 2, height: 11, width: 15 },
  // Fixed height: a horizontal ScrollView in a flex column can be squeezed and clip the chips.
  chipsWrap: { flexGrow: 0, flexShrink: 0, minHeight: 48 },
  chips: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  list: { gap: 10, paddingBottom: 160, paddingHorizontal: 16 },
  sep: { height: 10 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 6, paddingTop: 12 },
});
