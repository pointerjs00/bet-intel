import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BoletinStatus, ItemResult, Sport } from '@betintel/shared';
import { BoletinItem } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import type { DropdownSection } from '../../components/ui/SearchableDropdown';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import {
  useBoletinDetail,
  useUpdateBoletinMutation,
  useUpdateBoletinItemsMutation,
  useAddBoletinItemMutation,
  useDeleteBoletinItemMutation,
} from '../../services/boletinService';
import { useCompetitions, useTeams, useMarkets } from '../../services/referenceService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatLongDate, formatDateToDDMMYYYY, parseDDMMYYYYToISO } from '../../utils/formatters';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { BETTING_SITES, COMPETITION_COUNTRY_ORDER, getCountryFlagEmoji } from '../../utils/sportAssets';

const STATUS_ACTIONS = [
  { key: BoletinStatus.PENDING, label: 'Pendente' },
  { key: BoletinStatus.WON, label: 'Ganhou' },
  { key: BoletinStatus.LOST, label: 'Perdeu' },
] as const;

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
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStake, setEditStake] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editActualReturn, setEditActualReturn] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');
  const [showEditSites, setShowEditSites] = useState(false);
  const [editBetDate, setEditBetDate] = useState(''); // DD/MM/YYYY display string
  const [showCashoutInput, setShowCashoutInput] = useState(false);
  const [cashoutValue, setCashoutValue] = useState('');
  const boletinQuery = useBoletinDetail(id);
  const updateMutation = useUpdateBoletinMutation();
  const updateItemsMutation = useUpdateBoletinItemsMutation();
  const addItemMutation = useAddBoletinItemMutation();
  const deleteItemMutation = useDeleteBoletinItemMutation();

  // ── Add-Selection form state ─────────────────────────────────────────────
  const [addSport, setAddSport] = useState<Sport>(Sport.FOOTBALL);
  const [addCompetition, setAddCompetition] = useState('');
  const [addCompetitionCountry, setAddCompetitionCountry] = useState('');
  const [addHomeTeam, setAddHomeTeam] = useState('');
  const [addAwayTeam, setAddAwayTeam] = useState('');
  const [addMarket, setAddMarket] = useState('');
  const [addUseCustomMarket, setAddUseCustomMarket] = useState(false);
  const [addSelection, setAddSelection] = useState('');
  const [addOddValue, setAddOddValue] = useState('');
  const [showAddSports, setShowAddSports] = useState(false);
  const [showAddCompetitions, setShowAddCompetitions] = useState(false);
  const [showAddHomeTeams, setShowAddHomeTeams] = useState(false);
  const [showAddAwayTeams, setShowAddAwayTeams] = useState(false);
  const [showAddMarkets, setShowAddMarkets] = useState(false);

  // ── Reference data for add-form ──────────────────────────────────────────
  const addCompetitionsQuery = useCompetitions(addSport);
  const addTeamsQuery = useTeams(addCompetition ? { sport: addSport, competition: addCompetition } : { sport: addSport });
  const addAllTeamsQuery = useTeams({ sport: addSport });
  const addMarketsQuery = useMarkets(addSport);
  const tennisTeamsQuery = useTeams({ sport: Sport.TENNIS, competition: 'ATP Tour' });

  const boletin = boletinQuery.data;

  const tennisPhotoLookup = useMemo(() => {
    const lookup = new Map<string, string>();

    for (const team of tennisTeamsQuery.data ?? []) {
      if (!team.imageUrl) {
        continue;
      }

      lookup.set(team.name, team.imageUrl);
      if (team.displayName) {
        lookup.set(team.displayName, team.imageUrl);
      }
    }

    return lookup;
  }, [tennisTeamsQuery.data]);

  const addCompetitionSections = useMemo<DropdownSection[]>(() => {
    const comps = addCompetitionsQuery.data ?? [];
    const countryMap = new Map<string, typeof comps>();
    for (const comp of comps) {
      if (!countryMap.has(comp.country)) countryMap.set(comp.country, []);
      countryMap.get(comp.country)!.push(comp);
    }
    const sections = Array.from(countryMap.entries()).map(([country, cs]) => ({
      title: country,
      country,
      data: cs.map((c) => ({ label: c.name, value: c.name })),
    }));
    sections.sort((a, b) => {
      const ai = COMPETITION_COUNTRY_ORDER.indexOf(a.country);
      const bi = COMPETITION_COUNTRY_ORDER.indexOf(b.country);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return sections;
  }, [addCompetitionsQuery.data]);

  const addTeamItems = useMemo(() => {
    const data = addTeamsQuery.data ?? [];
    const source = addCompetition && !addTeamsQuery.isLoading && data.length === 0
      ? (addAllTeamsQuery.data ?? [])
      : data;
    return source.map((t) => ({ label: t.name, value: t.name }));
  }, [addCompetition, addTeamsQuery.isLoading, addTeamsQuery.data, addAllTeamsQuery.data]);

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
        label: addHomeTeam && addAwayTeam
          ? humanizeMarket(m.name, addHomeTeam, addAwayTeam)
          : m.name,
        value: m.name,
      })),
    }));
  }, [addMarketsQuery.data, addHomeTeam, addAwayTeam]);

  const addSportLabel = SPORT_OPTIONS.find((s) => s.key === addSport);

  // Seed edit fields whenever boletin loads or changes (also resets on cancel)
  const seedEditFields = (b: typeof boletin) => {
    if (!b) return;
    setEditName(b.name ?? '');
    setEditStake(String(Number(b.stake)));
    setEditNotes(b.notes ?? '');
    setEditActualReturn(b.actualReturn != null ? String(Number(b.actualReturn)) : '');
    setEditSiteSlug(b.siteSlug ?? '');
    setEditBetDate(formatDateToDDMMYYYY(b.betDate));
  };

  useEffect(() => { seedEditFields(boletin); }, [boletin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill selection when market is self-describing (skip for custom market)
  useEffect(() => {
    if (!addUseCustomMarket && isSelfDescribing(addMarket)) {
      setAddSelection(humanizeMarket(addMarket, addHomeTeam, addAwayTeam));
    } else if (!addUseCustomMarket) {
      setAddSelection('');
    }
  }, [addMarket, addHomeTeam, addAwayTeam, addUseCustomMarket]);

  const handleAddItem = useCallback(async () => {
    if (!boletin) return;
    if (!addHomeTeam.trim() || !addAwayTeam.trim()) {
      showToast('Preenche as duas equipas.', 'error');
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
          homeTeam: addHomeTeam.trim(),
          awayTeam: addAwayTeam.trim(),
          competition: addCompetition.trim() || 'Geral',
          sport: addSport,
          market: humanizeMarket(addMarket, addHomeTeam, addAwayTeam),
          selection: addSelection.trim(),
          oddValue: odd,
        },
      });
      setAddHomeTeam('');
      setAddAwayTeam('');
      setAddMarket('');
      setAddUseCustomMarket(false);
      setAddSelection('');
      setAddOddValue('');
      Keyboard.dismiss();
      showToast('Seleção adicionada.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  }, [boletin, addHomeTeam, addAwayTeam, addCompetition, addSport, addMarket, addSelection, addOddValue, addItemMutation, showToast]);

  const handleSave = async () => {
    if (!boletin) return;
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
      betDate: editBetDate.length === 10 ? (parseDDMMYYYYToISO(editBetDate) ?? null) : null,
    };
    if (boletin.status !== 'PENDING' && editActualReturn) {
      const ret = parseFloat(editActualReturn.replace(',', '.'));
      if (!isNaN(ret)) payload.actualReturn = ret;
    }
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

  const handleCashout = async () => {
    if (!boletin) return;
    const amount = parseFloat(cashoutValue.replace(',', '.'));
    if (isNaN(amount) || amount < 0) {
      showToast('Valor de cashout inválido.', 'error');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: boletin.id,
        payload: { status: BoletinStatus.CASHOUT, cashoutAmount: amount, actualReturn: amount },
      });
      setShowCashoutInput(false);
      setCashoutValue('');
      showToast('Cashout registado.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const bannerColor = useMemo(() => {
    switch (boletin?.status) {
      case BoletinStatus.WON:
        return colors.primary;
      case BoletinStatus.LOST:
        return colors.danger;
      case BoletinStatus.CASHOUT:
        return colors.gold;
      case BoletinStatus.PARTIAL:
      case BoletinStatus.PENDING:
      default:
        return colors.warning;
    }
  }, [boletin?.status, colors.danger, colors.info, colors.primary, colors.warning]);

  if (boletinQuery.isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top + tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg }]}>
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
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + tokens.spacing.xxl,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={boletin.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Animated.View entering={FadeInUp.duration(400).springify()}>
              <View style={[styles.statusBanner, { backgroundColor: bannerColor }]}>
                <View style={styles.bannerTopRow}>
                  <StatusBadge status={boletin.status} />
                  {isEditing ? (
                    <View style={styles.bannerEditActions}>
                      <Pressable hitSlop={10} onPress={handleCancelEdit} style={styles.bannerActionBtn}>
                        <Ionicons color="rgba(255,255,255,0.9)" name="close" size={20} />
                      </Pressable>
                      <Pressable disabled={updateMutation.isPending} hitSlop={10} onPress={handleSave} style={[styles.bannerActionBtn, styles.bannerSaveBtn]}>
                        <Ionicons color="#fff" name="checkmark" size={20} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable hitSlop={12} onPress={() => setIsEditing(true)} style={styles.bannerEditBtn}>
                      <Ionicons color="rgba(255,255,255,0.9)" name="pencil-outline" size={20} />
                    </Pressable>
                  )}
                </View>
                {isEditing ? (
                  <TextInput
                    autoFocus
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

            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <OddsCalculator
                potentialReturn={Number(boletin.actualReturn ?? boletin.potentialReturn)}
                stake={Number(boletin.stake)}
                totalOdds={Number(boletin.totalOdds)}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Stake</Text>
                  {isEditing ? (
                    <View style={styles.summaryInputRow}>
                      <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>€ </Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        maxLength={10}
                        onChangeText={setEditStake}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        style={[styles.summaryValueInput, { color: colors.textPrimary, borderBottomColor: colors.primary }]}
                        value={editStake}
                      />
                    </View>
                  ) : (
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(boletin.stake)}</Text>
                  )}
                </View>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Retorno atual</Text>
                  {isEditing && boletin.status !== 'PENDING' ? (
                    <View style={styles.summaryInputRow}>
                      <Text style={[styles.summaryValue, { color: colors.primary }]}>€ </Text>
                      <TextInput
                        keyboardType="decimal-pad"
                        maxLength={10}
                        onChangeText={setEditActualReturn}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        style={[styles.summaryValueInput, { color: colors.primary, borderBottomColor: colors.primary }]}
                        value={editActualReturn}
                      />
                    </View>
                  ) : (
                    <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(boletin.actualReturn ?? boletin.potentialReturn)}</Text>
                  )}
                </View>
                <View style={styles.summaryMetric}>
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Visibilidade</Text>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{boletin.isPublic ? 'Público' : 'Privado'}</Text>
                </View>
                {boletin.siteSlug ? (
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Site</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                      {BETTING_SITES.find((s) => s.slug === boletin.siteSlug)?.name ?? boletin.siteSlug}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Estado</Text>
              <FlatList
                contentContainerStyle={styles.statusActions}
                data={STATUS_ACTIONS}
                horizontal
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                  <Chip
                    label={item.label}
                    selected={item.key === boletin.status}
                    onPress={async () => {
                      try {
                        await updateMutation.mutateAsync({ id: boletin.id, payload: { status: item.key } });
                        showToast('Estado atualizado.', 'success');
                      } catch (error) {
                        showToast(getErrorMessage(error), 'error');
                      }
                    }}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              />
              {boletin.status === BoletinStatus.PENDING && (
                <View style={styles.cashoutSection}>
                  {!showCashoutInput ? (
                    <Button
                      leftSlot={<Ionicons color={colors.gold} name="cash-outline" size={16} />}
                      onPress={() => setShowCashoutInput(true)}
                      size="sm"
                      title="Fazer Cashout"
                      variant="secondary"
                    />
                  ) : (
                    <View style={[styles.cashoutForm, { backgroundColor: colors.surfaceRaised, borderColor: colors.gold }]}>
                      <Text style={[styles.cashoutLabel, { color: colors.textSecondary }]}>
                        💵 Valor recebido no cashout (€)
                      </Text>
                      <TextInput
                        autoFocus
                        keyboardType="decimal-pad"
                        maxLength={10}
                        onChangeText={setCashoutValue}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        selectTextOnFocus
                        style={[styles.cashoutInput, { color: colors.textPrimary, borderBottomColor: colors.gold }]}
                        value={cashoutValue}
                      />
                      <View style={styles.cashoutActions}>
                        <Button
                          onPress={() => { setShowCashoutInput(false); setCashoutValue(''); }}
                          size="sm"
                          title="Cancelar"
                          variant="ghost"
                        />
                        <Button
                          disabled={updateMutation.isPending}
                          onPress={handleCashout}
                          size="sm"
                          title="Confirmar"
                          variant="primary"
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
              {boletin.status === BoletinStatus.CASHOUT && boletin.cashoutAmount != null && (
                <View style={[styles.cashoutBanner, { backgroundColor: `${colors.gold}18`, borderColor: `${colors.gold}40` }]}>
                  <Text style={[styles.cashoutBannerText, { color: colors.gold }]}>
                    💵 Cashout de {formatCurrency(boletin.cashoutAmount)}
                  </Text>
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(350).duration(400).springify()} style={styles.actionButtons}>
              <Button
                leftSlot={<Ionicons color={colors.textPrimary} name="globe-outline" size={16} />}
                onPress={async () => {
                  try {
                    await updateMutation.mutateAsync({ id: boletin.id, payload: { isPublic: !boletin.isPublic } });
                    showToast(boletin.isPublic ? 'Boletim privado.' : 'Boletim público.', 'success');
                  } catch (error) {
                    showToast(getErrorMessage(error), 'error');
                  }
                }}
                size="sm"
                title={boletin.isPublic ? 'Tornar privado' : 'Tornar público'}
                variant="secondary"
              />
              <Button
                leftSlot={<Ionicons color={colors.textPrimary} name="share-social-outline" size={16} />}
                onPress={() => showToast('A partilha com amigos será ligada no passo social.', 'info')}
                size="sm"
                title="Partilhar"
                variant="secondary"
              />
            </Animated.View>

            {(boletin.notes || isEditing) ? (
              <Animated.View entering={FadeInDown.delay(400).duration(400).springify()}>
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
              <Animated.View entering={FadeInDown.delay(420).duration(400).springify()}>
                <Card style={{ gap: 14 }}>
                  <Text style={[styles.addItemSectionTitle, { color: colors.textSecondary }]}>Site e data</Text>
                  {/* Site picker button */}
                  <Pressable
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
                  </Pressable>
                  {/* Date input */}
                  <View>
                    <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary, marginBottom: 6 }]}>DATA DA APOSTA</Text>
                    <TextInput
                      keyboardType="numeric"
                      maxLength={10}
                      onChangeText={(v) => {
                        const digits = v.replace(/\D/g, '').slice(0, 8);
                        let formatted = digits;
                        if (digits.length > 4) {
                          formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
                        } else if (digits.length > 2) {
                          formatted = digits.slice(0, 2) + '/' + digits.slice(2);
                        }
                        setEditBetDate(formatted);
                      }}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border, minHeight: 44, padding: 10 }]}
                      value={editBetDate}
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

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seleções</Text>

            {isEditing ? (
              <Card style={styles.addItemCard}>
                <Text style={[styles.addItemSectionTitle, { color: colors.textSecondary }]}>Adicionar Seleção</Text>

                {/* Sport */}
                <Pressable onPress={() => setShowAddSports(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={styles.fieldBtnInner}>
                    <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>DESPORTO</Text>
                    <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: colors.textPrimary }]}>
                      {addSportLabel ? `${addSportLabel.icon} ${addSportLabel.label}` : 'Selecionar'}
                    </Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                </Pressable>

                {/* Competition */}
                <Pressable onPress={() => setShowAddCompetitions(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <View style={styles.fieldBtnInner}>
                    <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>COMPETIÇÃO</Text>
                    <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addCompetition ? colors.textPrimary : colors.textMuted }]}>
                      {addCompetition ? `${getCountryFlagEmoji(addCompetitionCountry)} ${addCompetition}` : 'Selecionar competição'}
                    </Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                </Pressable>

                {/* Home + Away Teams */}
                <View style={styles.addItemRow}>
                  <Pressable onPress={() => setShowAddHomeTeams(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>CASA</Text>
                      <View style={styles.fieldBtnRow}>
                        {addHomeTeam ? <TeamBadge name={addHomeTeam} size={14} /> : null}
                        <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addHomeTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                          {addHomeTeam || 'Equipa'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setShowAddAwayTeams(true)} style={[styles.fieldBtn, styles.addItemHalf, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>FORA</Text>
                      <View style={styles.fieldBtnRow}>
                        {addAwayTeam ? <TeamBadge name={addAwayTeam} size={14} /> : null}
                        <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addAwayTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                          {addAwayTeam || 'Equipa'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>

                {/* Market */}
                {addUseCustomMarket ? (
                  <Input
                    label="Mercado personalizado"
                    placeholder="Ex: Treinador demitido, Golos minuto 90..."
                    value={addMarket}
                    onChangeText={setAddMarket}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      if (!addHomeTeam || !addAwayTeam) {
                        showToast('Seleciona as duas equipas primeiro.', 'error');
                        return;
                      }
                      setShowAddMarkets(true);
                    }}
                    style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: addHomeTeam && addAwayTeam ? 1 : 0.45 }]}
                  >
                    <View style={styles.fieldBtnInner}>
                      <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>MERCADO</Text>
                      <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: addMarket ? colors.textPrimary : colors.textMuted }]}>
                        {addMarket
                          ? addHomeTeam && addAwayTeam
                            ? humanizeMarket(addMarket, addHomeTeam, addAwayTeam)
                            : addMarket
                          : 'Selecionar mercado'}
                      </Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
                  </Pressable>
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
                    color={colors.info}
                    name={addUseCustomMarket ? 'list-outline' : 'create-outline'}
                    size={13}
                  />
                  <Text style={[styles.customMarketToggleText, { color: colors.info }]}>
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
                    setAddCompetition('');
                    setAddCompetitionCountry('');
                    setAddHomeTeam('');
                    setAddAwayTeam('');
                  }}
                  title="Desporto"
                  visible={showAddSports}
                />
                <SearchableDropdown
                  isLoading={addCompetitionsQuery.isLoading}
                  onClose={() => setShowAddCompetitions(false)}
                  onSelect={(val) => {
                    setAddCompetition(val);
                    const found = addCompetitionsQuery.data?.find((c) => c.name === val);
                    setAddCompetitionCountry(found?.country ?? '');
                    setAddHomeTeam('');
                    setAddAwayTeam('');
                  }}
                  sections={addCompetitionSections}
                  title="Competição"
                  visible={showAddCompetitions}
                />
                <SearchableDropdown
                  isLoading={addTeamsQuery.isLoading || (addCompetition !== '' && addAllTeamsQuery.isLoading)}
                  items={addTeamItems}
                  onClose={() => setShowAddHomeTeams(false)}
                  onSelect={setAddHomeTeam}
                  renderLeft={(val) => <TeamBadge name={val} size={20} />}
                  title="Equipa Casa"
                  visible={showAddHomeTeams}
                  allowCustomValue
                />
                <SearchableDropdown
                  isLoading={addTeamsQuery.isLoading || (addCompetition !== '' && addAllTeamsQuery.isLoading)}
                  items={addTeamItems}
                  onClose={() => setShowAddAwayTeams(false)}
                  onSelect={setAddAwayTeam}
                  renderLeft={(val) => <TeamBadge name={val} size={20} />}
                  title="Equipa Fora"
                  visible={showAddAwayTeams}
                  allowCustomValue
                />
                <SearchableDropdown
                  isLoading={addMarketsQuery.isLoading}
                  onClose={() => setShowAddMarkets(false)}
                  onSelect={setAddMarket}
                  sections={addMarketSections}
                  title="Mercado"
                  visible={showAddMarkets}
                />
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(450 + index * 60).duration(400).springify()}>
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
              onRemove={isEditing ? async () => {
                try {
                  await deleteItemMutation.mutateAsync({ boletinId: boletin.id, itemId: item.id });
                  showToast('Seleção removida.', 'success');
                } catch (error) {
                  showToast(getErrorMessage(error), 'error');
                }
              } : undefined}
              onResultChange={!isEditing ? async (result) => {
                try {
                  await updateItemsMutation.mutateAsync({
                    boletinId: boletin.id,
                    items: [{ id: item.id, result }],
                  });
                  showToast(
                    result === ItemResult.PENDING ? 'Resultado removido.' : 'Resultado atualizado.',
                    'success',
                  );
                } catch (error) {
                  showToast(getErrorMessage(error), 'error');
                }
              } : undefined}
            />
          </Animated.View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />
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
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  statusActions: { gap: 8 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  notesCard: { gap: 10 },
  notesHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notesTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  notesBody: { fontSize: 14, lineHeight: 22 },
  notesInput: { borderRadius: 8, borderWidth: 1, fontSize: 14, lineHeight: 22, minHeight: 90, padding: 10 },
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
  cashoutSection: { marginTop: 12 },
  cashoutForm: { borderRadius: 14, borderWidth: 1.5, gap: 12, marginTop: 4, padding: 14 },
  cashoutLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  cashoutInput: { borderBottomWidth: 2, fontSize: 22, fontWeight: '800', paddingVertical: 6 },
  cashoutActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cashoutBanner: { borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 12 },
  cashoutBannerText: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
});