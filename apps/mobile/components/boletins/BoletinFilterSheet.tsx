import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import GorhomBottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sport } from '@betintel/shared';
import { RangeSlider } from '../ui/RangeSlider';
import { Chip } from '../ui/Chip';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { TeamBadge } from '../ui/TeamBadge';
import { SearchableDropdown } from '../ui/SearchableDropdown';
import { CompetitionPickerModal } from '../ui/CompetitionPickerModal';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { type BettingSite } from '../../utils/sportAssets';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const SPORT_LABELS: Partial<Record<Sport, string>> = {
  [Sport.FOOTBALL]: '⚽ Futebol',
  [Sport.BASKETBALL]: '🏀 Basquetebol',
  [Sport.TENNIS]: '🎾 Ténis',
  [Sport.HANDBALL]: '🤾 Andebol',
  [Sport.VOLLEYBALL]: '🏐 Voleibol',
  [Sport.HOCKEY]: '🏒 Hóquei',
  [Sport.RUGBY]: '🏉 Rugby',
  [Sport.AMERICAN_FOOTBALL]: '🏈 F. Americano',
  [Sport.BASEBALL]: '⚾ Basebol',
  [Sport.OTHER]: '🏅 Outro',
};

export type SortBy = 'date' | 'stake' | 'odds' | 'return' | 'events';
export type SortDir = 'asc' | 'desc';

export interface BoletinSort {
  by: SortBy;
  dir: SortDir;
}

export interface BoletinFilter {
  stakeRange: [number, number];
  oddsRange: [number, number];
  returnRange: [number, number];
  sport: Sport | null;
  competitions: string[];
  teams: string[];
  sites: string[];
}

export interface CompetitionEntry { name: string; sport: Sport }
export interface TeamEntry { name: string; sport: Sport }

interface BoletinFilterSheetProps {
  sheetRef: React.RefObject<GorhomBottomSheet>;
  sort: BoletinSort;
  filter: BoletinFilter;
  maxStake: number;
  maxOdds: number;
  maxReturn: number;
  allCompetitions: CompetitionEntry[];
  allTeams: TeamEntry[];
  allSites: BettingSite[];
  onApply: (sort: BoletinSort, filter: BoletinFilter) => void;
  /** Called whenever the sheet snap index changes (-1 = closed, ≥0 = open) */
  onIndexChange?: (index: number) => void;
}

const SORT_OPTIONS: Array<{ key: SortBy; label: string }> = [
  { key: 'date', label: '📅 Data' },
  { key: 'stake', label: '💰 Stake' },
  { key: 'odds', label: '🎯 Odds' },
  { key: 'return', label: '💸 Retorno' },
  { key: 'events', label: '⚽ Eventos' },
];

