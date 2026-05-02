import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Sport } from '@betintel/shared';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { PressableScale } from '../../components/ui/PressableScale';
import { useTheme } from '../../theme/useTheme';
import { useUpcomingFixtures, useRecentFixtures } from '../../services/referenceService';
import type { Fixture } from '../../services/referenceService';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import type { BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import { getCountryFlagEmoji } from '../../utils/sportAssets';
import { hapticLight, hapticSelection, hapticSuccess } from '../../utils/haptics';

// ─── Market presets ───────────────────────────────────────────────────────────

interface MarketPreset {
  id: string;
  chip: string;
  label: string;
  market: string;
  selections: Array<{ label: string; sub: string; value: string }>;
}

const MARKET_PRESETS: MarketPreset[] = [
  {
    id: '1x2',
    chip: '1X2',
    label: 'Resultado Final',
    market: 'Resultado Final (1X2)',
    selections: [
      { label: 'Casa', sub: '1', value: '1' },
      { label: 'Empate', sub: 'X', value: 'X' },
      { label: 'Fora', sub: '2', value: '2' },
    ],
  },
  {
    id: 'over25',
    chip: 'Over 2.5',
    label: 'Mais de 2.5 Golos',
    market: 'Golos - Mais de 2.5',
    selections: [
      { label: 'Over 2.5', sub: '≥ 3 golos', value: 'Over 2.5' },
      { label: 'Under 2.5', sub: '≤ 2 golos', value: 'Under 2.5' },
    ],
  },
  {
    id: 'btts',
    chip: 'BTTS',
    label: 'Ambas Marcam',
    market: 'Ambas as Equipas Marcam',
    selections: [
      { label: 'Sim', sub: 'Ambas marcam', value: 'Sim' },
      { label: 'Não', sub: 'Uma não marca', value: 'Não' },
    ],
  },
  {
    id: 'dc',
    chip: 'Dupla Chance',
    label: 'Dupla Chance',
    market: 'Dupla Chance',
    selections: [
      { label: '1X', sub: 'Casa ou Empate', value: '1X' },
      { label: '12', sub: 'Casa ou Fora', value: '12' },
      { label: 'X2', sub: 'Empate ou Fora', value: 'X2' },
    ],
  },
  {
    id: 'over15',
    chip: 'Over 1.5',
    label: 'Mais de 1.5 Golos',
    market: 'Golos - Mais de 1.5',
    selections: [
      { label: 'Over 1.5', sub: '≥ 2 golos', value: 'Over 1.5' },
      { label: 'Under 1.5', sub: '≤ 1 golo', value: 'Under 1.5' },
    ],
  },
  {
    id: 'over35',
    chip: 'Over 3.5',
    label: 'Mais de 3.5 Golos',
    market: 'Golos - Mais de 3.5',
    selections: [
      { label: 'Over 3.5', sub: '≥ 4 golos', value: 'Over 3.5' },
      { label: 'Under 3.5', sub: '≤ 3 golos', value: 'Under 3.5' },
    ],
  },
];

// ─── Grouping helpers ─────────────────────────────────────────────────────────

interface Section {
  title: string;
  dateKey: string;
  data: Fixture[];
}

function groupByDate(fixtures: Fixture[]): Section[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  const tomorrow = new Date(today.getTime() + 86400000);

  const map = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = new Date(f.kickoffAt).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const d = new Date(key + 'T12:00:00');
      d.setHours(0, 0, 0, 0);
      let title: string;
      if (d.getTime() === today.getTime()) title = 'Hoje';
      else if (d.getTime() === tomorrow.getTime()) title = 'Amanhã';
      else if (d.getTime() === yesterday.getTime()) title = 'Ontem';
      else {
        const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
        title = s.charAt(0).toUpperCase() + s.slice(1);
      }
      return { title, dateKey: key, data };
    });
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

// ─── Add-to-boletim modal ─────────────────────────────────────────────────────

interface AddSheetProps {
  fixture: Fixture | null;
  onClose: () => void;
  onAdded: () => void;
}

