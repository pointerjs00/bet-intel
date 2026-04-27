import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BoletinStatus, ItemResult, Sport } from '@betintel/shared';
import { BoletinItem } from '../../components/boletins/BoletinItem';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { WinCelebration } from '../../components/boletins/WinCelebration';
import { EditItemModal, type EditItemInitialValues } from '../../components/boletins/EditItemModal';
import { ShareCard } from '../../components/boletins/ShareCard';
import { useShareBoletinSheet } from '../../components/social/ShareBoletinProvider';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { PressableScale } from '../../components/ui/PressableScale';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import type { DropdownSection } from '../../components/ui/SearchableDropdown';
import { CompetitionPickerModal } from '../../components/ui/CompetitionPickerModal';
import type { CompetitionPickerSection } from '../../components/ui/CompetitionPickerModal';
import { InfoButton } from '../../components/ui/InfoButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import {
  useBoletinDetail,
  useUpdateBoletinMutation,
  useUpdateBoletinItemsMutation,
  useUpdateBoletinItemMutation,
  useAddBoletinItemMutation,
  useDeleteBoletinItemMutation,
  useDeleteBoletinMutation,
} from '../../services/boletinService';
import { useAuthStore } from '../../stores/authStore';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useCompetitions, useTeams, useMarkets } from '../../services/referenceService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatDateToDDMMYYYY, parseDDMMYYYYToISO, parseDDMMYYYYToDate } from '../../utils/formatters';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { BETTING_SITES, getCountryFlagEmoji } from '../../utils/sportAssets';
import { SelectionInsightsSheet, type SelectionInsightsItem } from '../../components/boletins/SelectionInsightsSheet';
import { BoletinInsightsSection } from '../../components/boletins/BoletinInsightsSection';
import { ExplainBoletinSheet } from '../../components/boletins/ExplainBoletinSheet';

const SPORT_OPTIONS: Array<{ key: Sport; label: string; icon: string }> = [
  { key: Sport.FOOTBALL, label: 'Futebol', icon: '⚽' },
  { key: Sport.BASKETBALL, label: 'Basquetebol', icon: '🏀' },
  { key: Sport.TENNIS, label: 'Ténis', icon: '🎾' },
  { key: Sport.HANDBALL, label: 'Andebol', icon: '🤾' },
  { key: Sport.VOLLEYBALL, label: 'Voleibol', icon: '🏐' },
  { key: Sport.HOCKEY, label: 'Hóquei', icon: '🏒' },
  { key: Sport.RUGBY, label: 'Rugby', icon: '🏉' },
  { key: Sport.AMERICAN_FOOTBALL, label: 'F. Americano', icon: '🏈' },
  { key: Sport.BASEBALL, label: 'Basebol', icon: '⚾' },
  { key: Sport.OTHER, label: 'Outro', icon: '🏅' },
];

