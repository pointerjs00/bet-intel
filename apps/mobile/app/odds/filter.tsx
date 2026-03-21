import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sport } from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBettingSites, useSports } from '../../services/oddsService';
import { useFilterStore, type FilterDateRange } from '../../stores/filterStore';
import { useTheme } from '../../theme/useTheme';

const MARKET_OPTIONS = ['1X2', 'Over/Under 2.5', 'BTTS', 'Handicap'];
const SORT_OPTIONS = [
  { label: 'Best odds', value: 'best-odds' },
  { label: 'Soonest', value: 'soonest' },
  { label: 'Most markets', value: 'most-markets' },
] as const;

type SectionKey = 'sites' | 'sports' | 'odds-range' | 'dates' | 'markets' | 'sort';

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const sitesQuery = useBettingSites();
  const sportsQuery = useSports();
  const store = useFilterStore();

  const [selectedSites, setSelectedSites] = useState(store.selectedSites);
  const [selectedSports, setSelectedSports] = useState(store.selectedSports);
  const [selectedMarkets, setSelectedMarkets] = useState(store.selectedMarkets);
  const [minOdds, setMinOdds] = useState(String(store.minOdds));
  const [maxOdds, setMaxOdds] = useState(String(store.maxOdds));
  const [sortBy, setSortBy] = useState(store.sortBy);
  const [dateRange, setDateRange] = useState<FilterDateRange | null>(store.dateRange);

  const datePresets = useMemo(
    () => [
      {
        key: 'today',
        label: 'Today',
        onPress: () => {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          setDateRange({ from: start, to: end });
        },
      },
      {
        key: 'tomorrow',
        label: 'Tomorrow',
        onPress: () => {
          const start = new Date();
          start.setDate(start.getDate() + 1);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          setDateRange({ from: start, to: end });
        },
      },
      {
        key: 'week',
        label: 'This Week',
        onPress: () => {
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + 7);
          setDateRange({ from: start, to: end });
        },
      },
    ],
    [],
  );

  const sections: SectionKey[] = ['sites', 'sports', 'odds-range', 'dates', 'markets', 'sort'];

  const toggleString = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const toggleSport = (sport: Sport) => {
    setSelectedSports((current) =>
      current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport],
    );
  };

  const applyFilters = () => {
    store.setFilter('selectedSites', selectedSites);
    store.setFilter('selectedSports', selectedSports);
    store.setFilter('selectedMarkets', selectedMarkets);
    store.setFilter('minOdds', Math.max(1.01, Number(minOdds) || 1.01));
    store.setFilter('maxOdds', Math.max(1.01, Number(maxOdds) || 20));
    store.setFilter('sortBy', sortBy);
    store.setDateRange(dateRange);
    router.back();
  };

  const resetFilters = () => {
    setSelectedSites([]);
    setSelectedSports([]);
    setSelectedMarkets([]);
    setMinOdds('1.01');
    setMaxOdds('20');
    setSortBy('best-odds');
    setDateRange(null);
    store.reset();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}> 
      <Stack.Screen options={{ presentation: 'modal', title: 'Filtros' }} />

      <View style={[styles.header, { borderColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.textPrimary }]}>Filtros</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.closeText, { color: colors.info }]}>Fechar</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={{
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={sections}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          if (item === 'sites') {
            return (
              <Section title="Betting Sites" textColor={colors.textPrimary}>
                <FlatList
                  contentContainerStyle={styles.gridList}
                  data={sitesQuery.data ?? []}
                  keyExtractor={(site) => site.slug}
                  numColumns={2}
                  renderItem={({ item: site }) => (
                    <Chip
                      active={selectedSites.includes(site.slug)}
                      color={colors.primary}
                      label={site.name}
                      mutedColor={colors.textPrimary}
                      onPress={() => toggleString(site.slug, selectedSites, setSelectedSites)}
                      surface={colors.surfaceRaised}
                    />
                  )}
                  scrollEnabled={false}
                />
              </Section>
            );
          }

          if (item === 'sports') {
            return (
              <Section title="Sports" textColor={colors.textPrimary}>
                <FlatList
                  contentContainerStyle={styles.gridList}
                  data={(sportsQuery.data ?? []).map((sport) => sport as Sport)}
                  keyExtractor={(sport) => sport}
                  numColumns={2}
                  renderItem={({ item: sport }) => (
                    <Chip
                      active={selectedSports.includes(sport)}
                      color={colors.primary}
                      label={sportLabel(sport)}
                      mutedColor={colors.textPrimary}
                      onPress={() => toggleSport(sport)}
                      surface={colors.surfaceRaised}
                    />
                  )}
                  scrollEnabled={false}
                />
              </Section>
            );
          }

          if (item === 'odds-range') {
            return (
              <Section title="Odds Range" textColor={colors.textPrimary}>
                <View style={styles.rangeRow}>
                  <View style={styles.rangeField}>
                    <Input keyboardType="decimal-pad" label="Min" onChangeText={setMinOdds} value={minOdds} />
                  </View>
                  <View style={styles.rangeField}>
                    <Input keyboardType="decimal-pad" label="Max" onChangeText={setMaxOdds} value={maxOdds} />
                  </View>
                </View>
              </Section>
            );
          }

          if (item === 'dates') {
            return (
              <Section title="Date Range" textColor={colors.textPrimary}>
                <FlatList
                  contentContainerStyle={styles.presetRow}
                  data={datePresets}
                  horizontal
                  keyExtractor={(preset) => preset.key}
                  renderItem={({ item: preset }) => (
                    <Chip
                      active={false}
                      color={colors.primary}
                      label={preset.label}
                      mutedColor={colors.textPrimary}
                      onPress={preset.onPress}
                      surface={colors.surfaceRaised}
                    />
                  )}
                  showsHorizontalScrollIndicator={false}
                />
                <View style={styles.rangeRow}>
                  <View style={styles.rangeField}>
                    <Input
                      label="From"
                      onChangeText={(text) => {
                        const parsed = new Date(text);
                        if (!Number.isNaN(parsed.getTime())) {
                          setDateRange({ from: parsed, to: dateRange?.to ?? parsed });
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      value={dateRange ? formatDateInput(dateRange.from) : ''}
                    />
                  </View>
                  <View style={styles.rangeField}>
                    <Input
                      label="To"
                      onChangeText={(text) => {
                        const parsed = new Date(text);
                        if (!Number.isNaN(parsed.getTime())) {
                          setDateRange({ from: dateRange?.from ?? parsed, to: parsed });
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      value={dateRange ? formatDateInput(dateRange.to) : ''}
                    />
                  </View>
                </View>
              </Section>
            );
          }

          if (item === 'markets') {
            return (
              <Section title="Market Types" textColor={colors.textPrimary}>
                <FlatList
                  contentContainerStyle={styles.gridList}
                  data={MARKET_OPTIONS}
                  keyExtractor={(market) => market}
                  numColumns={2}
                  renderItem={({ item: market }) => (
                    <Chip
                      active={selectedMarkets.includes(market)}
                      color={colors.primary}
                      label={market}
                      mutedColor={colors.textPrimary}
                      onPress={() => toggleString(market, selectedMarkets, setSelectedMarkets)}
                      surface={colors.surfaceRaised}
                    />
                  )}
                  scrollEnabled={false}
                />
              </Section>
            );
          }

          return (
            <Section title="Sort By" textColor={colors.textPrimary}>
              <FlatList
                contentContainerStyle={styles.gridList}
                data={SORT_OPTIONS as readonly { label: string; value: 'best-odds' | 'soonest' | 'most-markets' }[]}
                keyExtractor={(option) => option.value}
                numColumns={2}
                renderItem={({ item: option }) => (
                  <Chip
                    active={sortBy === option.value}
                    color={colors.primary}
                    label={option.label}
                    mutedColor={colors.textPrimary}
                    onPress={() => setSortBy(option.value)}
                    surface={colors.surfaceRaised}
                  />
                )}
                scrollEnabled={false}
              />
            </Section>
          );
        }}
        showsVerticalScrollIndicator={false}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            paddingBottom: insets.bottom + tokens.spacing.md,
            paddingHorizontal: tokens.spacing.lg,
          },
        ]}
      >
        <View style={styles.footerButton}>
          <Button onPress={resetFilters} title="Reset" variant="ghost" />
        </View>
        <View style={styles.footerButton}>
          <Button onPress={applyFilters} title="Apply" />
        </View>
      </View>
    </View>
  );
}

function Section({ children, title, textColor }: { children: React.ReactNode; title: string; textColor: string }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      {children}
    </View>
  );
}

function sportLabel(sport: Sport) {
  switch (sport) {
    case Sport.FOOTBALL:
      return '⚽ Futebol';
    case Sport.BASKETBALL:
      return '🏀 Basket';
    case Sport.TENNIS:
      return '🎾 Ténis';
    default:
      return sport;
  }
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function Chip({
  active,
  color,
  label,
  mutedColor,
  onPress,
  surface,
}: {
  active: boolean;
  color: string;
  label: string;
  mutedColor: string;
  onPress: () => void;
  surface: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? color : surface,
          borderColor: active ? color : 'transparent',
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : mutedColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
  },
  closeText: {
    fontSize: 15,
    fontWeight: '700',
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  gridList: {
    gap: 10,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    margin: 4,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rangeField: {
    flex: 1,
  },
  presetRow: {
    gap: 8,
    marginBottom: 12,
  },
  footer: {
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    left: 0,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
  },
  footerButton: {
    flex: 1,
  },
});
