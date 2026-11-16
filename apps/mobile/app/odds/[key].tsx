// Event odds screen: market tabs and cards, Betclic style.
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pressable } from '../../components/ui/Pressable';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { MarketCardView } from '../../components/odds/MarketCard';
import { SlipBar } from '../../components/odds/SlipBar';
import { useOddsEvent } from '../../services/oddsService';
import { useTheme } from '../../theme/useTheme';
import { lisbonTime } from '../../utils/odds/list';
import { groupByTab, tabLabel, type MarketTab } from '../../utils/odds/marketTabs';

export default function OddsEventScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const query = useOddsEvent(key);
  const view = query.data;
  const [picked, setPicked] = useState<MarketTab | null>(null);
  const tabs = useMemo(() => (view ? groupByTab(view.rows, view.sport) : []), [view]);
  const active = tabs.find((t) => t.tab === picked) ?? tabs[0];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Voltar" accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <Ionicons color={colors.textPrimary} name="chevron-back" size={26} />
        </Pressable>
        <AppText numberOfLines={1} style={styles.flex} tone="secondary" variant="label">{view?.event.competition ?? ''}</AppText>
      </View>

      {query.isLoading ? (
        <View style={styles.pad}><Skeleton height={90} /><Skeleton height={120} style={{ marginTop: 12 }} /></View>
      ) : !view ? (
        <EmptyState icon="chart-line" title="Odds indisponíveis para este jogo" />
      ) : (
        <>
          <View style={styles.header}>
            <View style={styles.team}>
              <TeamBadge name={view.event.home} size={36} />
              <AppText numberOfLines={2} style={styles.center} variant="bodyStrong">{view.event.home}</AppText>
            </View>
            <View style={styles.mid}>
              {view.event.live ? (
                <AppText style={{ color: colors.live }} variant="label">AO VIVO</AppText>
              ) : (
                <AppText variant="heading">{lisbonTime(view.event.startsAt)}</AppText>
              )}
              <AppText tone="muted" variant="label">{view.houses.length === 1 ? '1 casa' : `${view.houses.length} casas`}</AppText>
            </View>
            <View style={styles.team}>
              <TeamBadge name={view.event.away} size={36} />
              <AppText numberOfLines={2} style={styles.center} variant="bodyStrong">{view.event.away}</AppText>
            </View>
          </View>

          <View style={[styles.tabsWrap, { borderBottomColor: colors.border }]}>
            <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false}>
              {tabs.map((t) => {
                const on = t.tab === active?.tab;
                return (
                  <Pressable
                    key={t.tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPicked(t.tab)}
                    style={[styles.tab, on && { borderBottomColor: colors.primary }]}
                  >
                    <AppText tone={on ? 'primary' : 'secondary'} variant={on ? 'bodyStrong' : 'body'}>{tabLabel(t.tab, view.sport)}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            contentContainerStyle={[styles.cards, { paddingBottom: 100 + insets.bottom }]}
            refreshControl={<RefreshControl onRefresh={() => query.refetch()} refreshing={query.isRefetching} tintColor={colors.primary} />}
          >
            {active?.cards.map((card) => <MarketCardView key={card.title} card={card} view={view} />)}
          </ScrollView>
        </>
      )}
      <SlipBar />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: 16 },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  team: { alignItems: 'center', flex: 1, gap: 6 },
  center: { textAlign: 'center' },
  mid: { alignItems: 'center', gap: 2, minWidth: 70 },
  tabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { gap: 20, paddingHorizontal: 16 },
  tab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingVertical: 10 },
  cards: { gap: 12, padding: 16 },
});