export default function BoletinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const { openShareBoletinSheet } = useShareBoletinSheet();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStake, setEditStake] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');
  const [editIsFreebet, setEditIsFreebet] = useState(false);
  const [showEditSites, setShowEditSites] = useState(false);
  const [editBetDate, setEditBetDate] = useState(''); // DD/MM/YYYY display string
  // Target item to remove (confirmation modal)
  const [removeItemTarget, setRemoveItemTarget] = useState<{ boletinId: string; itemId: string } | null>(null);
  // Item currently being edited
  const [editItemTarget, setEditItemTarget] = useState<EditItemInitialValues | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingPublic, setPendingPublic] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [insightsItem, setInsightsItem] = useState<SelectionInsightsItem | null>(null);
  const prevStatusRef = useRef<BoletinStatus | undefined>(undefined);
  const boletinQuery = useBoletinDetail(id);
  const updateMutation = useUpdateBoletinMutation();
  const updateItemsMutation = useUpdateBoletinItemsMutation();
  const updateItemMutation = useUpdateBoletinItemMutation();
  const addItemMutation = useAddBoletinItemMutation();
  const deleteItemMutation = useDeleteBoletinItemMutation();
  const deleteMutation = useDeleteBoletinMutation();

  // ── Add-Selection form state ─────────────────────────────────────────────
  const [addSport, setAddSport] = useState<Sport>(Sport.FOOTBALL);
  const [addCompetition, setAddCompetition] = useState('');
  const [addCompetitionCountry, setAddCompetitionCountry] = useState('');
  const [addHomeTeam, setAddHomeTeam] = useState('');
  const [addHomeTeam2, setAddHomeTeam2] = useState('');
  const [addAwayTeam, setAddAwayTeam] = useState('');
  const [addAwayTeam2, setAddAwayTeam2] = useState('');
  const [addIsDoubles, setAddIsDoubles] = useState(false);
  const [addMarket, setAddMarket] = useState('');
  const [addUseCustomMarket, setAddUseCustomMarket] = useState(false);
  const [addSelection, setAddSelection] = useState('');
  const [addOddValue, setAddOddValue] = useState('');
  const [showAddSports, setShowAddSports] = useState(false);
  const [showAddCompetitions, setShowAddCompetitions] = useState(false);
  const [showAddHomeTeams, setShowAddHomeTeams] = useState(false);
  const [showAddHomeTeams2, setShowAddHomeTeams2] = useState(false);
  const [showAddAwayTeams, setShowAddAwayTeams] = useState(false);
  const [showAddAwayTeams2, setShowAddAwayTeams2] = useState(false);
  const [showAddMarkets, setShowAddMarkets] = useState(false);
  const [addPlayerTourTab, setAddPlayerTourTab] = useState<'ALL' | 'ATP' | 'WTA'>('ALL');
  const [addPlayerTour, setAddPlayerTour] = useState<'ATP' | 'WTA' | null>(null);
  const [addPlayerCountryFilter, setAddPlayerCountryFilter] = useState<string | null>(null);
  const [showAddCountryPicker, setShowAddCountryPicker] = useState(false);

  // ── Reference data for add-form ──────────────────────────────────────────
  const addCompetitionsQuery = useCompetitions(addSport);
  const addTeamsQuery = useTeams(addCompetition ? { sport: addSport, competition: addCompetition } : { sport: addSport });
  const addAllTeamsQuery = useTeams({ sport: addSport });
  const addMarketsQuery = useMarkets(addSport);
  const addAtpQuery = useTeams({ sport: Sport.TENNIS, competition: 'ATP Tour' });
  const addWtaQuery = useTeams({ sport: Sport.TENNIS, competition: 'WTA Tour' });

  const boletin = boletinQuery.data;
  const canEdit = Boolean(boletin && currentUserId && boletin.userId === currentUserId);

  useEffect(() => {
    if (canEdit || !isEditing) {
      return;
    }

    setIsEditing(false);
    setEditItemTarget(null);
    setRemoveItemTarget(null);
    setPendingDelete(false);
    setPendingPublic(false);
    Keyboard.dismiss();
  }, [canEdit, isEditing]);

  // Seed prevStatusRef on first data load (no celebration on mount)
  useEffect(() => {
    if (boletin && prevStatusRef.current === undefined) {
      prevStatusRef.current = boletin.status;
    }
  }, [boletin]);

  const tennisPhotoLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const team of [...(addAtpQuery.data ?? []), ...(addWtaQuery.data ?? [])]) {
      if (!team.imageUrl) continue;
      lookup.set(team.name, team.imageUrl);
      if (team.displayName) lookup.set(team.displayName, team.imageUrl);
    }
    return lookup;
  }, [addAtpQuery.data, addWtaQuery.data]);

  const addAtpPlayerItems = useMemo(() => {
    return (addAtpQuery.data ?? [])
      .filter((t) => !addPlayerCountryFilter || t.country === addPlayerCountryFilter)
      .map((t) => ({
        label: t.displayName ?? t.name,
        value: t.displayName ?? t.name,
        imageUrl: t.imageUrl ?? null,
        subtitle: [t.country, t.rank ? `ATP Nº${t.rank}` : null].filter(Boolean).join(' · ') || undefined,
      }));
  }, [addAtpQuery.data, addPlayerCountryFilter]);

  const addWtaPlayerItems = useMemo(() => {
    return (addWtaQuery.data ?? [])
      .filter((t) => !addPlayerCountryFilter || t.country === addPlayerCountryFilter)
      .map((t) => ({
        label: t.displayName ?? t.name,
        value: t.displayName ?? t.name,
        imageUrl: t.imageUrl ?? null,
        subtitle: [t.country, t.rank ? `WTA Nº${t.rank}` : null].filter(Boolean).join(' · ') || undefined,
      }));
  }, [addWtaQuery.data, addPlayerCountryFilter]);

  const addPlayerSections = useMemo<DropdownSection[] | undefined>(() => {
    if (addSport !== Sport.TENNIS) return undefined;
    const atpItems = addPlayerTourTab !== 'WTA' ? addAtpPlayerItems : [];
    const wtaItems = addPlayerTourTab !== 'ATP' ? addWtaPlayerItems : [];
    const sections: DropdownSection[] = [];
    if (atpItems.length > 0) sections.push({ title: 'ATP', data: atpItems });
    if (wtaItems.length > 0) sections.push({ title: 'WTA', data: wtaItems });
    return sections.length > 0 ? sections : undefined;
  }, [addSport, addPlayerTourTab, addAtpPlayerItems, addWtaPlayerItems]);

  const addWtaPlayerValueSet = useMemo(
    () => new Set((addWtaQuery.data ?? []).map((t) => t.displayName ?? t.name)),
    [addWtaQuery.data],
  );

  const addAvailablePlayerCountries = useMemo(() => {
    if (addSport !== Sport.TENNIS) return [];
    const countries = new Set(
      [...(addAtpQuery.data ?? []), ...(addWtaQuery.data ?? [])]
        .map((t) => t.country)
        .filter((c): c is string => Boolean(c)),
    );
    return [...countries].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [addSport, addAtpQuery.data, addWtaQuery.data]);

  const addCompetitionSections = useMemo<CompetitionPickerSection[]>(() => {
    const comps = addCompetitionsQuery.data ?? [];
    const countryMap = new Map<string, typeof comps>();
    for (const comp of comps) {
      if (!countryMap.has(comp.country)) countryMap.set(comp.country, []);
      countryMap.get(comp.country)!.push(comp);
    }
    const sections = Array.from(countryMap.entries()).map(([country, cs]) => ({
      title: country,
      country,
      data: cs.map((c) => ({ label: c.name, value: c.name, tier: c.tier })),
    }));
    const TOP_6 = ['Portugal', 'Inglaterra', 'Espanha', 'Itália', 'Alemanha', 'França'];
    sections.sort((a, b) => {
      const ai = TOP_6.indexOf(a.country);
      const bi = TOP_6.indexOf(b.country);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.country.localeCompare(b.country, 'pt');
    });
    return sections;
  }, [addCompetitionsQuery.data]);

  const addVisibleCompetitionSections = useMemo<CompetitionPickerSection[]>(() => {
    if (addSport !== Sport.TENNIS || !addPlayerTour) return addCompetitionSections;
    return addCompetitionSections.map((s) => ({
      ...s,
      data: s.data.filter((c) => {
        const isWta = c.value.toUpperCase().includes('WTA') || c.value === 'Billie Jean King Cup';
        return addPlayerTour === 'WTA' ? isWta : !isWta;
      }),
    })).filter((s) => s.data.length > 0);
  }, [addSport, addPlayerTour, addCompetitionSections]);

  const addTeamItems = useMemo(() => {
    const data = addTeamsQuery.data ?? [];
    const source = addCompetition && !addTeamsQuery.isLoading && data.length === 0
      ? (addAllTeamsQuery.data ?? [])
      : data;
    return source.map((team) => ({
      label: team.name,
      value: team.name,
      imageUrl: team.imageUrl ?? tennisPhotoLookup.get(team.name) ?? null,
    }));
  }, [addAllTeamsQuery.data, addCompetition, addTeamsQuery.data, addTeamsQuery.isLoading, tennisPhotoLookup]);

  const addSportLabel = SPORT_OPTIONS.find((s) => s.key === addSport);

  const addFinalHomeTeam = addIsDoubles && addSport === Sport.TENNIS ? `${addHomeTeam} / ${addHomeTeam2}` : addHomeTeam;
  const addFinalAwayTeam = addIsDoubles && addSport === Sport.TENNIS ? `${addAwayTeam} / ${addAwayTeam2}` : addAwayTeam;

  const addMarketSections = useMemo<DropdownSection[]>(() => {
    const data = addMarketsQuery.data ?? [];
    const grouped = new Map<string, typeof data>();
    for (const m of data) {
      const cat = m.category ?? 'Outro';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(m);
    }
    const ORDER = MARKET_CATEGORY_ORDER;
    const sortedCats = [...grouped.keys()].sort(
      (a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)),
    );
    return sortedCats.map((cat) => ({
      title: cat,
      data: (grouped.get(cat) ?? []).map((m) => ({
        label: addFinalHomeTeam && addFinalAwayTeam
          ? humanizeMarket(m.name, addFinalHomeTeam, addFinalAwayTeam)
          : m.name,
        value: m.name,
      })),
    }));
  }, [addMarketsQuery.data, addHomeTeam, addHomeTeam2, addAwayTeam, addAwayTeam2, addIsDoubles, addSport]);

  // Seed edit fields whenever boletin loads or changes (also resets on cancel)
  const seedEditFields = (b: typeof boletin) => {
    if (!b) return;
    setEditName(b.name ?? '');
    setEditStake(String(Number(b.stake)));
    setEditNotes(b.notes ?? '');
    setEditSiteSlug(b.siteSlug ?? '');
    setEditIsFreebet(b.isFreebet);
    setEditBetDate(formatDateToDDMMYYYY(b.betDate));
  };

  useEffect(() => { seedEditFields(boletin); }, [boletin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill selection when market is self-describing (skip for custom market)
  useEffect(() => {
    if (!addUseCustomMarket && isSelfDescribing(addMarket)) {
      setAddSelection(humanizeMarket(addMarket, addFinalHomeTeam, addFinalAwayTeam));
    } else if (!addUseCustomMarket) {
      setAddSelection('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMarket, addHomeTeam, addHomeTeam2, addAwayTeam, addAwayTeam2, addIsDoubles, addSport, addUseCustomMarket]);

  const handleAddItem = useCallback(async () => {
    if (!boletin || !canEdit) return;
    const fHome = addIsDoubles && addSport === Sport.TENNIS
      ? `${addHomeTeam.trim()} / ${addHomeTeam2.trim()}`
      : addHomeTeam.trim();
    const fAway = addIsDoubles && addSport === Sport.TENNIS
      ? `${addAwayTeam.trim()} / ${addAwayTeam2.trim()}`
      : addAwayTeam.trim();
    if (!addHomeTeam.trim() || !addAwayTeam.trim()) {
      showToast('Preenche as duas equipas.', 'error');
      return;
    }
    if (addIsDoubles && addSport === Sport.TENNIS && (!addHomeTeam2.trim() || !addAwayTeam2.trim())) {
      showToast('Preenche os 4 jogadores do par.', 'error');
      return;
    }
    if (!addMarket.trim() || !addSelection.trim()) {
      showToast('Preenche o mercado e a seleção.', 'error');
      return;
    }
    const odd = parseFloat(addOddValue.replace(',', '.'));
    if (!odd || odd < 1.01) {
      showToast('Odd inválida (mín. 1.01).', 'error');
      return;
    }
    try {
      await addItemMutation.mutateAsync({
        boletinId: boletin.id,
        item: {
          homeTeam: fHome,
          awayTeam: fAway,
          competition: addCompetition.trim() || 'Geral',
          sport: addSport,
          market: humanizeMarket(addMarket, fHome, fAway),
          selection: addSelection.trim(),
          oddValue: odd,
        },
      });
      setAddHomeTeam('');
      setAddHomeTeam2('');
      setAddAwayTeam('');
      setAddAwayTeam2('');
      setAddIsDoubles(false);
      setAddMarket('');
      setAddUseCustomMarket(false);
      setAddSelection('');
      setAddOddValue('');
      Keyboard.dismiss();
      showToast('Seleção adicionada.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  }, [boletin, canEdit, addHomeTeam, addHomeTeam2, addAwayTeam, addAwayTeam2, addIsDoubles, addCompetition, addSport, addMarket, addSelection, addOddValue, addItemMutation, showToast]);

  const handleSave = async () => {
    if (!boletin || !canEdit) return;
    const stakeNum = parseFloat(editStake.replace(',', '.'));
    if (!stakeNum || stakeNum <= 0) {
      showToast('Stake inválida.', 'error');
      return;
    }
    const payload: Record<string, unknown> = {
      name: editName.trim() || undefined,
      notes: editNotes.trim() || undefined,
      stake: stakeNum,
      siteSlug: editSiteSlug.trim() || null,
      isFreebet: editIsFreebet,
      betDate: editBetDate.length === 10 ? (parseDDMMYYYYToISO(editBetDate) ?? null) : null,
    };
    try {
      await updateMutation.mutateAsync({ id: boletin.id, payload: payload as Parameters<typeof updateMutation.mutateAsync>[0]['payload'] });
      setIsEditing(false);
      Keyboard.dismiss();
      showToast('Boletim atualizado.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleCancelEdit = () => {
    seedEditFields(boletin);
    setIsEditing(false);
    Keyboard.dismiss();
  };

  const handleClone = useCallback(() => {
    if (!boletin) return;
    const builder = useBoletinBuilderStore.getState();
    builder.reset();
    for (const item of boletin.items) {
      builder.addItem({
        id: `clone-${item.id}-${Date.now()}`,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        competition: item.competition ?? '',
        sport: (item.sport ?? Sport.FOOTBALL) as Sport,
        market: item.market,
        selection: item.selection,
        oddValue: Number(item.oddValue),
      });
    }
    builder.setStake(Number(boletin.stake));
    if (boletin.siteSlug) builder.setSiteSlug(boletin.siteSlug);
    if (boletin.notes) builder.setNotes(boletin.notes);
    builder.setFreebet(false);
    router.push('/boletins/create');
    showToast('Boletim duplicado — edita e guarda.', 'success');
  }, [boletin, router, showToast]);

  const bannerColor = useMemo(() => {
    // Darker shades to ensure WCAG AA contrast (≥4.5:1) with white text
    switch (boletin?.status) {
      case BoletinStatus.WON:
        return '#007A32'; // dark green — 5.5:1 contrast with #FFF
      case BoletinStatus.LOST:
        return '#CC2F26'; // dark red — 5.3:1 contrast with #FFF
      case BoletinStatus.CASHOUT:
        return '#8B6914'; // dark gold — 5.0:1 contrast with #FFF
      case BoletinStatus.PARTIAL:
      case BoletinStatus.PENDING:
      default:
        return '#A66000'; // dark amber — 4.9:1 contrast with #FFF
    }
  }, [boletin?.status]);

  const pushInfo = useCallback(
    (metric: string, value?: number) =>
      router.push({
        pathname: '/metric-info',
        params: { metric, ...(value !== undefined ? { value: String(value) } : {}) },
      }),
    [router],
  );

  // ── Computed stats ────────────────────────────────────────────────────────
  const boletinStats = useMemo(() => {
    if (!boletin) return null;
    const stake = Number(boletin.stake);
    const totalOdds = Number(boletin.totalOdds);
    const potentialReturn = Number(boletin.potentialReturn);
    const actualReturn = boletin.actualReturn != null ? Number(boletin.actualReturn) : null;
    const isPending = boletin.status === BoletinStatus.PENDING;
    const displayReturn = actualReturn ?? potentialReturn;
    const displayProfit = displayReturn - stake;
    const displayROI = stake > 0 ? ((displayReturn - stake) / stake) * 100 : 0;
    return { stake, totalOdds, potentialReturn, actualReturn, isPending, displayReturn, displayProfit, displayROI, selectionCount: boletin.items.length };
  }, [boletin]);

  if (boletinQuery.isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top + tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg }]}>
        <Stack.Screen options={{ title: 'Boletim' }} />
        <Skeleton height={36} width="75%" />
        <Card style={{ marginTop: 18, gap: 12 }}>
          <Skeleton height={18} width={120} />
          <Skeleton height={40} width="100%" />
        </Card>
        <Card style={{ marginTop: 14, gap: 14 }}>
          <Skeleton height={18} width={140} />
          <Skeleton height={80} width="100%" />
        </Card>
      </View>
    );
  }

  if (!boletin) {
    return (
      <View style={[styles.loadingScreen, styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="file-document-outline"
          title="Boletim não encontrado"
          message="O boletim pode ter sido removido ou não existe."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: boletin.name ?? 'Boletim' }} />
      <FlatList
        contentContainerStyle={{
          paddingBottom: insets.bottom + tokens.spacing.xxl + (isEditing ? 72 : 0),
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={boletin.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Animated.View entering={FadeInUp.duration(160).springify()}>
              <View style={[styles.statusBanner, { backgroundColor: bannerColor }]}>
                <View style={styles.bannerTopRow}>
                  <StatusBadge status={boletin.status} variant="banner" />
                </View>
                {isEditing ? (
                  <TextInput
                    maxLength={100}
                    onChangeText={setEditName}
                    placeholder="Nome do boletim"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={styles.bannerTitleInput}
                    value={editName}
                  />
                ) : (
                  <Text style={styles.bannerTitle}>{boletin.name ?? 'Boletim sem nome'}</Text>
                )}
                <Text style={styles.bannerSubtitle}>{formatLongDate(boletin.betDate ?? boletin.createdAt)}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(30).duration(280).springify()}>
              {/* Stats grid */}
              <Card style={styles.statsGrid}>
                {/* Row 1: Stake | Odd Total */}
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Stake</Text>
                      <InfoButton accessibilityLabel="O que é a stake" onPress={() => pushInfo('boletim-stake', boletinStats?.stake)} showLabel={false} size="sm" />
                    </View>
                    {isEditing ? (
                      <View style={styles.statEditRow}>
                        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{'€ '}</Text>
                        <TextInput
                          keyboardType="decimal-pad"
                          maxLength={10}
                          onChangeText={setEditStake}
                          placeholder="0.00"
                          placeholderTextColor={colors.textMuted}
                          selectTextOnFocus
                          style={[styles.statValueInput, { color: colors.textPrimary, borderBottomColor: colors.primary }]}
                          value={editStake}
                        />
                      </View>
                    ) : (
                      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
                    )}
                  </View>
                  <View style={[styles.statDividerV, { backgroundColor: colors.border }]} />
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Odd Total</Text>
                      <InfoButton accessibilityLabel="O que é a odd total" onPress={() => pushInfo('boletim-odds', boletinStats?.totalOdds)} showLabel={false} size="sm" />
                    </View>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                      {(boletinStats?.totalOdds ?? 1).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.statDividerH, { backgroundColor: colors.border }]} />

                {/* Row 2: Retorno | Lucro/Prejuízo */}
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {boletinStats?.isPending ? 'Retorno Potencial' : 'Retorno'}
                      </Text>
                      <InfoButton accessibilityLabel="O que é o retorno" onPress={() => pushInfo('boletim-potential-return', boletinStats?.displayReturn)} showLabel={false} size="sm" />
                    </View>
                    <Text style={[styles.statValue, { color: colors.primary }]}>
                      {formatCurrency(boletinStats?.displayReturn ?? boletin.potentialReturn)}
                    </Text>
                  </View>
                  <View style={[styles.statDividerV, { backgroundColor: colors.border }]} />
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {boletinStats?.isPending ? 'Lucro Potencial' : 'Lucro / Prejuízo'}
                      </Text>
                      <InfoButton accessibilityLabel="O que é lucro ou prejuízo" onPress={() => pushInfo('boletim-profit', boletinStats?.displayProfit)} showLabel={false} size="sm" />
                    </View>
                    <Text style={[styles.statValue, { color: (boletinStats?.displayProfit ?? 0) >= 0 ? colors.primary : colors.danger }]}>
                      {(boletinStats?.displayProfit ?? 0) >= 0 ? '+' : ''}{formatCurrency(boletinStats?.displayProfit ?? 0)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.statDividerH, { backgroundColor: colors.border }]} />

                {/* Row 3: ROI | Seleções */}
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                        {boletinStats?.isPending ? 'ROI Potencial' : 'ROI'}
                      </Text>
                      <InfoButton accessibilityLabel="O que é o ROI" onPress={() => pushInfo('boletim-roi', boletinStats?.displayROI)} showLabel={false} size="sm" />
                    </View>
                    <Text style={[styles.statValue, { color: (boletinStats?.displayROI ?? 0) >= 0 ? colors.primary : colors.danger }]}>
                      {(boletinStats?.displayROI ?? 0) >= 0 ? '+' : ''}{(boletinStats?.displayROI ?? 0).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[styles.statDividerV, { backgroundColor: colors.border }]} />
                  <View style={styles.statCell}>
                    <View style={styles.statLabelRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Seleções</Text>
                      <InfoButton accessibilityLabel="Número de seleções" onPress={() => pushInfo('boletim-selections', boletinStats?.selectionCount)} showLabel={false} size="sm" />
                    </View>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                      {boletinStats?.selectionCount ?? 0}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Metadata row */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons color={colors.textMuted} name={boletin.isPublic ? 'eye-outline' : 'eye-off-outline'} size={13} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{boletin.isPublic ? 'Público' : 'Privado'}</Text>
                </View>
                {boletin.isFreebet ? (
                  <View style={styles.metaItem}>
                    <Ionicons color={colors.textMuted} name="gift-outline" size={13} />
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>Freebet</Text>
                  </View>
                ) : null}
                {boletin.siteSlug ? (
                  <View style={styles.metaItem}>
                    <Ionicons color={colors.textMuted} name="business-outline" size={13} />
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>
                      {BETTING_SITES.find((s) => s.slug === boletin.siteSlug)?.name ?? boletin.siteSlug}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(100).duration(280).springify()} style={styles.actionButtons}>
              {isEditing ? (
                <>
                  <Button
                    onPress={handleCancelEdit}
                    size="sm"
                    style={{ flex: 1 }}
                    title="Cancelar"
                    variant="ghost"
                  />
                  <Button
                    disabled={updateMutation.isPending}
                    loading={updateMutation.isPending}
                    onPress={handleSave}
                    size="sm"
                    style={{ flex: 2 }}
                    title="Guardar alterações"
                    variant="primary"
                  />
                </>
              ) : (
                <>
                  {canEdit ? (
                    <>
                      <Button
                        leftSlot={<Ionicons color={colors.textPrimary} name="create-outline" size={16} />}
                        onPress={() => setIsEditing(true)}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title="Editar"
                        variant="secondary"
                      />
                      <Button
                        leftSlot={<Ionicons color={colors.textPrimary} name="globe-outline" size={16} />}
                        onPress={() => setPendingPublic(true)}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title={boletin.isPublic ? 'Tornar privado' : 'Tornar público'}
                        variant="secondary"
                      />
                      <Button
                        leftSlot={<Ionicons color={colors.textPrimary} name="share-social-outline" size={16} />}
                        onPress={() => {
                          if (!id) {
                            return;
                          }

                          openShareBoletinSheet({ boletinId: id, boletinName: boletin?.name });
                        }}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title="Partilhar"
                        variant="secondary"
                      />
                      <Button
                        leftSlot={<Ionicons color={colors.textPrimary} name="image-outline" size={16} />}
                        onPress={() => setShowShareCard(true)}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title="Imagem"
                        variant="secondary"
                      />
                      <Button
                        leftSlot={<Ionicons color={colors.danger} name="trash-outline" size={16} />}
                        onPress={() => setPendingDelete(true)}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title="Apagar"
                        variant="secondary"
                      />
                      <Button
                        leftSlot={<Ionicons color={colors.textPrimary} name="copy-outline" size={16} />}
                        onPress={handleClone}
                        size="sm"
                        style={{ flex: 1, minWidth: 100 }}
                        title="Duplicar"
                        variant="secondary"
                      />
                    </>
                  ) : (
                    <View style={[styles.readOnlyNotice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}> 
                      <Ionicons color={colors.info} name="lock-closed-outline" size={16} />
                      <Text style={[styles.readOnlyNoticeText, { color: colors.textSecondary }]}>
                        Partilhado por {boletin.user.displayName ?? `@${boletin.user.username}`}. Apenas o proprietário pode editar este boletim.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </Animated.View>

            {(boletin.notes || isEditing) ? (
              <Animated.View entering={FadeInDown.delay(35).duration(280).springify()}>
                <Card style={styles.notesCard}>
                  {isEditing ? (
                    <>
                      <Text style={[styles.notesTitle, { color: colors.textSecondary }]}>Notas</Text>
                      <TextInput
                        maxLength={500}
                        multiline
                        numberOfLines={4}
                        onChangeText={setEditNotes}
                        placeholder="Adiciona notas sobre este boletim..."
                        placeholderTextColor={colors.textMuted}
                        style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
                        textAlignVertical="top"
                        value={editNotes}
                      />
                    </>
                  ) : (
                    <Pressable onPress={() => setNotesExpanded((v) => !v)}>
                      <View style={styles.notesHeader}>
                        <Text style={[styles.notesTitle, { color: colors.textPrimary }]}>Notas</Text>
                        <Ionicons color={colors.textSecondary} name={notesExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
                      </View>
                      {notesExpanded ? <Text style={[styles.notesBody, { color: colors.textSecondary }]}>{boletin.notes}</Text> : null}
                    </Pressable>
                  )}
                </Card>
              </Animated.View>
            ) : null}

            {isEditing ? (
              <Animated.View entering={FadeInDown.delay(45).duration(280).springify()}>
                <Card style={{ gap: 14 }}>
                  <Text style={[styles.addItemSectionTitle, { color: colors.textSecondary }]}>Site e data</Text>
                  {/* Site picker button */}
                  <PressableScale
                    onPress={() => setShowEditSites(true)}
                    style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  >
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>SITE DE APOSTAS</Text>
                      <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: editSiteSlug ? colors.textPrimary : colors.textMuted }]}>
                        {BETTING_SITES.find((s) => s.slug === editSiteSlug)?.name ?? 'Selecionar site'}
                      </Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                  </PressableScale>
                  {/* Date input */}
                  <DatePickerField
                    label="DATA DA APOSTA"
                    value={editBetDate.length === 10 ? parseDDMMYYYYToDate(editBetDate) : null}
                    onChange={(date) => {
                      const dd = String(date.getDate()).padStart(2, '0');
                      const mm = String(date.getMonth() + 1).padStart(2, '0');
                      setEditBetDate(`${dd}/${mm}/${date.getFullYear()}`);
                    }}
                    onClear={() => setEditBetDate('')}
                  />
                  <View style={[styles.toggleRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.toggleTextWrap}>
                      <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Aposta gratuita (freebet)</Text>
                      <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>Marca esta opção se a stake foi uma freebet para manter os teus cálculos de lucro e prejuízo corretos.</Text>
                    </View>
                    <Switch
                      onValueChange={setEditIsFreebet}
                      trackColor={{ false: undefined, true: '#FFB300' }}
                      value={editIsFreebet}
                    />
                  </View>
                  <SearchableDropdown
                    items={BETTING_SITES.map((s) => ({ label: s.name, value: s.slug }))}
                    onClose={() => setShowEditSites(false)}
                    onSelect={(val) => setEditSiteSlug(val)}
                    title="Site de apostas"
                    visible={showEditSites}
                    renderLeft={(slug) => {
                      const site = BETTING_SITES.find((s) => s.slug === slug);
                      return site?.logo ? (
                        <Image source={site.logo} style={{ width: 24, height: 24, borderRadius: 4 }} />
                      ) : (
                        <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
                            {(site?.name ?? slug).slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      );
                    }}
                  />
                </Card>
              </Animated.View>
            ) : null}

            <BoletinInsightsSection boletin={boletin} />

            {boletin.status !== BoletinStatus.PENDING && (
              <Pressable
                onPress={() => setShowExplainer(true)}
                style={[styles.explainBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons name="search-outline" size={16} color={colors.primary} />
                <Text style={[styles.explainBtnText, { color: colors.primary }]}>Explica-me esta aposta</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
              </Pressable>
            )}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seleções</Text>

            {isEditing ? (
              <Card style={styles.addItemCard}>
                <Text style={[styles.addItemSectionTitle, { color: colors.textSecondary }]}>Adicionar Seleção</Text>

                {/* Sport */}
                <PressableScale onPress={() => setShowAddSports(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={styles.fieldBtnInner}>
                    <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>DESPORTO</Text>
                    <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: colors.textPrimary }]}>
                      {addSportLabel ? `${addSportLabel.icon} ${addSportLabel.label}` : 'Selecionar'}
                    </Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                </PressableScale>

                {/* Doubles toggle — tennis only */}
                {addSport === Sport.TENNIS && (
                  <View style={styles.doublesRow}>
                    {[{ label: 'Singulares', value: false }, { label: 'Doubles 🎾', value: true }].map((opt) => (
                      <Pressable
                        key={String(opt.value)}
                        onPress={() => {
                          setAddIsDoubles(opt.value);
                          setAddHomeTeam2('');
                          setAddAwayTeam2('');
                        }}
                        style={[
                          styles.doublesBtn,
                          {
                            backgroundColor: addIsDoubles === opt.value ? colors.primary : colors.surfaceRaised,
                            borderColor: addIsDoubles === opt.value ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.doublesBtnText, { color: addIsDoubles === opt.value ? '#fff' : colors.textSecondary }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Competition */}
                <PressableScale onPress={() => setShowAddCompetitions(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={styles.fieldBtnInner}>
                    <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>COMPETIÇÃO</Text>
                    <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addCompetition ? colors.textPrimary : colors.textMuted }]}>
                      {addCompetition ? `${getCountryFlagEmoji(addCompetitionCountry)} ${addCompetition}` : 'Selecionar competição'}
                    </Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                </PressableScale>

                {/* Home + Away Teams */}
                <View style={styles.addItemRow}>
                  <PressableScale onPress={() => setShowAddHomeTeams(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
                        {addSport === Sport.TENNIS ? (addIsDoubles ? 'JOG 1 (CASA)' : 'JOGADOR 1') : 'CASA'}
                      </Text>
                      <View style={styles.fieldBtnRow}>
                        {addHomeTeam ? <TeamBadge name={addHomeTeam} size={14} variant={addSport === Sport.TENNIS ? 'player' : 'team'} /> : null}
                        <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addHomeTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                          {addHomeTeam || (addSport === Sport.TENNIS ? 'Jogador' : 'Equipa')}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                  <PressableScale onPress={() => setShowAddAwayTeams(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
                        {addSport === Sport.TENNIS ? (addIsDoubles ? 'JOG 1 (FORA)' : 'JOGADOR 2') : 'FORA'}
                      </Text>
                      <View style={styles.fieldBtnRow}>
                        {addAwayTeam ? <TeamBadge name={addAwayTeam} size={14} variant={addSport === Sport.TENNIS ? 'player' : 'team'} /> : null}
                        <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addAwayTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                          {addAwayTeam || (addSport === Sport.TENNIS ? 'Jogador' : 'Equipa')}
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                </View>

                {/* Doubles extra players */}
                {addIsDoubles && addSport === Sport.TENNIS && (
                  <View style={styles.addItemRow}>
                    <PressableScale onPress={() => setShowAddHomeTeams2(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                      <View style={styles.fieldBtnInner}>
                        <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>JOG 2 (CASA)</Text>
                        <View style={styles.fieldBtnRow}>
                          {addHomeTeam2 ? <TeamBadge name={addHomeTeam2} size={14} variant="player" /> : null}
                          <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addHomeTeam2 ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                            {addHomeTeam2 || 'Jogador'}
                          </Text>
                        </View>
                      </View>
                    </PressableScale>
                    <PressableScale onPress={() => setShowAddAwayTeams2(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                      <View style={styles.fieldBtnInner}>
                        <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>JOG 2 (FORA)</Text>
                        <View style={styles.fieldBtnRow}>
                          {addAwayTeam2 ? <TeamBadge name={addAwayTeam2} size={14} variant="player" /> : null}
                          <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addAwayTeam2 ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                            {addAwayTeam2 || 'Jogador'}
                          </Text>
                        </View>
                      </View>
                    </PressableScale>
                  </View>
                )}

                {/* Market */}
                {addUseCustomMarket ? (
                  <Input
                    label="Mercado personalizado"
                    placeholder="Ex: Treinador demitido, Golos minuto 90..."
                    value={addMarket}
                    onChangeText={setAddMarket}
                  />
                ) : (
                  <PressableScale
                    onPress={() => {
                      if (!addFinalHomeTeam || !addFinalAwayTeam) {
                        showToast('Seleciona as duas equipas primeiro.', 'error');
                        return;
                      }
                      setShowAddMarkets(true);
                    }}
                    style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: addFinalHomeTeam && addFinalAwayTeam ? 1 : 0.45 }]}
                  >
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>MERCADO</Text>
                      <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addMarket ? colors.textPrimary : colors.textMuted }]}>
                        {addMarket
                          ? addFinalHomeTeam && addFinalAwayTeam
                            ? humanizeMarket(addMarket, addFinalHomeTeam, addFinalAwayTeam)
                            : addMarket
                          : 'Selecionar mercado'}
                      </Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                  </PressableScale>
                )}

                <Pressable
                  onPress={() => {
                    setAddUseCustomMarket((v) => !v);
                    setAddMarket('');
                    setAddSelection('');
                  }}
                  style={styles.customMarketToggle}
                >
                  <Ionicons
                    color={colors.primary}
                    name={addUseCustomMarket ? 'list-outline' : 'create-outline'}
                    size={13}
                  />
                  <Text style={[styles.customMarketToggleText, { color: colors.primary }]}>
                    {addUseCustomMarket ? 'Escolher da lista de mercados' : 'Escrever mercado personalizado'}
                  </Text>
                </Pressable>

                {/* Selection + Odd */}
                <View style={styles.addItemRow}>
                  {addUseCustomMarket || !isSelfDescribing(addMarket) ? (
                    <View style={{ flex: 2 }}>
                      <Input label="Seleção" onChangeText={setAddSelection} placeholder="Ex: 1, X, Over 2.5" value={addSelection} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Input keyboardType="decimal-pad" label="Odd" onChangeText={setAddOddValue} placeholder="1.85" value={addOddValue} />
                  </View>
                </View>

                <Button
                  leftSlot={<Ionicons color="#fff" name="add" size={16} />}
                  onPress={handleAddItem}
                  title="Adicionar"
                />

                {/* Dropdowns */}
                <SearchableDropdown
                  items={SPORT_OPTIONS.map((s) => ({ label: `${s.icon} ${s.label}`, value: s.key }))}
                  onClose={() => setShowAddSports(false)}
                  onSelect={(val) => {
                    setAddSport(val as Sport);
                    setAddIsDoubles(false);
                    setAddCompetition('');
                    setAddCompetitionCountry('');
                    setAddHomeTeam('');
                    setAddHomeTeam2('');
                    setAddAwayTeam('');
                    setAddAwayTeam2('');
                    setAddPlayerTour(null);
                    setAddPlayerTourTab('ALL');
                    setAddPlayerCountryFilter(null);
                  }}
                  title="Desporto"
                  visible={showAddSports}
                />
                <CompetitionPickerModal
                  onClose={() => setShowAddCompetitions(false)}
                  onSelect={(val) => {
                    setAddCompetition(val);
                    const found = addCompetitionsQuery.data?.find((c) => c.name === val);
                    setAddCompetitionCountry(found?.country ?? '');
                    if (addSport !== Sport.TENNIS) {
                      setAddHomeTeam('');
                      setAddHomeTeam2('');
                      setAddAwayTeam('');
                      setAddAwayTeam2('');
                    }
                  }}
                  sections={addVisibleCompetitionSections}
                  sport={addSport}
                  preloadWhenHidden
                  defaultExpandedCount={addSport === Sport.FOOTBALL ? 6 : 10}
                  allowCustomValue
                  title="Competição"
                  visible={showAddCompetitions}
                />
                <SearchableDropdown
                  isLoading={addSport === Sport.TENNIS ? (addAtpQuery.isLoading || addWtaQuery.isLoading) : (addTeamsQuery.isLoading || (addCompetition !== '' && addAllTeamsQuery.isLoading))}
                  items={addSport === Sport.TENNIS ? [] : addTeamItems}
                  sections={addPlayerSections}
                  headerContent={addSport === Sport.TENNIS ? (
                    <View style={{ paddingBottom: 6, gap: 8 }}>
                      <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#444' }}>
                        {(['ALL', 'ATP', 'WTA'] as const).map((tab) => {
                          const active = addPlayerTourTab === tab;
                          return (
                            <PressableScale key={tab} onPress={() => setAddPlayerTourTab(tab)} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: active ? '#00C851' : '#2A2A2A', borderRightWidth: tab !== 'WTA' ? 1 : 0, borderRightColor: '#444' }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#888', letterSpacing: 0.5 }}>{tab === 'ALL' ? 'Todos' : tab}</Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                      {addAvailablePlayerCountries.length > 0 && (
                        <PressableScale onPress={() => setShowAddCountryPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: addPlayerCountryFilter ? '#00C851' : '#444', gap: 8 }}>
                          <Ionicons name="flag-outline" size={16} color={addPlayerCountryFilter ? '#00C851' : '#888'} />
                          <Text style={{ flex: 1, fontSize: 13, color: addPlayerCountryFilter ? '#fff' : '#888' }}>{addPlayerCountryFilter ? `${getCountryFlagEmoji(addPlayerCountryFilter)} ${addPlayerCountryFilter}` : 'Filtrar por país'}</Text>
                          {addPlayerCountryFilter ? (
                            <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setAddPlayerCountryFilter(null); }}><Ionicons name="close-circle" size={16} color="#888" /></Pressable>
                          ) : (
                            <Ionicons name="chevron-down" size={14} color="#888" />
                          )}
                        </PressableScale>
                      )}
                    </View>
                  ) : undefined}
                  onClose={() => setShowAddHomeTeams(false)}
                  onSelect={(val) => {
                    setAddHomeTeam(val);
                    if (addSport === Sport.TENNIS) {
                      setAddPlayerTour(addWtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
                    }
                  }}
                  renderItemLeft={(item) => <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={20} variant={addSport === Sport.TENNIS ? 'player' : 'team'} />}
                  title={addSport === Sport.TENNIS ? (addIsDoubles ? 'Jogador 1 (Par Casa)' : 'Jogador 1') : 'Equipa Casa'}
                  visible={showAddHomeTeams}
                  allowCustomValue
                />
                {addIsDoubles && addSport === Sport.TENNIS && (
                  <SearchableDropdown
                    isLoading={addAtpQuery.isLoading || addWtaQuery.isLoading}
                    items={[]}
                    sections={addPlayerSections}
                    onClose={() => setShowAddHomeTeams2(false)}
                    onSelect={setAddHomeTeam2}
                    renderItemLeft={(item) => <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={20} variant="player" />}
                    title="Jogador 2 (Par Casa)"
                    visible={showAddHomeTeams2}
                    allowCustomValue
                  />
                )}
                <SearchableDropdown
                  isLoading={addSport === Sport.TENNIS ? (addAtpQuery.isLoading || addWtaQuery.isLoading) : (addTeamsQuery.isLoading || (addCompetition !== '' && addAllTeamsQuery.isLoading))}
                  items={addSport === Sport.TENNIS ? [] : addTeamItems}
                  sections={addPlayerSections}
                  headerContent={addSport === Sport.TENNIS ? (
                    <View style={{ paddingBottom: 6, gap: 8 }}>
                      <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#444' }}>
                        {(['ALL', 'ATP', 'WTA'] as const).map((tab) => {
                          const active = addPlayerTourTab === tab;
                          return (
                            <PressableScale key={tab} onPress={() => setAddPlayerTourTab(tab)} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: active ? '#00C851' : '#2A2A2A', borderRightWidth: tab !== 'WTA' ? 1 : 0, borderRightColor: '#444' }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#888', letterSpacing: 0.5 }}>{tab === 'ALL' ? 'Todos' : tab}</Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                      {addAvailablePlayerCountries.length > 0 && (
                        <PressableScale onPress={() => setShowAddCountryPicker(true)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: addPlayerCountryFilter ? '#00C851' : '#444', gap: 8 }}>
                          <Ionicons name="flag-outline" size={16} color={addPlayerCountryFilter ? '#00C851' : '#888'} />
                          <Text style={{ flex: 1, fontSize: 13, color: addPlayerCountryFilter ? '#fff' : '#888' }}>{addPlayerCountryFilter ? `${getCountryFlagEmoji(addPlayerCountryFilter)} ${addPlayerCountryFilter}` : 'Filtrar por país'}</Text>
                          {addPlayerCountryFilter ? (
                            <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setAddPlayerCountryFilter(null); }}><Ionicons name="close-circle" size={16} color="#888" /></Pressable>
                          ) : (
                            <Ionicons name="chevron-down" size={14} color="#888" />
                          )}
                        </PressableScale>
                      )}
                    </View>
                  ) : undefined}
                  onClose={() => setShowAddAwayTeams(false)}
                  onSelect={(val) => {
                    setAddAwayTeam(val);
                    if (addSport === Sport.TENNIS && !addPlayerTour) {
                      setAddPlayerTour(addWtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
                    }
                  }}
                  renderItemLeft={(item) => <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={20} variant={addSport === Sport.TENNIS ? 'player' : 'team'} />}
                  title={addSport === Sport.TENNIS ? (addIsDoubles ? 'Jogador 1 (Par Fora)' : 'Jogador 2') : 'Equipa Fora'}
                  visible={showAddAwayTeams}
                  allowCustomValue
                />
                {addIsDoubles && addSport === Sport.TENNIS && (
                  <SearchableDropdown
                    isLoading={addAtpQuery.isLoading || addWtaQuery.isLoading}
                    items={[]}
                    sections={addPlayerSections}
                    onClose={() => setShowAddAwayTeams2(false)}
                    onSelect={setAddAwayTeam2}
                    renderItemLeft={(item) => <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={20} variant="player" />}
                    title="Jogador 2 (Par Fora)"
                    visible={showAddAwayTeams2}
                    allowCustomValue
                  />
                )}
                <SearchableDropdown
                  isLoading={addMarketsQuery.isLoading}
                  onClose={() => setShowAddMarkets(false)}
                  onSelect={setAddMarket}
                  sections={addMarketSections}
                  title="Mercado"
                  visible={showAddMarkets}
                />
                <SearchableDropdown
                  visible={showAddCountryPicker}
                  onClose={() => setShowAddCountryPicker(false)}
                  title="Filtrar por país"
                  items={addAvailablePlayerCountries.map((c) => ({
                    label: `${getCountryFlagEmoji(c)} ${c}`,
                    value: c,
                  }))}
                  onSelect={(val) => {
                    setAddPlayerCountryFilter(val);
                    setShowAddCountryPicker(false);
                  }}
                  initialVisibleCount={30}
                />
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(450 + index * 25).duration(280).springify()}>
            <BoletinItem
              item={{
                ...item,
                homeTeamImageUrl: item.sport === Sport.TENNIS
                  ? (tennisPhotoLookup.get(item.homeTeam) ?? null)
                  : null,
                awayTeamImageUrl: item.sport === Sport.TENNIS
                  ? (tennisPhotoLookup.get(item.awayTeam) ?? null)
                  : null,
              }}
              onRemove={canEdit && isEditing ? () => {
                setRemoveItemTarget({ boletinId: boletin.id, itemId: item.id });
              } : undefined}
              onEdit={canEdit && isEditing ? () => {
                setEditItemTarget({
                  id: item.id,
                  homeTeam: item.homeTeam,
                  awayTeam: item.awayTeam,
                  competition: item.competition,
                  sport: item.sport ?? Sport.FOOTBALL,
                  market: item.market,
                  selection: item.selection,
                  oddValue: item.oddValue,
                  result: item.result,
                });
              } : undefined}
              onResultChange={canEdit && !isEditing ? async (result) => {
                try {
                  const updated = await updateItemsMutation.mutateAsync({
                    boletinId: boletin.id,
                    items: [{ id: item.id, result }],
                  });
                  // Trigger celebration immediately from mutation response
                  if (
                    prevStatusRef.current !== BoletinStatus.WON &&
                    updated.status === BoletinStatus.WON
                  ) {
                    setShowCelebration(true);
                  }
                  prevStatusRef.current = updated.status;
                  showToast(
                    result === ItemResult.PENDING ? 'Resultado removido.' : 'Resultado atualizado.',
                    'success',
                  );
                } catch (error) {
                  showToast(getErrorMessage(error), 'error');
                }
              } : undefined}
              onInsights={!isEditing ? () => setInsightsItem({
                homeTeam: item.homeTeam,
                awayTeam: item.awayTeam,
                homeTeamImageUrl: item.sport === Sport.TENNIS ? (tennisPhotoLookup.get(item.homeTeam) ?? null) : null,
                awayTeamImageUrl: item.sport === Sport.TENNIS ? (tennisPhotoLookup.get(item.awayTeam) ?? null) : null,
                competition: item.competition,
                sport: item.sport ?? Sport.FOOTBALL,
                market: item.market,
                selection: item.selection,
                oddValue: item.oddValue,
                result: item.result,
              }) : undefined}
            />
          </Animated.View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />

      <SelectionInsightsSheet
        visible={insightsItem !== null}
        item={insightsItem}
        onClose={() => setInsightsItem(null)}
      />

      {showExplainer && (
        <ExplainBoletinSheet
          visible={showExplainer}
          boletin={boletin}
          onClose={() => setShowExplainer(false)}
        />
      )}

      {isEditing && (
        <View style={[styles.stickyEditFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <Button onPress={handleCancelEdit} size="sm" style={{ flex: 1 }} title="Cancelar" variant="ghost" />
          <Button disabled={updateMutation.isPending} loading={updateMutation.isPending} onPress={handleSave} size="sm" style={{ flex: 2 }} title="Guardar alterações" variant="primary" />
        </View>
      )}

      <ConfirmModal
        visible={canEdit && pendingPublic}
        title={boletin!.isPublic ? 'Tornar privado' : 'Tornar público'}
        message={boletin!.isPublic
          ? 'O boletim deixará de estar visível no teu perfil e nas partilhas.'
          : 'O boletim ficará visível no teu perfil e poderá ser partilhado com amigos.'}
        confirmLabel={boletin!.isPublic ? 'Tornar privado' : 'Tornar público'}
        confirmVariant="primary"
        onConfirm={async () => {
          setPendingPublic(false);
          try {
            await updateMutation.mutateAsync({ id: boletin!.id, payload: { isPublic: !boletin!.isPublic } });
            showToast(boletin!.isPublic ? 'Boletim privado.' : 'Boletim público.', 'success');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onCancel={() => setPendingPublic(false)}
      />
      <ConfirmModal
        visible={canEdit && pendingDelete}
        title="Apagar boletim"
        message="Tens a certeza que queres apagar este boletim? Esta ação não pode ser desfeita."
        confirmLabel="Apagar"
        storageKey="delete-boletin-detail"
        onConfirm={async () => {
          setPendingDelete(false);
          try {
            await deleteMutation.mutateAsync(boletin!.id);
            router.back();
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onCancel={() => setPendingDelete(false)}
      />
      <ConfirmModal
        visible={canEdit && removeItemTarget !== null}
        title="Remover seleção"
        message="Queres remover esta seleção do boletim?"
        confirmLabel="Remover"
        storageKey="remove-selection"
        onConfirm={async () => {
          if (!removeItemTarget) return;
          const target = removeItemTarget;
          setRemoveItemTarget(null);
          try {
            await deleteItemMutation.mutateAsync({ boletinId: target.boletinId, itemId: target.itemId });
            showToast('Seleção removida.', 'success');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onCancel={() => setRemoveItemTarget(null)}
      />
      <EditItemModal
        visible={canEdit && editItemTarget !== null}
        item={editItemTarget}
        isSaving={updateItemMutation.isPending}
        onSave={async (itemId, changes) => {
          if (!boletin) return;
          try {
            await updateItemMutation.mutateAsync({ boletinId: boletin.id, itemId, item: changes });
            setEditItemTarget(null);
            showToast('Seleção atualizada.', 'success');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onClose={() => setEditItemTarget(null)}
      />

      {showCelebration && boletinStats && (
        <WinCelebration
          profit={boletinStats.displayProfit}
          totalOdds={boletinStats.totalOdds}
          onDismiss={() => setShowCelebration(false)}
        />
      )}

      <Modal
        animationType="slide"
        transparent
        visible={showShareCard}
        onRequestClose={() => setShowShareCard(false)}
      >
        <Pressable onPress={() => setShowShareCard(false)} style={styles.shareCardOverlay}>
          <Pressable>
            <ShareCard boletin={boletin} onClose={() => setShowShareCard(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data
  ) {
    return String(error.response.data.error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Não foi possível atualizar o boletim.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingScreen: { alignItems: 'stretch', flex: 1, justifyContent: 'flex-start' },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerWrap: { gap: 18, marginBottom: 18 },
  statusBanner: { borderRadius: 24, gap: 10, padding: 18 },
  bannerTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bannerEditBtn: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 20, padding: 6 },
  bannerEditActions: { flexDirection: 'row', gap: 8 },
  bannerActionBtn: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 20, padding: 6 },
  bannerSaveBtn: { backgroundColor: 'rgba(0,0,0,0.35)' },
  bannerTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  bannerTitleInput: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 34, borderBottomColor: 'rgba(255,255,255,0.5)', borderBottomWidth: 1, paddingVertical: 2, minWidth: 60 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', gap: 12 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 16, fontWeight: '900' },
  summaryInputRow: { alignItems: 'center', flexDirection: 'row' },
  summaryValueInput: { borderBottomWidth: 1, flex: 1, fontSize: 16, fontWeight: '900', paddingVertical: 2 },
  // Stats grid
  statsGrid: { overflow: 'hidden', padding: 0 },
  statsRow: { flexDirection: 'row' },
  statCell: { flex: 1, gap: 6, padding: 14 },
  statLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  statLabel: { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  statValue: { fontSize: 18, fontWeight: '900' },
  statValueInput: { borderBottomWidth: 1, flex: 1, fontSize: 18, fontWeight: '900', paddingVertical: 2 },
  statEditRow: { alignItems: 'center', flexDirection: 'row' },
  statDividerV: { width: 1 },
  statDividerH: { height: 1 },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 2, paddingTop: 8 },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  readOnlyNotice: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '100%',
  },
  readOnlyNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  notesCard: { gap: 10 },
  notesHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notesTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  notesBody: { fontSize: 14, lineHeight: 22 },
  notesInput: { borderRadius: 8, borderWidth: 1, fontSize: 14, lineHeight: 22, minHeight: 90, padding: 10 },
  toggleRow: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  toggleTextWrap: { flex: 1, gap: 4 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleSubtitle: { fontSize: 12, lineHeight: 18 },
  addItemCard: { gap: 12 },
  addItemSectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  addItemRow: { flexDirection: 'row', gap: 10 },
  addItemHalf: { flex: 1 },
  fieldBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  fieldBtnInner: { flex: 1, gap: 2 },
  fieldBtnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  fieldBtnValue: { fontSize: 15, fontWeight: '500' },
  fieldBtnRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  customMarketToggle: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  customMarketToggleText: { fontSize: 12, fontWeight: '600' },
  doublesRow: { flexDirection: 'row', gap: 8 },
  doublesBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flex: 1, paddingVertical: 9 },
  doublesBtnText: { fontSize: 13, fontWeight: '600' },
  shareCardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stickyEditFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  explainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  explainBtnText: { fontSize: 14, fontWeight: '700', flex: 1 },
});
