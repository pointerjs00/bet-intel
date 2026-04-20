import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BoletinStatus, Sport } from '@betintel/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PressableScale } from '../../components/ui/PressableScale';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { CompetitionBadge } from '../../components/ui/CompetitionBadge';
import { CompetitionPickerModal, type CompetitionPickerSection } from '../../components/ui/CompetitionPickerModal';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { useCompetitions, useTeams } from '../../services/referenceService';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import {
  useBulkImportMutation,
  type BetclicPdfResult,
  type ParsedBetclicBoletin,
  type ParsedBetclicItem,
  consumeScanFeedbackContext,
  submitScanFeedbackRequest,
} from '../../services/importService';
import { StatusBadge } from '../../components/boletins/StatusBadge';

// ─── Constants ───────────────────────────────────────────────────────────────

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

function getSportIcon(sport: string): string {
  return SPORT_OPTIONS.find((o) => o.key === sport)?.icon ?? '🏅';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatParsedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatSelectionDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

// ─── Editable item state ─────────────────────────────────────────────────────

interface ItemEdits {
  sport: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeamImageUrl?: string | null;
}

function buildEditKey(boletinIdx: number, itemIdx: number): string {
  return `${boletinIdx}-${itemIdx}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ImportReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ data: string }>();
  const bulkImportMutation = useBulkImportMutation();

  // Parse the data passed from the profile screen
  const pdfResult: BetclicPdfResult | null = useMemo(() => {
    try {
      return params.data ? JSON.parse(params.data) : null;
    } catch {
      return null;
    }
  }, [params.data]);

  const boletins = pdfResult?.boletins ?? [];

  // Selection state — by default, all non-error bets are selected
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    boletins.forEach((b, i) => {
      if (!b.parseError) initial.add(i);
    });
    return initial;
  });
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  // Per-item edits (sport, competition, awayTeam, logos)
  const [itemEdits, setItemEdits] = useState<Map<string, ItemEdits>>(() => {
    const initial = new Map<string, ItemEdits>();
    boletins.forEach((b, bi) => {
      b.items.forEach((item, ii) => {
        initial.set(buildEditKey(bi, ii), {
          sport: item.sport || 'FOOTBALL',
          competition: item.competition || '',
          homeTeam: item.homeTeam || '',
          awayTeam: item.awayTeam === 'Desconhecido' ? '' : item.awayTeam,
          homeTeamImageUrl: item.homeTeamImageUrl ?? null,
          awayTeamImageUrl: item.awayTeamImageUrl ?? null,
        });
      });
    });
    return initial;
  });

  // Competition picker modal state
  const [competitionPickerTarget, setCompetitionPickerTarget] = useState<{
    boletinIdx: number;
    itemIdx: number;
  } | null>(null);

  // Sport picker modal state
  const [sportPickerTarget, setSportPickerTarget] = useState<{
    boletinIdx: number;
    itemIdx: number;
  } | null>(null);

  // Team picker modal state
  const [teamPickerTarget, setTeamPickerTarget] = useState<{
    boletinIdx: number;
    itemIdx: number;
    side: 'home' | 'away';
  } | null>(null);

  const getItemEdit = useCallback((boletinIdx: number, itemIdx: number): ItemEdits => {
    return itemEdits.get(buildEditKey(boletinIdx, itemIdx)) ?? {
      sport: 'FOOTBALL',
      competition: '',
      homeTeam: '',
      awayTeam: '',
      homeTeamImageUrl: null,
      awayTeamImageUrl: null,
    };
  }, [itemEdits]);

  // Sport for the currently open team picker (used to filter teams)
  const teamPickerSport = useMemo(() => {
    if (!teamPickerTarget) return undefined;
    const edits = getItemEdit(teamPickerTarget.boletinIdx, teamPickerTarget.itemIdx);
    return (edits.sport as Sport) || Sport.FOOTBALL;
  }, [teamPickerTarget, getItemEdit]);

  const teamPickerCompetition = useMemo(() => {
    if (!teamPickerTarget) return undefined;
    const edits = getItemEdit(teamPickerTarget.boletinIdx, teamPickerTarget.itemIdx);
    return edits.competition || undefined;
  }, [teamPickerTarget, getItemEdit]);

  const teamsQuery = useTeams(
    teamPickerCompetition
      ? { sport: teamPickerSport, competition: teamPickerCompetition }
      : { sport: teamPickerSport },
    { enabled: teamPickerTarget !== null },
  );

  const allTeamsQuery = useTeams(
    { sport: teamPickerSport },
    { enabled: teamPickerTarget !== null },
  );

  const teamPickerItems = useMemo(() => {
    const data = teamsQuery.data ?? [];
    const source =
      teamPickerCompetition && !teamsQuery.isLoading && data.length === 0
        ? (allTeamsQuery.data ?? [])
        : data;
    return source.map((team) => ({
      label: team.displayName ?? team.name,
      value: team.displayName ?? team.name,
      imageUrl: team.imageUrl ?? null,
    }));
  }, [teamPickerCompetition, teamsQuery.isLoading, teamsQuery.data, allTeamsQuery.data]);

  // Reference data for competition picker — filtered by sport of the target item
  const competitionPickerSport = useMemo(() => {
    if (!competitionPickerTarget) return undefined;
    const edits = getItemEdit(competitionPickerTarget.boletinIdx, competitionPickerTarget.itemIdx);
    return edits.sport || undefined;
  }, [competitionPickerTarget, getItemEdit]);

  const competitionsQuery = useCompetitions(competitionPickerSport);
  const competitionSections: CompetitionPickerSection[] = useMemo(() => {
    const comps = competitionsQuery.data ?? [];
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
      const ai = TOP_6.indexOf(a.country!);
      const bi = TOP_6.indexOf(b.country!);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (a.country ?? '').localeCompare(b.country ?? '', 'pt');
    });
    return sections;
  }, [competitionsQuery.data]);

  const updateItemEdit = useCallback((boletinIdx: number, itemIdx: number, patch: Partial<ItemEdits>) => {
    setItemEdits((prev) => {
      const next = new Map(prev);
      const key = buildEditKey(boletinIdx, itemIdx);
      const existing = next.get(key) ?? {
        sport: 'FOOTBALL',
        competition: '',
        homeTeam: '',
        awayTeam: '',
        homeTeamImageUrl: null,
        awayTeamImageUrl: null,
      };
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const errorCount = boletins.filter((b) => b.parseError).length;
  const duplicateCount = 0; // Duplicates are detected server-side during bulk import

  // Shake animation for disabled button
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedCount === boletins.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(boletins.map((_, i) => i)));
    }
  }, [selectedCount, boletins]);

  const toggleExpanded = useCallback((index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selectedCount === 0) {
      // Shake animation
      shakeX.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      return;
    }

    const selectedBoletins = boletins
      .filter((_, i) => selected.has(i))
      .map((b, origIdx) => {
        // Find the original index (before filter) for edit lookups
        const boletinIdx = boletins.indexOf(b);
        return {
          ...b,
          items: b.items.map((item, itemIdx) => {
            const edits = getItemEdit(boletinIdx, itemIdx);
            return {
              ...item,
              sport: edits.sport,
              competition: edits.competition,
              homeTeam: edits.homeTeam || item.homeTeam,
              awayTeam: edits.awayTeam || item.awayTeam,
              homeTeamImageUrl: edits.homeTeamImageUrl ?? item.homeTeamImageUrl,
              awayTeamImageUrl: edits.awayTeamImageUrl ?? item.awayTeamImageUrl,
            };
          }),
        };
      });

    try {
      const result = await bulkImportMutation.mutateAsync(selectedBoletins);

      if (result.imported === 0 && result.duplicates > 0) {
        showToast('Todas as apostas já tinham sido importadas anteriormente', 'info');
      } else {
        showToast(`${result.imported} boletins importados com sucesso 🎉`, 'success');
      }

      // Fire-and-forget: send AI output + corrected output for fine-tuning data collection.
      // Only present when the import came from an AI scan (not PDF/API).
      const feedbackCtx = consumeScanFeedbackContext();
      if (feedbackCtx) {
        const correctedOutput: BetclicPdfResult = {
          boletins: selectedBoletins,
          totalFound: selectedBoletins.length,
          errorCount: 0,
        };
        submitScanFeedbackRequest(
          feedbackCtx.imageBase64,
          feedbackCtx.mimeType,
          feedbackCtx.aiOutput,
          correctedOutput,
        ).catch(() => { /* silent — never block the user */ });
      }

      router.back();
      // Navigate back to profile (the router.back() from review goes to profile)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro de ligação. Tenta novamente';
      showToast(msg, 'error');
    }
  }, [selectedCount, boletins, selected, bulkImportMutation, router, showToast, shakeX, getItemEdit]);

  const renderItem = useCallback(
    ({ item, index }: { item: ParsedBetclicBoletin; index: number }) => {
      const isSelected = selected.has(index);
      const isExpanded = expanded.has(index);
      const firstItem = item.items[0];
      const firstEdits = firstItem ? getItemEdit(index, 0) : null;

      return (
        <Card
          style={[
            styles.betCard,
            !isSelected && styles.betCardDeselected,
            { borderLeftColor: isSelected ? (item.parseError ? colors.warning : colors.primary) : colors.border },
          ]}
        >
            {/* Header: checkbox + date + badges — single row */}
            <View style={styles.betCardHeader}>
              <Pressable hitSlop={10} onPress={() => toggleItem(index)}>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
              </Pressable>
              <Text style={[styles.betCardDate, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatParsedDate(item.betDate)}
              </Text>
              <View style={styles.betCardBadges}>
                {item.parseError && (
                  <Badge label="Erro" variant="warning" />
                )}
                <StatusBadge status={item.status as BoletinStatus} />
              </View>
            </View>

            {/* Event info with team badges */}
            {firstItem && (
              <View style={styles.betCardEvent}>
                <View style={styles.teamsRow}>
                  <TeamBadge
                    name={firstItem.homeTeam}
                    imageUrl={firstEdits?.homeTeamImageUrl}
                    size={20}
                    variant={firstEdits?.sport === 'TENNIS' ? 'player' : 'team'}
                  />
                  <Text style={[styles.betCardTeams, { color: colors.textPrimary }]} numberOfLines={1}>
                    {firstItem.homeTeam}
                  </Text>
                  {(firstEdits?.awayTeam || (firstItem.awayTeam && firstItem.awayTeam !== 'Desconhecido')) && (
                    <>
                      <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                      <TeamBadge
                        name={firstEdits?.awayTeam || firstItem.awayTeam}
                        imageUrl={firstEdits?.awayTeamImageUrl}
                        size={20}
                        variant={firstEdits?.sport === 'TENNIS' ? 'player' : 'team'}
                      />
                      <Text style={[styles.betCardTeams, { color: colors.textPrimary }]} numberOfLines={1}>
                        {firstEdits?.awayTeam || firstItem.awayTeam}
                      </Text>
                    </>
                  )}
                </View>
                {item.items.length > 1 && (
                  <Text style={[styles.betCardMore, { color: colors.textMuted }]}>
                    + {item.items.length - 1} {item.items.length === 2 ? 'seleção' : 'seleções'}
                  </Text>
                )}
              </View>
            )}

            {firstItem && (
              <View style={styles.betCardMeta}>
                <Text style={{ fontSize: 14 }}>{getSportIcon(firstEdits?.sport ?? 'FOOTBALL')} </Text>
                <Text style={[styles.betCardMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {firstItem.market} • {firstItem.selection}
                </Text>
              </View>
            )}

            {/* Stake / Odds / Return row */}
            <View style={styles.betCardMetrics}>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Stake</Text>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatCurrency(item.stake)}
                </Text>
              </View>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Odds</Text>
                <Text style={[styles.metricValue, { color: colors.gold }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatOdds(item.totalOdds)}
                </Text>
              </View>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {item.status === BoletinStatus.LOST ? 'Perdas' : 'Retorno'}
                </Text>
                <Text
                  style={[styles.metricValue, { color: item.status === BoletinStatus.LOST ? colors.danger : colors.primary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {item.status === BoletinStatus.LOST ? `-${formatCurrency(item.stake)}` : formatCurrency(item.potentialReturn)}
                </Text>
              </View>
            </View>

            {/* Error reason */}
            {item.parseError && item.parseErrorReason && (
              <Text style={[styles.betCardError, { color: colors.warning }]} numberOfLines={2}>
                ⚠ {item.parseErrorReason}
              </Text>
            )}

            {item.items.length > 0 && (
              <PressableScale
                scaleDown={0.96}
                onPress={() => toggleExpanded(index)}
                style={[styles.detailsButton, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
              >
                <Ionicons name="pencil" size={13} color={colors.textSecondary} />
                <Text style={[styles.detailsButtonText, { color: colors.textPrimary }]}>
                  {isExpanded ? 'Ocultar detalhes' : 'Editar detalhes'}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textSecondary}
                />
              </PressableScale>
            )}

            {isExpanded && item.items.length > 0 && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.expandedContainer}>
                {item.items.map((selectionItem, selectionIndex) => {
                  const edits = getItemEdit(index, selectionIndex);
                  return (
                    <Animated.View
                      key={`${item.reference}-${selectionIndex}`}
                      entering={FadeInDown.delay(selectionIndex * 60).duration(180)}
                      style={[
                        styles.matchCard,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {/* Match number pill + date/time + status */}
                      <View style={styles.matchCardTopRow}>
                        <View style={styles.matchCardTopLeft}>
                          {item.items.length > 1 && (
                            <View style={[styles.matchNumberPill, { backgroundColor: colors.primary + '20' }]}>
                              <Text style={[styles.matchNumberText, { color: colors.primary }]}>
                                Jogo {selectionIndex + 1}
                              </Text>
                            </View>
                          )}
                          {selectionItem.eventDate && (
                            <View style={[styles.matchDatePill, { backgroundColor: colors.surfaceRaised }]}>
                              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                              <Text style={[styles.matchDateText, { color: colors.textMuted }]}>
                                {formatSelectionDate(selectionItem.eventDate)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <StatusBadge status={(selectionItem.result ?? item.status) as BoletinStatus} />
                      </View>

                      {/* Teams face-off row */}
                      <View style={styles.matchTeamsContainer}>
                        <View style={styles.matchTeamSide}>
                          <TeamBadge
                            name={selectionItem.homeTeam}
                            imageUrl={edits.homeTeamImageUrl}
                            size={28}
                            variant={edits.sport === 'TENNIS' ? 'player' : 'team'}
                          />
                          <Text style={[styles.matchTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                            {selectionItem.homeTeam}
                          </Text>
                        </View>
                        <View style={styles.matchVsContainer}>
                          <Text style={[styles.matchVs, { color: colors.textMuted }]}>vs</Text>
                          <Text style={[styles.matchOdd, { color: colors.gold }]}>@ {formatOdds(selectionItem.oddValue)}</Text>
                        </View>
                        <View style={styles.matchTeamSide}>
                          <TeamBadge
                            name={edits.awayTeam || '?'}
                            imageUrl={edits.awayTeamImageUrl}
                            size={28}
                            variant={edits.sport === 'TENNIS' ? 'player' : 'team'}
                          />
                          <Text style={[styles.matchTeamName, { color: edits.awayTeam ? colors.textPrimary : colors.textMuted }]} numberOfLines={2}>
                            {edits.awayTeam || 'Adversário'}
                          </Text>
                        </View>
                      </View>

                      {/* Market & selection */}
                      <View style={[styles.matchMarketRow, { backgroundColor: colors.background }]}>
                        <Text style={{ fontSize: 13 }}>{getSportIcon(edits.sport)}</Text>
                        <Text style={[styles.matchMarketText, { color: colors.textSecondary }]} numberOfLines={2}>
                          {selectionItem.market} • {selectionItem.selection}
                        </Text>
                      </View>

                      {/* Editable fields */}
                      <View style={styles.editFieldsContainer}>
                        {/* Sport picker */}
                        <View style={[styles.editField, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>Desporto</Text>
                          <View style={styles.editFieldValue}>
                            <PressableScale
                              scaleDown={0.97}
                              onPress={() => setSportPickerTarget({ boletinIdx: index, itemIdx: selectionIndex })}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
                            >
                              <Text style={{ fontSize: 14 }}>{getSportIcon(edits.sport)}</Text>
                              <Text style={[styles.editFieldValueText, { color: colors.textPrimary }]}>
                                {SPORT_OPTIONS.find((o) => o.key === edits.sport)?.label ?? edits.sport}
                              </Text>
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            </PressableScale>
                            {edits.sport && edits.sport !== Sport.FOOTBALL && (
                              <Pressable
                                hitSlop={8}
                                onPress={() => updateItemEdit(index, selectionIndex, { sport: Sport.FOOTBALL })}
                              >
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </Pressable>
                            )}
                          </View>
                        </View>

                        {/* Competition picker */}
                        <View style={[styles.editField, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>Competição</Text>
                          <View style={styles.editFieldValue}>
                            <PressableScale
                              scaleDown={0.97}
                              onPress={() => setCompetitionPickerTarget({ boletinIdx: index, itemIdx: selectionIndex })}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
                            >
                              {edits.competition ? (
                                <>
                                  <CompetitionBadge name={edits.competition} size={16} />
                                  <Text style={[styles.editFieldValueText, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {edits.competition}
                                  </Text>
                                </>
                              ) : (
                                <Text style={[styles.editFieldValueText, { color: colors.textMuted }]}>
                                  Escolher competição...
                                </Text>
                              )}
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            </PressableScale>
                            {edits.competition ? (
                              <Pressable
                                hitSlop={8}
                                onPress={() => updateItemEdit(index, selectionIndex, { competition: '' })}
                              >
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>

                        {/* Home team picker */}
                        <PressableScale
                          scaleDown={0.97}
                          onPress={() => setTeamPickerTarget({ boletinIdx: index, itemIdx: selectionIndex, side: 'home' })}
                          style={[styles.editField, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>Casa</Text>
                          <View style={styles.editFieldValue}>
                            {edits.homeTeam ? (
                              <TeamBadge
                                name={edits.homeTeam}
                                imageUrl={edits.homeTeamImageUrl}
                                size={16}
                                variant={edits.sport === 'TENNIS' ? 'player' : 'team'}
                              />
                            ) : null}
                            <Text
                              numberOfLines={1}
                              style={[styles.editFieldValueText, { color: edits.homeTeam ? colors.textPrimary : colors.textMuted }]}
                            >
                              {edits.homeTeam || 'Selecionar equipa...'}
                            </Text>
                            {edits.homeTeam ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(e) => { e.stopPropagation(); updateItemEdit(index, selectionIndex, { homeTeam: '', homeTeamImageUrl: null }); }}
                              >
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </Pressable>
                            ) : (
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            )}
                          </View>
                        </PressableScale>

                        {/* Away team picker */}
                        <PressableScale
                          scaleDown={0.97}
                          onPress={() => setTeamPickerTarget({ boletinIdx: index, itemIdx: selectionIndex, side: 'away' })}
                          style={[styles.editField, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>Fora</Text>
                          <View style={styles.editFieldValue}>
                            {edits.awayTeam ? (
                              <TeamBadge
                                name={edits.awayTeam}
                                imageUrl={edits.awayTeamImageUrl}
                                size={16}
                                variant={edits.sport === 'TENNIS' ? 'player' : 'team'}
                              />
                            ) : null}
                            <Text
                              numberOfLines={1}
                              style={[styles.editFieldValueText, { color: edits.awayTeam ? colors.textPrimary : colors.textMuted }]}
                            >
                              {edits.awayTeam || 'Selecionar equipa...'}
                            </Text>
                            {edits.awayTeam ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(e) => { e.stopPropagation(); updateItemEdit(index, selectionIndex, { awayTeam: '', awayTeamImageUrl: null }); }}
                              >
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </Pressable>
                            ) : (
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            )}
                          </View>
                        </PressableScale>
                      </View>
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}
        </Card>
      );
    },
    [selected, expanded, toggleItem, toggleExpanded, colors, getItemEdit, updateItemEdit, setTeamPickerTarget],
  );

  if (!pdfResult || boletins.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="file-alert-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Não encontrámos apostas neste ficheiro.
          </Text>
          <Button title="Voltar" onPress={() => router.back()} variant="ghost" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Summary banner */}
      <Animated.View entering={FadeInDown.duration(160)} style={[styles.summaryBanner, { backgroundColor: colors.surface }]}>
        <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
          <Text style={{ fontWeight: '900' }}>{boletins.length}</Text> apostas encontradas
          {errorCount > 0 && (
            <Text style={{ color: colors.warning }}> · {errorCount} com erros</Text>
          )}
          {duplicateCount > 0 && (
            <Text style={{ color: colors.textMuted }}> · {duplicateCount} duplicadas</Text>
          )}
        </Text>
      </Animated.View>

      {/* Select all toggle */}
      <View style={[styles.selectAllRow, { borderColor: colors.border }]}>
        <PressableScale scaleDown={0.96} onPress={toggleAll} style={styles.selectAllButton}>
          <Ionicons
            name={selectedCount === boletins.length ? 'checkbox' : 'square-outline'}
            size={20}
            color={selectedCount === boletins.length ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.selectAllLabel, { color: colors.textPrimary }]}>
            {selectedCount === boletins.length ? 'Desselecionar tudo' : 'Selecionar tudo'}
          </Text>
        </PressableScale>
        <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
          {selectedCount} selecionadas
        </Text>
      </View>

      {/* Bet list */}
      <FlatList
        data={boletins}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.lg,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky footer */}
      <Animated.View style={[shakeStyle]}>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + tokens.spacing.md,
            },
          ]}
        >
          <Button
            title={selectedCount > 0 ? `Importar ${selectedCount} apostas` : 'Importar'}
            onPress={handleImport}
            loading={bulkImportMutation.isPending}
            disabled={selectedCount === 0 && !bulkImportMutation.isPending}
          />
          <Button
            title="Cancelar"
            variant="ghost"
            onPress={() => router.back()}
            disabled={bulkImportMutation.isPending}
          />
        </View>
      </Animated.View>

      {/* Competition Picker Modal */}
      <CompetitionPickerModal
        visible={competitionPickerTarget !== null}
        onClose={() => setCompetitionPickerTarget(null)}
        title="Escolher competição"
        sections={competitionSections}
        sport={competitionPickerSport as Sport | undefined}
        allowCustomValue
        onSelect={(value) => {
          if (competitionPickerTarget) {
            updateItemEdit(competitionPickerTarget.boletinIdx, competitionPickerTarget.itemIdx, {
              competition: value,
            });
          }
          setCompetitionPickerTarget(null);
        }}
      />

      {/* Team Picker Modal */}
      <SearchableDropdown
        visible={teamPickerTarget !== null}
        onClose={() => setTeamPickerTarget(null)}
        title={teamPickerTarget?.side === 'home' ? 'Equipa Casa' : 'Equipa Fora'}
        items={teamPickerItems}
        renderItemLeft={(dropItem) => (
          <TeamBadge
            disableRemoteFallback
            imageUrl={dropItem.imageUrl}
            name={dropItem.value}
            size={28}
            variant={teamPickerSport === Sport.TENNIS ? 'player' : 'team'}
          />
        )}
        onSelect={(val) => {
          if (teamPickerTarget) {
            const picked = teamsQuery.data?.find((t) => (t.displayName ?? t.name) === val)
              ?? allTeamsQuery.data?.find((t) => (t.displayName ?? t.name) === val);
            const imageUrl = picked?.imageUrl ?? null;
            if (teamPickerTarget.side === 'home') {
              updateItemEdit(teamPickerTarget.boletinIdx, teamPickerTarget.itemIdx, {
                homeTeam: val,
                homeTeamImageUrl: imageUrl,
              });
            } else {
              updateItemEdit(teamPickerTarget.boletinIdx, teamPickerTarget.itemIdx, {
                awayTeam: val,
                awayTeamImageUrl: imageUrl,
              });
            }
          }
          setTeamPickerTarget(null);
          return true;
        }}
        isLoading={teamsQuery.isLoading || allTeamsQuery.isLoading}
        allowCustomValue
        initialVisibleCount={20}
      />

      {/* Sport Picker Modal */}
      <Modal
        visible={sportPickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSportPickerTarget(null)}
      >
        <Pressable
          style={styles.sportModalBackdrop}
          onPress={() => setSportPickerTarget(null)}
        >
          <View style={[styles.sportModalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sportModalTitle, { color: colors.textPrimary }]}>Desporto</Text>
            <View style={styles.sportModalGrid}>
              {SPORT_OPTIONS.map((opt) => {
                const isActive =
                  sportPickerTarget !== null &&
                  getItemEdit(sportPickerTarget.boletinIdx, sportPickerTarget.itemIdx).sport === opt.key;
                return (
                  <PressableScale
                    scaleDown={0.92}
                    key={opt.key}
                    onPress={() => {
                      if (sportPickerTarget) {
                        updateItemEdit(sportPickerTarget.boletinIdx, sportPickerTarget.itemIdx, {
                          sport: opt.key,
                        });
                      }
                      setSportPickerTarget(null);
                    }}
                    style={[
                      styles.sportModalChip,
                      {
                        borderColor: isActive ? colors.primary : colors.border,
                        backgroundColor: isActive ? colors.primary + '18' : colors.surfaceRaised,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                    <Text
                      style={[
                        styles.sportModalChipLabel,
                        { color: isActive ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  summaryBanner: { paddingHorizontal: 16, paddingVertical: 12 },
  summaryText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectAllButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllLabel: { fontSize: 14, fontWeight: '600' },
  selectedCount: { fontSize: 13 },
  betCard: {
    marginTop: 10,
    gap: 8,
    borderLeftWidth: 4,
  },
  betCardDeselected: { opacity: 0.5 },
  betCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  betCardBadges: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' },
  betCardDate: { fontSize: 13, fontWeight: '600', flex: 1 },
  betCardEvent: { gap: 4 },
  betCardTeams: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  betCardMore: { fontSize: 12 },
  betCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  betCardMetaText: { fontSize: 13, flexShrink: 1 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  vsText: { fontSize: 12, fontWeight: '500' },
  betCardMetrics: { flexDirection: 'row', gap: 12, marginTop: 4 },
  betCardMetricItem: { gap: 2, flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  metricValue: { fontSize: 14, fontWeight: '800' },
  betCardError: { fontSize: 12, fontStyle: 'italic' },
  detailsButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailsButtonText: { fontSize: 12, fontWeight: '700' },

  // ── Expanded match cards ──
  expandedContainer: {
    marginTop: 6,
    gap: 10,
  },
  matchCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  matchCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  matchCardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  matchNumberPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  matchNumberText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchDateText: {
    fontSize: 10,
    fontWeight: '600',
  },
  matchTeamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  matchTeamSide: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  matchTeamName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  matchVsContainer: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  matchVs: {
    fontSize: 11,
    fontWeight: '600',
  },
  matchOdd: {
    fontSize: 12,
    fontWeight: '900',
  },
  matchMarketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchMarketText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 17,
  },
  editFieldsContainer: {
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
  },
  editField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  editFieldLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  editFieldValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editFieldValueText: { fontSize: 13, fontWeight: '500', flex: 1 },

  sportModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sportModalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  sportModalTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sportModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  sportModalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sportModalChipLabel: { fontSize: 13, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
