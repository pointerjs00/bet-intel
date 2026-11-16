import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Skeleton } from '../ui/Skeleton';
import { useTheme } from '../../theme/useTheme';
import { useOddsDay } from '../../services/oddsService';
import { lisbonDay } from '../../utils/odds/format';
import { competitionsByCount } from '../../utils/odds/list';
import type { OddsEventListItem, OddsSport } from '../../utils/odds/types';
import { OddsEventCard } from './OddsEventCard';
import { SlipBar } from './SlipBar';

const SPORTS: Array<{ value: OddsSport; label: string }> = [
  { value: 'FOOTBALL', label: 'Futebol' },
  { value: 'TENNIS', label: 'Ténis' },
  { value: 'BASKETBALL', label: 'Basquetebol' },
];

/** "Odds" tab of Jogos: today's and tomorrow's games with the main-market buttons. */
export function OddsTab() {
  const { colors } = useTheme();
  const [sport, setSport] = useState<OddsSport>('FOOTBALL');
  const [competition, setCompetition] = useState<string | null>(null);
  const today = useOddsDay(sport, lisbonDay(0));
  const tomorrow = useOddsDay(sport, lisbonDay(1));

  const all = useMemo(() => [...(today.data ?? []), ...(tomorrow.data ?? [])], [today.data, tomorrow.data]);
  const competitions = useMemo(() => competitionsByCount(all), [all]);
  const active = competition && competitions.includes(competition) ? competition : null;
  const sections = useMemo(() => {
    const keep = (l: OddsEventListItem[] | undefined) => (l ?? []).filter((i) => !active || i.event.competition === active);
    return [
      { title: 'Hoje', data: keep(today.data) },
      { title: 'Amanhã', data: keep(tomorrow.data) },
    ].filter((s) => s.data.length > 0);
  }, [today.data, tomorrow.data, active]);

  const loading = (today.isLoading || tomorrow.isLoading) && all.length === 0;
  const refreshing = today.isRefetching || tomorrow.isRefetching;
  const refresh = () => { void today.refetch(); void tomorrow.refetch(); };

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <SegmentedControl
          onChange={(s) => { setSport(s); setCompetition(null); }}
          options={SPORTS}
          value={sport}
        />
      </View>
      {competitions.length > 0 ? (
        <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap}>
          <Chip label="Todas" onPress={() => setCompetition(null)} selected={active === null} />
          {competitions.map((c) => (
            <Chip key={c} label={c} onPress={() => setCompetition(c)} selected={active === c} />
          ))}
        </ScrollView>
      ) : null}
      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <Skeleton height={130} key={i} width="100%" />)}
        </View>
      ) : (
        <SectionList
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<EmptyState icon="trending-up" title="Sem odds para estes jogos" />}
          contentContainerStyle={styles.list}
          keyExtractor={(i) => i.eventKey}
          refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={colors.primary} />}
          renderItem={({ item }) => <OddsEventCard item={item} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHead, { backgroundColor: colors.background }]}>
              <AppText variant="heading">{section.title}</AppText>
            </View>
          )}
          sections={sections}
          stickySectionHeadersEnabled={false}
        />
      )}
      <SlipBar />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: 16, paddingVertical: 8 },
  chipsWrap: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  list: { gap: 10, paddingBottom: 160, paddingHorizontal: 16 },
  sep: { height: 10 },
  sectionHead: { paddingBottom: 6, paddingTop: 12 },
});
