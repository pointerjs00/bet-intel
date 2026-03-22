import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Sport } from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { useBettingSites, useLeagues, useSports } from '../../services/oddsService';
import { useFilterStore, type FilterDateRange } from '../../stores/filterStore';
import { useTheme } from '../../theme/useTheme';

const MARKET_OPTIONS = ['1X2', 'Over/Under 2.5', 'BTTS', 'Handicap'];
const SORT_OPTIONS = [
  { label: 'Melhores odds', value: 'best-odds' },
  { label: 'Mais próximos', value: 'soonest' },
  { label: 'Mais mercados', value: 'most-markets' },
] as const;

type SectionKey = 'sites' | 'sports' | 'leagues' | 'odds-range' | 'dates' | 'markets' | 'sort';

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
  const [selectedLeague, setSelectedLeague] = useState(store.selectedLeague);
  const [leagueSearch, setLeagueSearch] = useState('');

  const leaguesQuery = useLeagues(selectedSports[0] as Sport | undefined);

  const availableLeagues = useMemo(() => {
    if (!leaguesQuery.data) return [];
    const unique = new Map<string, string>();
    leaguesQuery.data.forEach((item) => {
      if (!unique.has(item.league)) unique.set(item.league, item.sport);
    });
    return Array.from(unique.keys());
  }, [leaguesQuery.data]);

  const categorizedLeagues = useMemo(() => {
    const searchLower = leagueSearch.toLowerCase();
    const filtered = leagueSearch
      ? availableLeagues.filter((l) => l.toLowerCase().includes(searchLower))
      : availableLeagues;

    const portuguese: string[] = [];
    const topEuropean: string[] = [];
    const others: string[] = [];
    const PT_KW = ['portugal', 'liga nos', 'primeira liga', 'segunda liga', 'taça'];
    const EU_KW = ['premier league', 'la liga', 'laliga', 'bundesliga', 'serie a', 'ligue 1'];

    for (const league of filtered) {
      const lower = league.toLowerCase();
      if (PT_KW.some((kw) => lower.includes(kw))) portuguese.push(league);
      else if (EU_KW.some((kw) => lower.includes(kw))) topEuropean.push(league);
      else others.push(league);
    }

    return { portuguese: portuguese.sort(), topEuropean: topEuropean.sort(), others: others.sort((a, b) => a.localeCompare(b)) };
  }, [availableLeagues, leagueSearch]);

  const datePresets = useMemo(
    () => [
      {
        key: 'today',
        label: 'Hoje',
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
        label: 'Amanhã',
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
        label: 'Esta Semana',
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

  const sections: SectionKey[] = ['sites', 'sports', 'leagues', 'odds-range', 'dates', 'markets', 'sort'];

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
    store.setLeague(selectedLeague);
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
    setSelectedLeague(null);
    setLeagueSearch('');
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
        renderItem={({ item, index }) => {
          if (item === 'sites') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="web" title="Sites de apostas" textColor={colors.textPrimary}>
                  <Card noPadding style={styles.cardSection}>
                    <View style={styles.chipGrid}>
                      {(sitesQuery.data ?? []).map((site) => (
                        <Chip
                          key={site.slug}
                          label={site.name}
                          selected={selectedSites.includes(site.slug)}
                          onPress={() => toggleString(site.slug, selectedSites, setSelectedSites)}
                          style={styles.gridChip}
                        />
                      ))}
                    </View>
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          if (item === 'sports') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="soccer" title="Desportos" textColor={colors.textPrimary}>
                  <Card noPadding style={styles.cardSection}>
                    <View style={styles.chipGrid}>
                      {((sportsQuery.data ?? []) as Sport[]).map((sport) => (
                        <Chip
                          key={sport}
                          label={sportLabel(sport)}
                          selected={selectedSports.includes(sport)}
                          onPress={() => toggleSport(sport)}
                          style={styles.gridChip}
                        />
                      ))}
                    </View>
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          if (item === 'leagues') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="trophy-outline" title="Competições" textColor={colors.textPrimary}>
                  <Card noPadding style={styles.cardSection}>
                    <View style={[styles.leagueSearchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                      <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
                      <TextInput
                        placeholder="Pesquisar competição..."
                        placeholderTextColor={colors.textMuted}
                        value={leagueSearch}
                        onChangeText={setLeagueSearch}
                        style={[styles.leagueSearchInput, { color: colors.textPrimary }]}
                      />
                      {leagueSearch.length > 0 ? (
                        <Pressable onPress={() => setLeagueSearch('')} hitSlop={8}>
                          <MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={16} />
                        </Pressable>
                      ) : null}
                    </View>
                    <ScrollView style={styles.leagueList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                      <Pressable
                        onPress={() => setSelectedLeague(null)}
                        style={[styles.leagueRow, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.leagueRowText, { color: selectedLeague === null ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === null ? '700' : '500' }]}>
                          Todas as competições
                        </Text>
                        {selectedLeague === null ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                      </Pressable>
                      {categorizedLeagues.portuguese.length > 0 ? (
                        <>
                          <View style={styles.leagueGroupHeader}>
                            <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🇵🇹 Liga Portuguesa</Text>
                          </View>
                          {categorizedLeagues.portuguese.map((league) => (
                            <Pressable key={league} onPress={() => setSelectedLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                              <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                              {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                            </Pressable>
                          ))}
                        </>
                      ) : null}
                      {categorizedLeagues.topEuropean.length > 0 ? (
                        <>
                          <View style={styles.leagueGroupHeader}>
                            <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>🏆 Top Europeias</Text>
                          </View>
                          {categorizedLeagues.topEuropean.map((league) => (
                            <Pressable key={league} onPress={() => setSelectedLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                              <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                              {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                            </Pressable>
                          ))}
                        </>
                      ) : null}
                      {categorizedLeagues.others.length > 0 ? (
                        <>
                          <View style={styles.leagueGroupHeader}>
                            <Text style={[styles.leagueGroupLabel, { color: colors.textMuted }]}>📋 Outras</Text>
                          </View>
                          {categorizedLeagues.others.map((league) => (
                            <Pressable key={league} onPress={() => setSelectedLeague(selectedLeague === league ? null : league)} style={[styles.leagueRow, { borderColor: colors.border }]}>
                              <Text style={[styles.leagueRowText, { color: selectedLeague === league ? colors.primary : colors.textPrimary, fontWeight: selectedLeague === league ? '700' : '500' }]}>{league}</Text>
                              {selectedLeague === league ? <MaterialCommunityIcons color={colors.primary} name="check-circle" size={18} /> : null}
                            </Pressable>
                          ))}
                        </>
                      ) : null}
                      {categorizedLeagues.portuguese.length === 0 && categorizedLeagues.topEuropean.length === 0 && categorizedLeagues.others.length === 0 ? (
                        <View style={styles.leagueEmptySearch}>
                          <Text style={[styles.leagueEmptyText, { color: colors.textMuted }]}>Nenhuma competição encontrada</Text>
                        </View>
                      ) : null}
                    </ScrollView>
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          if (item === 'odds-range') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="chart-line-variant" title="Range de odds" textColor={colors.textPrimary}>
                  <Card style={styles.cardSection}>
                    <View style={styles.rangeRow}>
                      <View style={styles.rangeField}>
                        <Input keyboardType="decimal-pad" label="Min" onChangeText={setMinOdds} value={minOdds} />
                      </View>
                      <View style={styles.rangeField}>
                        <Input keyboardType="decimal-pad" label="Max" onChangeText={setMaxOdds} value={maxOdds} />
                      </View>
                    </View>
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          if (item === 'dates') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="calendar-range" title="Datas" textColor={colors.textPrimary}>
                  <FlatList
                    contentContainerStyle={styles.presetRow}
                    data={datePresets}
                    horizontal
                    keyExtractor={(preset) => preset.key}
                    renderItem={({ item: preset }) => (
                      <Chip
                        label={preset.label}
                        onPress={preset.onPress}
                      />
                    )}
                    showsHorizontalScrollIndicator={false}
                  />
                  <Card style={styles.cardSection}>
                    <View style={styles.rangeRow}>
                      <View style={styles.rangeField}>
                        <Input
                          label="De"
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
                          label="Até"
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
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          if (item === 'markets') {
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="tag-multiple" title="Tipos de mercado" textColor={colors.textPrimary}>
                  <Card noPadding style={styles.cardSection}>
                    <View style={styles.chipGrid}>
                      {MARKET_OPTIONS.map((market) => (
                        <Chip
                          key={market}
                          label={market}
                          selected={selectedMarkets.includes(market)}
                          onPress={() => toggleString(market, selectedMarkets, setSelectedMarkets)}
                          style={styles.gridChip}
                        />
                      ))}
                    </View>
                  </Card>
                </Section>
              </Animated.View>
            );
          }

          return (
            <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
                <Section icon="sort-variant" title="Ordenar por" textColor={colors.textPrimary}>
                <Card noPadding style={styles.cardSection}>
                  <View style={styles.chipGrid}>
                    {SORT_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={sortBy === option.value}
                        onPress={() => setSortBy(option.value)}
                        style={styles.gridChip}
                      />
                    ))}
                  </View>
                </Card>
              </Section>
            </Animated.View>
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
          <Button onPress={resetFilters} title="Limpar" variant="ghost" />
        </View>
        <View style={styles.footerButton}>
          <Button onPress={applyFilters} title="Aplicar" />
        </View>
      </View>
    </View>
  );
}

function Section({ children, title, textColor, icon }: { children: React.ReactNode; title: string; textColor: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        {icon ? <MaterialCommunityIcons color={textColor} name={icon} size={20} /> : null}
        <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      </View>
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
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  cardSection: {
    padding: 14,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridChip: {
    marginBottom: 0,
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

  /* League list */
  leagueSearchWrap: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  leagueSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  leagueList: {
    maxHeight: 240,
  },
  leagueGroupHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  leagueGroupLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  leagueRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  leagueRowText: {
    flex: 1,
    fontSize: 14,
  },
  leagueEmptySearch: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  leagueEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
