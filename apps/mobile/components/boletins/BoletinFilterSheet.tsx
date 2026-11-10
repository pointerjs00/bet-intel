import React, { useCallback, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Pressable } from '../ui/Pressable';
import GorhomBottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { ionicon } from '../../types/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sport } from '@betintel/shared';
import { RangeSlider } from '../ui/RangeSlider';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { PressableScale } from '../ui/PressableScale';
import { TeamBadge } from '../ui/TeamBadge';
import { SearchableDropdown } from '../ui/SearchableDropdown';
import { useTheme } from '../../theme/useTheme';
import { DatePickerField } from '../ui/DatePickerField';
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
  dateFrom: Date | null;
  dateTo: Date | null;
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
  const { colors } = useTheme();
  const { bottom: safeBottom } = useSafeAreaInsets();
  // Floating tab bar (height + its bottom margin) sits over the sheet; keep the footer above it.
  const TAB_BAR_HEIGHT = 92;
  const bottomInset = safeBottom + TAB_BAR_HEIGHT;

  const [draftSort, setDraftSort] = useState<BoletinSort>(sort);
  const [draftFilter, setDraftFilter] = useState<BoletinFilter>(filter);
  const [sliderKey, setSliderKey] = useState(0);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [compSearch, setCompSearch] = useState('');

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
      dateFrom: null,
      dateTo: null,
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

  // Active filters in the draft (for the header and the apply button).
  const draftCount =
    (draftFilter.stakeRange[0] > 0 || draftFilter.stakeRange[1] < maxStake ? 1 : 0) +
    (draftFilter.oddsRange[0] > 1 || draftFilter.oddsRange[1] < maxOdds ? 1 : 0) +
    (draftFilter.returnRange[0] > 0 || draftFilter.returnRange[1] < maxReturn ? 1 : 0) +
    (draftFilter.sport ? 1 : 0) +
    (draftFilter.competitions.length ? 1 : 0) +
    (draftFilter.teams.length ? 1 : 0) +
    (draftFilter.sites.length ? 1 : 0) +
    (draftFilter.weekday !== null ? 1 : 0) +
    (draftFilter.legCount !== null ? 1 : 0) +
    (draftFilter.dateFrom || draftFilter.dateTo ? 1 : 0);

  const pill = (key: string | number, label: string, active: boolean, onPress: () => void, left?: React.ReactNode) => (
    <PressableScale
      key={key}
      onPress={onPress}
      scaleDown={0.94}
      style={[styles.pill, {
        backgroundColor: active ? `${colors.primary}24` : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      }]}
    >
      {left}
      <Text numberOfLines={1} style={[styles.pillText, { color: active ? colors.primary : colors.textSecondary }]}>{label}</Text>
    </PressableScale>
  );

  const section = (icon: string, title: string, children: React.ReactNode) => (
    <View style={[styles.section, { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: `${colors.primary}1F` }]}>
          <Ionicons color={colors.primary} name={ionicon(icon)} size={14} />
        </View>
        <Text style={[styles.sectionHeadText, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {children}
    </View>
  );

  const label = (text: string) => <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{text}</Text>;

  const numberRow = (options: Array<{ label: string; value: number }>, current: number | null, onToggle: (v: number) => void) => (
    <View style={styles.dayRow}>
      {options.map((opt) => {
        const active = current === opt.value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onToggle(opt.value)}
            scaleDown={0.92}
            style={[styles.dayBtn, {
              backgroundColor: active ? colors.primary : colors.surface,
              borderColor: active ? colors.primary : colors.border,
            }]}
          >
            <Text style={[styles.dayText, { color: active ? '#0B0D0C' : colors.textSecondary }]}>{opt.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );

  return (
    <>
      <GorhomBottomSheet
        ref={sheetRef}
        snapPoints={['70%', '92%']}
        index={-1}
        enablePanDownToClose
        onChange={onSheetChange}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border, width: 40, height: 4, borderRadius: 2 }}
        backgroundStyle={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
      >
        {/* Header (fixed) */}
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Ordenar e filtrar</Text>
            <Text style={[styles.sheetSub, { color: colors.textMuted }]}>
              {draftCount ? `${draftCount} filtro${draftCount > 1 ? 's' : ''} ativo${draftCount > 1 ? 's' : ''}` : 'Sem filtros'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Fechar"
            hitSlop={10}
            onPress={() => sheetRef.current?.close()}
            style={[styles.closeBtn, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons color={colors.textSecondary} name="close" size={18} />
          </Pressable>
        </View>

        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* SORT */}
          {section('swap-vertical', 'Ordenar', (
            <>
              <View style={styles.pillWrap}>
                {SORT_OPTIONS.map((opt) =>
                  pill(opt.key, opt.label, draftSort.by === opt.key, () => setDraftSort((prev) => ({ ...prev, by: opt.key })),
                    <Ionicons color={draftSort.by === opt.key ? colors.primary : colors.textMuted} name={ionicon(opt.icon)} size={14} />))}
              </View>
              <View style={[styles.segment, { backgroundColor: colors.surface }]}>
                {(['desc', 'asc'] as const).map((d) => {
                  const active = draftSort.dir === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => { if (!active) toggleSortDir(); }}
                      style={[styles.segmentItem, active && { backgroundColor: `${colors.primary}24` }]}
                    >
                      <Ionicons color={active ? colors.primary : colors.textMuted} name={d === 'desc' ? 'arrow-down' : 'arrow-up'} size={14} />
                      <Text style={[styles.segmentText, { color: active ? colors.primary : colors.textSecondary }]}>
                        {d === 'desc' ? (draftSort.by === 'date' ? 'Mais recentes' : 'Maior primeiro') : (draftSort.by === 'date' ? 'Mais antigos' : 'Menor primeiro')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ))}

          {/* VALUES */}
          {section('cash-outline', 'Valores', (
            <>
              {label('STAKE')}
              <RangeSlider
                key={`stake-${sliderKey}`}
                min={0} max={maxStake} step={0.5}
                low={draftFilter.stakeRange[0]} high={draftFilter.stakeRange[1]}
                onLowChange={(v) => setDraftFilter((p) => ({ ...p, stakeRange: [v, p.stakeRange[1]] }))}
                onHighChange={(v) => setDraftFilter((p) => ({ ...p, stakeRange: [p.stakeRange[0], v] }))}
                formatValue={formatCurrency}
              />
              {label('ODD TOTAL')}
              <RangeSlider
                key={`odds-${sliderKey}`}
                min={1} max={maxOdds} step={0.01}
                low={draftFilter.oddsRange[0]} high={draftFilter.oddsRange[1]}
                onLowChange={(v) => setDraftFilter((p) => ({ ...p, oddsRange: [v, p.oddsRange[1]] }))}
                onHighChange={(v) => setDraftFilter((p) => ({ ...p, oddsRange: [p.oddsRange[0], v] }))}
                formatValue={formatOdds}
              />
              {label('RETORNO')}
              <RangeSlider
                key={`return-${sliderKey}`}
                min={0} max={maxReturn} step={0.5}
                low={draftFilter.returnRange[0]} high={draftFilter.returnRange[1]}
                onLowChange={(v) => setDraftFilter((p) => ({ ...p, returnRange: [v, p.returnRange[1]] }))}
                onHighChange={(v) => setDraftFilter((p) => ({ ...p, returnRange: [p.returnRange[0], v] }))}
                formatValue={formatCurrency}
              />
            </>
          ))}

          {/* WHEN */}
          {section('calendar-outline', 'Quando', (
            <>
              <View style={styles.dateRangeRow}>
                <View style={styles.dateField}>
                  <DatePickerField
                    label="De"
                    value={draftFilter.dateFrom}
                    placeholder="Início"
                    maxDate={draftFilter.dateTo ?? undefined}
                    onChange={(d) => setDraftFilter((p) => ({ ...p, dateFrom: d }))}
                    onClear={() => setDraftFilter((p) => ({ ...p, dateFrom: null }))}
                  />
                </View>
                <View style={styles.dateField}>
                  <DatePickerField
                    label="Até"
                    value={draftFilter.dateTo}
                    placeholder="Fim"
                    minDate={draftFilter.dateFrom ?? undefined}
                    onChange={(d) => setDraftFilter((p) => ({ ...p, dateTo: d }))}
                    onClear={() => setDraftFilter((p) => ({ ...p, dateTo: null }))}
                  />
                </View>
              </View>
              {label('DIA DA SEMANA')}
              {numberRow(WEEKDAY_OPTIONS, draftFilter.weekday, (v) =>
                setDraftFilter((prev) => ({ ...prev, weekday: prev.weekday === v ? null : v })))}
            </>
          ))}

          {/* WHAT */}
          {section('receipt-outline', 'Apostas', (
            <>
              {availableSports.length > 1 ? (
                <>
                  {label('DESPORTO')}
                  <View style={styles.pillWrap}>
                    {availableSports.map((s) => pill(s, SPORT_LABELS[s] ?? s, draftFilter.sport === s, () => setSport(s)))}
                  </View>
                </>
              ) : null}

              {allSites.length > 0 ? (
                <>
                  {label('CASA DE APOSTAS')}
                  <View style={styles.pillWrap}>
                    {allSites.map((site) => {
                      const active = draftFilter.sites.includes(site.slug);
                      return pill(site.slug, site.name, active, () =>
                        setDraftFilter((prev) => ({
                          ...prev,
                          sites: active ? prev.sites.filter((x) => x !== site.slug) : [...prev.sites, site.slug],
                        })),
                        site.logo ? <Image resizeMode="contain" source={site.logo} style={styles.siteLogo} /> : undefined);
                    })}
                  </View>
                </>
              ) : null}

              {label('Nº DE SELEÇÕES')}
              {numberRow(LEG_COUNT_OPTIONS, draftFilter.legCount, (v) =>
                setDraftFilter((prev) => ({ ...prev, legCount: prev.legCount === v ? null : v })))}

              {allCompetitions.length > 0 ? (
                <>
                  {label('COMPETIÇÃO')}
                  <PressableScale
                    onPress={() => { setCompOpen((v) => !v); setCompSearch(''); }}
                    style={[styles.triggerBtn, { backgroundColor: colors.surface, borderColor: compOpen ? colors.primary : colors.border }]}
                  >
                    <Ionicons color={colors.textMuted} name="trophy-outline" size={16} />
                    <Text numberOfLines={1} style={[styles.triggerText, { color: draftFilter.competitions.length > 0 ? colors.textPrimary : colors.textMuted }]}>
                      {draftFilter.competitions.length > 0 ? draftFilter.competitions.join(', ') : 'Todas as competições'}
                    </Text>
                    <Ionicons color={colors.textMuted} name={compOpen ? 'chevron-up' : 'chevron-down'} size={16} />
                  </PressableScale>
                  {compOpen && (
                    <Animated.View entering={FadeInDown.duration(140)} style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <View style={[styles.compSearchRow, { borderBottomColor: colors.border }]}>
                        <Ionicons color={colors.textMuted} name="search" size={14} />
                        <TextInput
                          onChangeText={setCompSearch}
                          placeholder="Pesquisar…"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.compSearchInput, { color: colors.textPrimary }]}
                          value={compSearch}
                        />
                        {compSearch.length > 0 && (
                          <Pressable hitSlop={8} onPress={() => setCompSearch('')}>
                            <Ionicons color={colors.textMuted} name="close-circle" size={14} />
                          </Pressable>
                        )}
                      </View>
                      {visibleCompetitions
                        .filter((c) => c.name.toLowerCase().includes(compSearch.toLowerCase()))
                        .map((c, i) => {
                          const active = draftFilter.competitions.includes(c.name);
                          return (
                            <PressableScale
                              key={c.name}
                              onPress={() =>
                                setDraftFilter((prev) => ({
                                  ...prev,
                                  competitions: active ? prev.competitions.filter((x) => x !== c.name) : [...prev.competitions, c.name],
                                }))
                              }
                              style={[styles.dropdownItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                            >
                              <CompetitionBadge name={c.name} size={16} />
                              <Text numberOfLines={1} style={[styles.dropdownItemText, { color: active ? colors.primary : colors.textPrimary }]}>{c.name}</Text>
                              <Ionicons color={active ? colors.primary : colors.border} name={active ? 'checkmark-circle' : 'ellipse-outline'} size={18} />
                            </PressableScale>
                          );
                        })}
                    </Animated.View>
                  )}
                </>
              ) : null}

              {allTeams.length > 0 ? (
                <>
                  {label('EQUIPA')}
                  <PressableScale
                    onPress={() => setShowTeamModal(true)}
                    style={[styles.triggerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Ionicons color={colors.textMuted} name="search" size={16} />
                    <Text style={[styles.triggerText, { color: colors.textMuted }]}>
                      {draftFilter.teams.length > 0 ? 'Adicionar equipa…' : 'Pesquisar equipas…'}
                    </Text>
                    <Ionicons color={colors.textMuted} name="add" size={16} />
                  </PressableScale>
                  {draftFilter.teams.length > 0 && (
                    <View style={styles.pillWrap}>
                      {draftFilter.teams.map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => setDraftFilter((p) => ({ ...p, teams: p.teams.filter((x) => x !== t) }))}
                          style={[styles.pill, { backgroundColor: `${colors.primary}24`, borderColor: colors.primary }]}
                        >
                          <TeamBadge name={t} size={16} />
                          <Text numberOfLines={1} style={[styles.pillText, { color: colors.primary }]}>{t}</Text>
                          <Ionicons color={colors.primary} name="close" size={13} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              ) : null}
            </>
          ))}
        </BottomSheetScrollView>

        {/* Sticky footer — clears the tab bar */}
        <View style={[styles.applyBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomInset + 10 }]}>
          <PressableScale
            onPress={handleReset}
            scaleDown={0.97}
            style={[styles.footerBtn, styles.resetBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.resetBtnText, { color: colors.textPrimary }]}>Limpar</Text>
          </PressableScale>
          <PressableScale onPress={handleApply} scaleDown={0.98} style={[styles.footerBtn, styles.applyBtn, { backgroundColor: colors.primary }]}>
            <Ionicons color="#0B0D0C" name="checkmark" size={18} />
            <Text style={styles.applyBtnText}>{draftCount ? `Aplicar ${draftCount} filtro${draftCount > 1 ? 's' : ''}` : 'Aplicar'}</Text>
          </PressableScale>
        </View>
      </GorhomBottomSheet>

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
  flex: { flex: 1 },
  content: { gap: 12, paddingBottom: 20, paddingHorizontal: 16, paddingTop: 12 },
  sheetHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, paddingBottom: 12, paddingHorizontal: 20, paddingTop: 2 },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  sheetSub: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 1 },
  closeBtn: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  section: { borderRadius: 18, gap: 10, padding: 14 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 2 },
  sectionIcon: { alignItems: 'center', borderRadius: 8, height: 24, justifyContent: 'center', width: 24 },
  sectionHeadText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginTop: 2 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, height: 36, maxWidth: '100%', paddingHorizontal: 12 },
  pillText: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  siteLogo: { borderRadius: 4, height: 16, width: 16 },
  segment: { borderRadius: 12, flexDirection: 'row', gap: 4, padding: 3 },
  segmentItem: { alignItems: 'center', borderRadius: 9, flex: 1, flexDirection: 'row', gap: 6, height: 36, justifyContent: 'center' },
  segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, height: 40, justifyContent: 'center' },
  dayText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  dropdownList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  dropdownItem: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownItemText: { flex: 1, fontSize: 14, fontWeight: '500' },
  triggerBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, height: 46, paddingHorizontal: 14 },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '500' },
  dateRangeRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  applyBar: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  footerBtn: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 6, height: 50, justifyContent: 'center' },
  resetBtn: { borderWidth: 1, paddingHorizontal: 22 },
  resetBtnText: { fontSize: 15, fontWeight: '700' },
  applyBtn: { flex: 1 },
  applyBtnText: { color: '#0B0D0C', fontSize: 15, fontWeight: '800' },
  compSearchRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  compSearchInput: { flex: 1, fontSize: 14, padding: 0 },
});
