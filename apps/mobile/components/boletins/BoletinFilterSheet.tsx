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
import { PressableScale } from '../ui/PressableScale';
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
  weekday: number | null;
  legCount: number | null;
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

const WEEKDAY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

/** 6 = "6 or more" sentinel handled in the bets filter logic */
const LEG_COUNT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6+', value: 6 },
];

const SORT_OPTIONS: Array<{ key: SortBy; label: string; icon: string }> = [
  { key: 'date',   label: 'Data',    icon: 'calendar-outline' },
  { key: 'stake',  label: 'Stake',   icon: 'cash-outline' },
  { key: 'odds',   label: 'Odds',    icon: 'stats-chart-outline' },
  { key: 'return', label: 'Retorno', icon: 'trending-up-outline' },
  { key: 'events', label: 'Eventos', icon: 'football-outline' },
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
  const [sitesOpen, setSitesOpen] = useState(false);
  const [sportOpen, setSportOpen] = useState(false);

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
      weekday: null,
      legCount: null,
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
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ordenar por</Text>
            <PressableScale
              hitSlop={10}
              onPress={toggleSortDir}
              scaleDown={0.92}
              style={[styles.dirButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <Ionicons color={colors.primary} name={draftSort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={15} />
            </PressableScale>
          </View>
          <View style={styles.filterBtnRow}>
            {SORT_OPTIONS.map((opt) => {
              const active = draftSort.by === opt.key;
              return (
                <PressableScale
                  key={opt.key}
                  onPress={() => setDraftSort((prev) => ({ ...prev, by: opt.key }))}
                  scaleDown={0.95}
                  style={[styles.filterBtn, {
                    backgroundColor: active ? colors.primary : colors.surfaceRaised,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                >
                  <Ionicons name={opt.icon as any} size={14} color={active ? '#fff' : colors.textSecondary} />
                  <Text style={[styles.filterBtnLabel, { color: active ? '#fff' : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
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
              <PressableScale
                onPress={() => setSitesOpen((v) => !v)}
                style={[styles.dropdownHeader, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Text style={[styles.dropdownHeaderText, { color: draftFilter.sites.length > 0 ? colors.textPrimary : colors.textMuted }]}>
                  {draftFilter.sites.length > 0
                    ? draftFilter.sites.map((slug) => allSites.find((s) => s.slug === slug)?.name ?? slug).join(', ')
                    : 'Todas as casas'}
                </Text>
                <Ionicons color={colors.textMuted} name={sitesOpen ? 'chevron-up' : 'chevron-down'} size={16} />
              </PressableScale>
              {sitesOpen && (
                <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                  {allSites.map((site, i) => {
                    const active = draftFilter.sites.includes(site.slug);
                    return (
                      <PressableScale
                        key={site.slug}
                        onPress={() =>
                          setDraftFilter((prev) => ({
                            ...prev,
                            sites: active
                              ? prev.sites.filter((s) => s !== site.slug)
                              : [...prev.sites, site.slug],
                          }))
                        }
                        style={[styles.dropdownItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                      >
                        <Text style={[styles.dropdownItemText, { color: active ? colors.primary : colors.textPrimary }]}>
                          {site.name}
                        </Text>
                        {active && <Ionicons color={colors.primary} name="checkmark" size={16} />}
                      </PressableScale>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* SPORT */}
          {availableSports.length > 1 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Desporto</Text>
              <PressableScale
                onPress={() => setSportOpen((v) => !v)}
                style={[styles.dropdownHeader, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Text style={[styles.dropdownHeaderText, { color: draftFilter.sport ? colors.textPrimary : colors.textMuted }]}>
                  {draftFilter.sport ? (SPORT_LABELS[draftFilter.sport] ?? draftFilter.sport) : 'Todos os desportos'}
                </Text>
                <Ionicons color={colors.textMuted} name={sportOpen ? 'chevron-up' : 'chevron-down'} size={16} />
              </PressableScale>
              {sportOpen && (
                <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                  {availableSports.map((s, i) => {
                    const active = draftFilter.sport === s;
                    return (
                      <PressableScale
                        key={s}
                        onPress={() => { setSport(s); setSportOpen(false); }}
                        style={[styles.dropdownItem, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                      >
                        <Text style={[styles.dropdownItemText, { color: active ? colors.primary : colors.textPrimary }]}>
                          {SPORT_LABELS[s] ?? s}
                        </Text>
                        {active && <Ionicons color={colors.primary} name="checkmark" size={16} />}
                      </PressableScale>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* COMPETITIONS */}
          {allCompetitions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Competição</Text>
              <PressableScale
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
              </PressableScale>
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

          {/* WEEKDAY */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Dia da semana</Text>
          <View style={styles.filterBtnRow}>
            {WEEKDAY_OPTIONS.map((opt) => {
              const active = draftFilter.weekday === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  onPress={() => setDraftFilter((prev) => ({
                    ...prev,
                    weekday: prev.weekday === opt.value ? null : opt.value,
                  }))}
                  scaleDown={0.95}
                  style={[styles.filterBtn, {
                    backgroundColor: active ? colors.primary : colors.surfaceRaised,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.filterBtnLabel, { color: active ? '#fff' : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* LEG COUNT */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Nº de seleções</Text>
          <View style={styles.filterBtnRow}>
            {LEG_COUNT_OPTIONS.map((opt) => {
              const active = draftFilter.legCount === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  onPress={() => setDraftFilter((prev) => ({
                    ...prev,
                    legCount: prev.legCount === opt.value ? null : opt.value,
                  }))}
                  scaleDown={0.95}
                  style={[styles.filterBtn, {
                    backgroundColor: active ? colors.primary : colors.surfaceRaised,
                    borderColor: active ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.filterBtnLabel, { color: active ? '#fff' : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {/* TEAMS */}
          {allTeams.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Equipa</Text>
                <PressableScale
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
              </PressableScale>
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
          <PressableScale onPress={handleApply} scaleDown={0.98} style={[styles.applyBtn, { backgroundColor: colors.primary }]}> 
            <Text style={styles.applyBtnText}>Aplicar</Text>
          </PressableScale>
        </View>
      </GorhomBottomSheet>

      <CompetitionPickerModal
        visible={showCompModal}
        onClose={() => setShowCompModal(false)}
        title="Competição"
        sections={compSections}
        sport={draftFilter.sport ?? undefined}
        performanceMode="fast"
        preloadWhenHidden
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
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sortChips: { gap: 8 },
  dirButton: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  filterBtnRow: { flexDirection: 'row', gap: 6 },
  filterBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, gap: 3, paddingVertical: 10 },
  filterBtnLabel: { fontSize: 11, fontWeight: '700' },
  dropdownHeader: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownHeaderText: { flex: 1, fontSize: 14, fontWeight: '600' },
  dropdownList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownItemText: { fontSize: 14, fontWeight: '500' },
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