export function BoletinFilterSheet({
  sheetRef,
  sort,
  filter,
  maxStake,
  maxOdds,
  maxReturn,
  allCompetitions,
  allTeams,
  allSites,
  onApply,
  onIndexChange,
}: BoletinFilterSheetProps) {
  const { colors, tokens } = useTheme();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
  const bottomInset = safeBottom + TAB_BAR_HEIGHT;

  const [draftSort, setDraftSort] = useState<BoletinSort>(sort);
  const [draftFilter, setDraftFilter] = useState<BoletinFilter>(filter);
  const [sliderKey, setSliderKey] = useState(0);
  const [showCompModal, setShowCompModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  const onSheetChange = useCallback(
    (index: number) => {
      onIndexChange?.(index);
      if (index >= 0) {
        setDraftSort(sort);
        setDraftFilter(filter);
        setSliderKey((k) => k + 1);
      }
    },
    [sort, filter, onIndexChange],
  );

  const handleApply = () => {
    onApply(draftSort, draftFilter);
    sheetRef.current?.close();
  };

  const handleReset = () => {
    setDraftSort({ by: 'date', dir: 'desc' });
    setDraftFilter({
      stakeRange: [0, maxStake],
      oddsRange: [1, maxOdds],
      returnRange: [0, maxReturn],
      sport: null,
      competitions: [],
      teams: [],
      sites: [],
    });
    setSliderKey((k) => k + 1);
  };

  const toggleSortDir = () =>
    setDraftSort((prev) => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />
    ),
    [],
  );

  const availableSports = useMemo(() => {
    const set = new Set<Sport>();
    allCompetitions.forEach((c) => set.add(c.sport));
    return Array.from(set);
  }, [allCompetitions]);

  const visibleCompetitions = useMemo(
    () => (draftFilter.sport ? allCompetitions.filter((c) => c.sport === draftFilter.sport) : allCompetitions),
    [allCompetitions, draftFilter.sport],
  );

  const visibleTeams = useMemo(
    () => (draftFilter.sport ? allTeams.filter((t) => t.sport === draftFilter.sport) : allTeams),
    [allTeams, draftFilter.sport],
  );

  const compSections = useMemo(() => {
    const countryMap = new Map<string, CompetitionEntry[]>();
    for (const c of visibleCompetitions) {
      const sport = c.sport;
      const sportLabel = SPORT_LABELS[sport] ?? sport;
      if (!countryMap.has(sportLabel)) countryMap.set(sportLabel, []);
      countryMap.get(sportLabel)!.push(c);
    }
    return Array.from(countryMap.entries()).map(([group, comps]) => ({
      title: group,
      country: group,
      data: comps.map((c) => ({ label: c.name, value: c.name })),
    }));
  }, [visibleCompetitions]);

  const teamItems = useMemo(
    () => visibleTeams.map((t) => ({ label: t.name, value: t.name })),
    [visibleTeams],
  );

  const setSport = (s: Sport) => {
    setDraftFilter((prev) => ({
      ...prev,
      sport: prev.sport === s ? null : s,
      competitions:
        prev.sport === s
          ? prev.competitions
          : prev.competitions.filter((c) => allCompetitions.find((ac) => ac.name === c && ac.sport === s)),
      teams:
        prev.sport === s
          ? prev.teams
          : prev.teams.filter((t) => allTeams.find((at) => at.name === t && at.sport === s)),
    }));
  };

  return (
    <>
      <GorhomBottomSheet
        ref={sheetRef}
        snapPoints={['60%', '90%']}
        index={-1}
        enablePanDownToClose
        onChange={onSheetChange}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 40, height: 4, borderRadius: 2 }}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Ordenar e Filtrar</Text>
            <Pressable hitSlop={12} onPress={handleReset}>
              <Text style={[styles.resetText, { color: colors.primary }]}>Repor</Text>
            </Pressable>
          </View>

          {/* SORT */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ordenar por</Text>
          <View style={styles.sortRow}>
            <View style={styles.sortChipsScroll}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortChips}>
              {SORT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  selected={draftSort.by === opt.key}
                  onPress={() => setDraftSort((prev) => ({ ...prev, by: opt.key }))}
                />
              ))}
            </ScrollView>
            </View>
            <Pressable
              hitSlop={10}
              onPress={toggleSortDir}
              style={[styles.dirButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Ionicons color={colors.primary} name={draftSort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={18} />
            </Pressable>
          </View>

          {/* STAKE RANGE */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Stake (€)</Text>
          <RangeSlider
            key={`stake-${sliderKey}`}
            min={0} max={maxStake} step={0.5}
            low={draftFilter.stakeRange[0]} high={draftFilter.stakeRange[1]}
            onLowChange={(v) => setDraftFilter((p) => ({ ...p, stakeRange: [v, p.stakeRange[1]] }))}
            onHighChange={(v) => setDraftFilter((p) => ({ ...p, stakeRange: [p.stakeRange[0], v] }))}
            formatValue={formatCurrency}
          />

          {/* ODDS RANGE */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Odds totais</Text>
          <RangeSlider
            key={`odds-${sliderKey}`}
            min={1} max={maxOdds} step={0.01}
            low={draftFilter.oddsRange[0]} high={draftFilter.oddsRange[1]}
            onLowChange={(v) => setDraftFilter((p) => ({ ...p, oddsRange: [v, p.oddsRange[1]] }))}
            onHighChange={(v) => setDraftFilter((p) => ({ ...p, oddsRange: [p.oddsRange[0], v] }))}
            formatValue={formatOdds}
          />

          {/* RETURN RANGE */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Retorno (€)</Text>
          <RangeSlider
            key={`return-${sliderKey}`}
            min={0} max={maxReturn} step={0.5}
            low={draftFilter.returnRange[0]} high={draftFilter.returnRange[1]}
            onLowChange={(v) => setDraftFilter((p) => ({ ...p, returnRange: [v, p.returnRange[1]] }))}
            onHighChange={(v) => setDraftFilter((p) => ({ ...p, returnRange: [p.returnRange[0], v] }))}
            formatValue={formatCurrency}
          />

          {/* BETTING SITES */}
          {allSites.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Casa de apostas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortChips}>
                {allSites.map((site) => (
                  <Chip
                    key={site.slug}
                    label={site.name}
                    selected={draftFilter.sites.includes(site.slug)}
                    onPress={() =>
                      setDraftFilter((prev) => ({
                        ...prev,
                        sites: prev.sites.includes(site.slug)
                          ? prev.sites.filter((s) => s !== site.slug)
                          : [...prev.sites, site.slug],
                      }))
                    }
                  />
                ))}
              </ScrollView>
            </>
          )}

          {/* SPORT */}
          {availableSports.length > 1 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Desporto</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortChips}>
                {availableSports.map((s) => (
                  <Chip
                    key={s}
                    label={SPORT_LABELS[s] ?? s}
                    selected={draftFilter.sport === s}
                    onPress={() => setSport(s)}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {/* COMPETITIONS */}
          {allCompetitions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Competição</Text>
              <Pressable
                onPress={() => setShowCompModal(true)}
                style={[styles.triggerBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons color={colors.textMuted} name="search" size={16} />
                <Text style={[styles.triggerText, { color: draftFilter.competitions.length > 0 ? colors.textPrimary : colors.textMuted }]}>
                  {draftFilter.competitions.length > 0
                    ? `${draftFilter.competitions.length} selecionada${draftFilter.competitions.length > 1 ? 's' : ''}`
                    : 'Pesquisar competições…'}
                </Text>
                <Ionicons color={colors.textMuted} name="chevron-down" size={14} />
              </Pressable>
              {draftFilter.competitions.length > 0 && (
                <View style={styles.selectedChips}>
                  {draftFilter.competitions.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() =>
                        setDraftFilter((p) => ({ ...p, competitions: p.competitions.filter((x) => x !== c) }))
                      }
                      style={[styles.selectedChip, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
                    >
                      <CompetitionBadge name={c} size={14} />
                      <Text numberOfLines={1} style={[styles.selectedChipText, { color: colors.primary }]}>{c}</Text>
                      <Ionicons color={colors.primary} name="close" size={12} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {/* TEAMS */}
          {allTeams.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Equipa</Text>
              <Pressable
                onPress={() => setShowTeamModal(true)}
                style={[styles.triggerBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons color={colors.textMuted} name="search" size={16} />
                <Text style={[styles.triggerText, { color: draftFilter.teams.length > 0 ? colors.textPrimary : colors.textMuted }]}>
                  {draftFilter.teams.length > 0
                    ? `${draftFilter.teams.length} selecionada${draftFilter.teams.length > 1 ? 's' : ''}`
                    : 'Pesquisar equipas…'}
                </Text>
                <Ionicons color={colors.textMuted} name="chevron-down" size={14} />
              </Pressable>
              {draftFilter.teams.length > 0 && (
                <View style={styles.selectedChips}>
                  {draftFilter.teams.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() =>
                        setDraftFilter((p) => ({ ...p, teams: p.teams.filter((x) => x !== t) }))
                      }
                      style={[styles.selectedChip, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
                    >
                      <TeamBadge name={t} size={14} />
                      <Text numberOfLines={1} style={[styles.selectedChipText, { color: colors.primary }]}>{t}</Text>
                      <Ionicons color={colors.primary} name="close" size={12} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </BottomSheetScrollView>

        {/* Sticky apply button — inside the sheet, clears the tab bar via paddingBottom */}
        <View
          style={[
            styles.applyBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: bottomInset + 12,
            },
          ]}
        >
          <Pressable onPress={handleApply} style={[styles.applyBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.applyBtnText}>Aplicar</Text>
          </Pressable>
        </View>
      </GorhomBottomSheet>

      <CompetitionPickerModal
        visible={showCompModal}
        onClose={() => setShowCompModal(false)}
        title="Competição"
        sections={compSections}
        sport={draftFilter.sport ?? undefined}
        multiSelect
        selectedValues={draftFilter.competitions}
        onSelectMultiple={(vals) => setDraftFilter((p) => ({ ...p, competitions: vals }))}
      />

      <SearchableDropdown
        visible={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        title="Equipa"
        items={teamItems}
        renderLeft={(value) => <TeamBadge name={value} size={22} />}
        onSelect={() => {}}
        multiSelect
        selectedValues={draftFilter.teams}
        onSelectMultiple={(vals) => setDraftFilter((p) => ({ ...p, teams: vals }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 8 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  resetText: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' },
  sortRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sortChipsScroll: { flex: 1, overflow: 'hidden' },
  sortChips: { gap: 8 },
  dirButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  triggerBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '500' },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedChip: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedChipText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  applyBar: { borderTopWidth: 1, marginBottom: 30, paddingBottom: 30, paddingHorizontal: 20, paddingTop: 20 },
  applyBtn: { alignItems: 'center', borderRadius: 14, paddingVertical: 14 },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