function AddSheet({ fixture, onClose, onAdded }: AddSheetProps) {
  const { colors, tokens } = useTheme();
  const router = useRouter();
  const addItem = useBoletinBuilderStore((s) => s.addItem);
  const insets = useSafeAreaInsets();

  const [selectedMarket, setSelectedMarket] = useState<MarketPreset>(MARKET_PRESETS[0]!);
  const [selectedSelection, setSelectedSelection] = useState<string | null>(null);
  const [odds, setOdds] = useState('');
  const oddsRef = useRef<TextInput>(null);

  const handleMarketSelect = (preset: MarketPreset) => {
    hapticSelection();
    setSelectedMarket(preset);
    setSelectedSelection(null);
  };

  const handleSelectionSelect = (value: string) => {
    hapticSelection();
    setSelectedSelection(value);
  };

  const canAdd = fixture && selectedSelection && parseFloat(odds) >= 1.01;

  const handleAdd = () => {
    if (!fixture || !selectedSelection || !canAdd) return;
    Keyboard.dismiss();

    const item: BoletinBuilderItem = {
      id: `${fixture.id}-${selectedMarket.id}-${selectedSelection}-${Date.now()}`,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      competition: fixture.competition,
      sport: Sport.FOOTBALL,
      market: selectedMarket.market,
      selection: selectedSelection,
      oddValue: parseFloat(odds),
      eventDate: fixture.kickoffAt,
    };

    addItem(item);
    hapticSuccess();
    onAdded();
    onClose();
    router.push('/boletins/create');
  };

  if (!fixture) return null;

  const kickoffTime = formatKickoff(fixture.kickoffAt);
  const flagEmoji = getCountryFlagEmoji(fixture.country) ?? '🏳️';

  return (
    <Modal
      visible={!!fixture}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={FadeInDown.springify().damping(20).stiffness(260)}
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}
        >
          {/* Handle bar */}
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

          {/* Fixture header */}
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetCompetition, { color: colors.textSecondary }]}>
              {flagEmoji} {fixture.competition}
              {fixture.round ? `  ·  ${fixture.round}` : ''}
            </Text>
            <View style={styles.sheetTeams}>
              <View style={styles.sheetTeamCol}>
                <TeamBadge name={fixture.homeTeam} size={36} />
                <Text style={[styles.sheetTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                  {fixture.homeTeam}
                </Text>
              </View>
              <View style={styles.sheetVsCol}>
                <Text style={[styles.sheetTime, { color: colors.primary }]}>{kickoffTime}</Text>
                <Text style={[styles.sheetVs, { color: colors.textMuted }]}>vs</Text>
              </View>
              <View style={styles.sheetTeamCol}>
                <TeamBadge name={fixture.awayTeam} size={36} />
                <Text style={[styles.sheetTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                  {fixture.awayTeam}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
          >
            {/* Market selection */}
            <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>MERCADO</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.marketChips}
            >
              {MARKET_PRESETS.map((preset) => {
                const active = selectedMarket.id === preset.id;
                return (
                  <PressableScale
                    key={preset.id}
                    onPress={() => handleMarketSelect(preset)}
                    style={[
                      styles.marketChip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceRaised,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.marketChipText, { color: active ? '#fff' : colors.textSecondary }]}>
                      {preset.chip}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <Text style={[styles.marketFullLabel, { color: colors.textPrimary }]}>
              {selectedMarket.label}
            </Text>

            {/* Selection buttons */}
            <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>SELEÇÃO</Text>
            <View style={styles.selectionRow}>
              {selectedMarket.selections.map((sel) => {
                const active = selectedSelection === sel.value;
                return (
                  <PressableScale
                    key={sel.value}
                    onPress={() => handleSelectionSelect(sel.value)}
                    style={[
                      styles.selectionBtn,
                      {
                        backgroundColor: active ? `${colors.primary}22` : colors.surfaceRaised,
                        borderColor: active ? colors.primary : colors.border,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text style={[styles.selectionLabel, { color: active ? colors.primary : colors.textPrimary }]}>
                      {sel.label}
                    </Text>
                    <Text style={[styles.selectionSub, { color: active ? colors.primary : colors.textMuted }]}>
                      {sel.sub}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            {/* Odds input */}
            <Text style={[styles.sheetSectionLabel, { color: colors.textSecondary }]}>QUOTA</Text>
            <Pressable
              onPress={() => oddsRef.current?.focus()}
              style={[styles.oddsInputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Ionicons name="trending-up-outline" size={18} color={colors.textMuted} />
              <TextInput
                ref={oddsRef}
                style={[styles.oddsInput, { color: colors.textPrimary }]}
                placeholder="ex: 1.85"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={odds}
                onChangeText={setOdds}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
              {odds.length > 0 && (
                <Pressable onPress={() => setOdds('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </Pressable>
          </ScrollView>

          {/* CTA */}
          <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
            <PressableScale
              onPress={handleAdd}
              disabled={!canAdd}
              style={[
                styles.addBtn,
                { backgroundColor: canAdd ? colors.primary : colors.surfaceRaised },
              ]}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={canAdd ? '#fff' : colors.textMuted}
              />
              <Text style={[styles.addBtnText, { color: canAdd ? '#fff' : colors.textMuted }]}>
                Adicionar ao Boletim
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={canAdd ? 'rgba(255,255,255,0.7)' : colors.textMuted}
              />
            </PressableScale>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Fixture card ─────────────────────────────────────────────────────────────

interface FixtureCardProps {
  fixture: Fixture;
  onPress: (fixture: Fixture) => void;
  isFirst: boolean;
}

const FixtureCard = React.memo(function FixtureCard({ fixture, onPress, isFirst }: FixtureCardProps) {
  const { colors } = useTheme();
  const isFinished = fixture.homeScore !== null && fixture.awayScore !== null;
  const kickoffTime = formatKickoff(fixture.kickoffAt);

  return (
    <PressableScale
      onPress={() => { hapticLight(); onPress(fixture); }}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          marginTop: isFirst ? 0 : 1,
        },
      ]}
    >
      {/* Teams row */}
      <View style={styles.cardBody}>
        {/* Home team */}
        <View style={styles.cardTeam}>
          <TeamBadge name={fixture.homeTeam} size={32} />
          <Text style={[styles.cardTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
            {fixture.homeTeam}
          </Text>
        </View>

        {/* Score / Time */}
        <View style={styles.cardCenter}>
          {isFinished ? (
            <View style={styles.scoreWrap}>
              <Text style={[styles.scoreText, { color: colors.textPrimary }]}>
                {fixture.homeScore}
              </Text>
              <Text style={[styles.scoreSep, { color: colors.textMuted }]}>–</Text>
              <Text style={[styles.scoreText, { color: colors.textPrimary }]}>
                {fixture.awayScore}
              </Text>
            </View>
          ) : (
            <View style={styles.timeWrap}>
              <Text style={[styles.kickoffTime, { color: colors.primary }]}>{kickoffTime}</Text>
              <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
            </View>
          )}
          {!isFinished && (
            <View style={[styles.addHint, { backgroundColor: `${colors.primary}14` }]}>
              <Ionicons name="add" size={12} color={colors.primary} />
            </View>
          )}
        </View>

        {/* Away team */}
        <View style={[styles.cardTeam, styles.cardTeamAway]}>
          <TeamBadge name={fixture.awayTeam} size={32} />
          <Text style={[styles.cardTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
            {fixture.awayTeam}
          </Text>
        </View>
      </View>

      {/* Competition footer */}
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.cardCompetition, { color: colors.textMuted }]} numberOfLines={1}>
          {getCountryFlagEmoji(fixture.country) ?? '🏳️'} {fixture.competition}
          {fixture.round ? `  ·  ${fixture.round}` : ''}
        </Text>
        {isFinished ? (
          <View style={[styles.ftBadge, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.ftText, { color: colors.textMuted }]}>FT</Text>
          </View>
        ) : (
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>Toca para apostar</Text>
        )}
      </View>
    </PressableScale>
  );
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={[styles.sectionBadge, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type TabKey = 'upcoming' | 'recent';

function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const { colors } = useTheme();
  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'upcoming', label: 'Próximos', icon: 'calendar-outline' },
    { key: 'recent', label: 'Recentes', icon: 'checkmark-circle-outline' },
  ];

  return (
    <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <PressableScale
            key={tab.key}
            onPress={() => { hapticLight(); onChange(tab.key); }}
            style={[
              styles.tab,
              isActive && [styles.tabActive, { borderBottomColor: colors.primary }],
            ]}
          >
            <Ionicons
              name={tab.icon as keyof typeof Ionicons.glyphMap}
              size={15}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.textMuted }]}>
              {tab.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FixturesScreen() {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

  const upcomingQuery = useUpcomingFixtures(14);
  const recentQuery = useRecentFixtures(7);

  const isLoading = activeTab === 'upcoming' ? upcomingQuery.isLoading : recentQuery.isLoading;
  const rawFixtures = activeTab === 'upcoming'
    ? (upcomingQuery.data ?? [])
    : (recentQuery.data ?? []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rawFixtures;
    const q = search.trim().toLowerCase();
    return rawFixtures.filter(
      (f) =>
        f.homeTeam.toLowerCase().includes(q) ||
        f.awayTeam.toLowerCase().includes(q) ||
        f.competition.toLowerCase().includes(q),
    );
  }, [rawFixtures, search]);

  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  const handleRefresh = useCallback(() => {
    if (activeTab === 'upcoming') upcomingQuery.refetch();
    else recentQuery.refetch();
  }, [activeTab, upcomingQuery, recentQuery]);

  const isRefreshing = activeTab === 'upcoming' ? upcomingQuery.isFetching : recentQuery.isFetching;

  const renderItem = useCallback(
    ({ item, index, section }: { item: Fixture; index: number; section: Section }) => (
      <FixtureCard
        fixture={item}
        onPress={setSelectedFixture}
        isFirst={index === 0}
      />
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <SectionHeader title={section.title} count={section.data.length} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: Fixture) => item.id, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Jogos',
          headerLargeTitle: false,
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Search bar */}
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Pesquisar equipa ou competição…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && Platform.OS !== 'ios' && (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Tab bar */}
        <TabBar active={activeTab} onChange={setActiveTab} />

        {/* Content */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              A carregar jogos…
            </Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="calendar-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {search ? 'Sem resultados' : activeTab === 'upcoming' ? 'Sem jogos próximos' : 'Sem jogos recentes'}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              {search
                ? 'Tenta outra pesquisa.'
                : activeTab === 'upcoming'
                  ? 'Não há jogos agendados nos próximos 14 dias.'
                  : 'Não há jogos terminados nos últimos 7 dias.'}
            </Text>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={{ flex: 1 }}>
            <SectionList
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={null}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                />
              }
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        )}
      </View>

      {/* Add-to-boletim sheet */}
      <AddSheet
        fixture={selectedFixture}
        onClose={() => setSelectedFixture(null)}
        onAdded={() => setSelectedFixture(null)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Search
  searchWrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {},
  tabLabel: { fontSize: 13, fontWeight: '600' },

  // List
  listContent: { paddingBottom: 32 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  sectionBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sectionCount: { fontSize: 11, fontWeight: '600' },

  // Cards
  card: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  cardTeam: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  cardTeamAway: {},
  cardTeamName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  cardCenter: {
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
  },
  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreText: { fontSize: 22, fontWeight: '800' },
  scoreSep: { fontSize: 16, fontWeight: '400' },
  timeWrap: { alignItems: 'center', gap: 2 },
  kickoffTime: { fontSize: 18, fontWeight: '700' },
  vsText: { fontSize: 11, fontWeight: '500' },
  addHint: {
    borderRadius: 8,
    padding: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardCompetition: { fontSize: 11, fontWeight: '500', flex: 1 },
  cardHint: { fontSize: 10, fontWeight: '500' },
  ftBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  ftText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Empty / loading
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCompetition: { fontSize: 12, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  sheetTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTeamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  sheetTeamName: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
  sheetVsCol: {
    alignItems: 'center',
    gap: 2,
    minWidth: 48,
  },
  sheetTime: { fontSize: 20, fontWeight: '800' },
  sheetVs: { fontSize: 12, fontWeight: '500' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 8 },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 8,
  },
  marketChips: { gap: 8, paddingBottom: 2 },
  marketChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  marketChipText: { fontSize: 13, fontWeight: '600' },
  marketFullLabel: { fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 4 },
  selectionRow: { flexDirection: 'row', gap: 8 },
  selectionBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 3,
  },
  selectionLabel: { fontSize: 14, fontWeight: '700' },
  selectionSub: { fontSize: 10, fontWeight: '500', textAlign: 'center' },
  oddsInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  oddsInput: { flex: 1, fontSize: 18, fontWeight: '700', padding: 0 },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  addBtnText: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
});
