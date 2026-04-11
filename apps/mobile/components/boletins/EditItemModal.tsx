import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  compareTennisCompetitions,
  compareTennisCountries,
  getTennisTournamentCountry,
  getTennisTournamentPoints,
  ItemResult,
  Sport,
} from '@betintel/shared';
import type { UpdateBoletinItemInput } from '@betintel/shared';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CompetitionBadge } from '../ui/CompetitionBadge';
import { PressableScale } from '../ui/PressableScale';
import { TeamBadge } from '../ui/TeamBadge';
import { CompetitionPickerModal } from '../ui/CompetitionPickerModal';
import { SearchableDropdown } from '../ui/SearchableDropdown';
import { useCompetitions, useTeams, useMarkets } from '../../services/referenceService';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { useTheme } from '../../theme/useTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditItemInitialValues {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: Sport;
  market: string;
  selection: string;
  /** Decimal serialised as string */
  oddValue: string;
  result: ItemResult;
}

interface EditItemModalProps {
  visible: boolean;
  item: EditItemInitialValues | null;
  isSaving: boolean;
  onSave: (itemId: string, changes: UpdateBoletinItemInput) => void;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const RESULT_OPTIONS: { label: string; value: ItemResult; color: string }[] = [
  { label: 'Pendente', value: ItemResult.PENDING, color: '#FF9500' },
  { label: 'Ganhou', value: ItemResult.WON, color: '#00C851' },
  { label: 'Perdeu', value: ItemResult.LOST, color: '#FF3B30' },
  { label: 'Cancelado', value: ItemResult.VOID, color: '#007AFF' },
];

function parseDoublesTeam(team: string): [string, string] | null {
  const parts = team.split(' / ');
  if (parts.length === 2 && parts[0] && parts[1]) return [parts[0], parts[1]];
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Full-screen modal for editing an individual boletin selection, styled like the create screen. */
export function EditItemModal({ visible, item, isSaving, onSave, onClose }: EditItemModalProps) {
  const { colors } = useTheme();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [sport, setSport] = useState<Sport>(Sport.FOOTBALL);
  const [competition, setCompetition] = useState('');
  const [competitionCountry, setCompetitionCountry] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [homeTeam2, setHomeTeam2] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [awayTeam2, setAwayTeam2] = useState('');
  const [isDoubles, setIsDoubles] = useState(false);
  const [market, setMarket] = useState('');
  const [useCustomMarket, setUseCustomMarket] = useState(false);
  const [selection, setSelection] = useState('');
  const [oddRaw, setOddRaw] = useState('');
  const [result, setResult] = useState<ItemResult>(ItemResult.PENDING);

  // ── Dropdown visibility ─────────────────────────────────────────────────────
  const [showSports, setShowSports] = useState(false);
  const [showCompetitions, setShowCompetitions] = useState(false);
  const [showHomeTeams, setShowHomeTeams] = useState(false);
  const [showHomeTeams2, setShowHomeTeams2] = useState(false);
  const [showAwayTeams, setShowAwayTeams] = useState(false);
  const [showAwayTeams2, setShowAwayTeams2] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const [playerTour, setPlayerTour] = useState<'ATP' | 'WTA' | null>(null);

  // ── Reference data ──────────────────────────────────────────────────────────
  const sportForApi = useMemo(
    () => (Object.values(Sport).includes(sport) ? sport : Sport.OTHER),
    [sport],
  );

  const competitionsQuery = useCompetitions(sportForApi);
  const teamQueryParams = useMemo(
    () =>
      sport === Sport.TENNIS
        ? { sport: sportForApi, competition: 'ATP Tour' }
        : competition
          ? { sport: sportForApi, competition }
          : { sport: sportForApi },
    [competition, sport, sportForApi],
  );
  const teamsQuery = useTeams(teamQueryParams);
  const allTeamsQuery = useTeams({ sport: sportForApi });
  const wtaTeamsQuery = useTeams(
    { sport: sportForApi, competition: 'WTA Tour' },
    { enabled: sport === Sport.TENNIS },
  );
  const marketsQuery = useMarkets(sportForApi);

  const wtaPlayerValueSet = useMemo(
    () => new Set((wtaTeamsQuery.data ?? []).map((t) => t.displayName ?? t.name)),
    [wtaTeamsQuery.data],
  );

  const competitionSections = useMemo(() => {
    const comps = (competitionsQuery.data ?? []).map((c) =>
      sport === Sport.TENNIS
        ? { ...c, country: getTennisTournamentCountry(c.name, c.country), points: c.points ?? getTennisTournamentPoints(c.name) }
        : c,
    );

    if (sport === Sport.TENNIS) {
      const countryPoints = new Map<string, number>();
      for (const c of comps) {
        countryPoints.set(c.country, (countryPoints.get(c.country) ?? 0) + (c.points ?? 0));
      }
      const sorted = [...comps].sort((l, r) => {
        const cc = compareTennisCountries(l.country, r.country, countryPoints);
        return cc !== 0 ? cc : compareTennisCompetitions(l, r);
      });
      const countryMap = new Map<string, typeof sorted>();
      for (const c of sorted) {
        if (!countryMap.has(c.country)) countryMap.set(c.country, []);
        countryMap.get(c.country)!.push(c);
      }
      return Array.from(countryMap.entries()).map(([country, cs]) => ({
        title: country,
        country,
        subtitle: `${countryPoints.get(country) ?? 0} pts totais`,
        data: cs.map((c) => ({ label: c.name, value: c.name, country: c.country, subtitle: c.points ? `${c.points} pts` : undefined })),
      }));
    }

    const countryMap = new Map<string, typeof comps>();
    for (const c of comps) {
      if (!countryMap.has(c.country)) countryMap.set(c.country, []);
      countryMap.get(c.country)!.push(c);
    }
    const sections = Array.from(countryMap.entries()).map(([country, cs]) => ({
      title: country,
      country,
      data: cs.map((c) => ({ label: c.name, value: c.name, tier: c.tier })),
    }));
    const TOP_6 = ['Portugal', 'Inglaterra', 'Espanha', 'Itália', 'Alemanha', 'França'];
    sections.sort((a, b) => {
      const ai = TOP_6.indexOf(a.country), bi = TOP_6.indexOf(b.country);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.country.localeCompare(b.country, 'pt');
    });
    return sections;
  }, [competitionsQuery.data, sport]);

  // Once WTA data is available, auto-detect tour from the seeded homeTeam
  useEffect(() => {
    if (sport !== Sport.TENNIS || !homeTeam || wtaTeamsQuery.isLoading) return;
    if (playerTour !== null) return; // already set by user or already detected
    setPlayerTour(wtaPlayerValueSet.has(homeTeam) ? 'WTA' : 'ATP');
  }, [sport, homeTeam, wtaTeamsQuery.isLoading, wtaPlayerValueSet, playerTour]);

  const visibleCompetitionSections = useMemo(() => {
    if (sport !== Sport.TENNIS || !playerTour) return competitionSections;
    const isWta = (name: string) => name.includes('WTA') || name === 'Billie Jean King Cup';
    if (playerTour === 'WTA') {
      return competitionSections
        .map((s) => ({ ...s, data: s.data.filter((item) => isWta(item.value)) }))
        .filter((s) => s.data.length > 0);
    }
    return competitionSections
      .map((s) => ({ ...s, data: s.data.filter((item) => !isWta(item.value)) }))
      .filter((s) => s.data.length > 0);
  }, [competitionSections, sport, playerTour]);

  const teamItems = useMemo(() => {
    const data = teamsQuery.data ?? [];
    const source =
      sport !== Sport.TENNIS && competition && !teamsQuery.isLoading && data.length === 0
        ? (allTeamsQuery.data ?? [])
        : data;
    return source.map((t) => ({
      label: t.displayName ?? t.name,
      value: t.displayName ?? t.name,
      subtitle: sport === Sport.TENNIS && t.country ? t.country : undefined,
      imageUrl: t.imageUrl ?? null,
    }));
  }, [competition, sport, teamsQuery.isLoading, teamsQuery.data, allTeamsQuery.data]);

  const teamItemsByName = useMemo(
    () => new Map(teamItems.map((i) => [i.value, i])),
    [teamItems],
  );

  const marketSections = useMemo(() => {
    const finalHome = isDoubles && sport === Sport.TENNIS ? `${homeTeam} / ${homeTeam2}` : homeTeam;
    const finalAway = isDoubles && sport === Sport.TENNIS ? `${awayTeam} / ${awayTeam2}` : awayTeam;
    const data = marketsQuery.data ?? [];
    const grouped = new Map<string, typeof data>();
    for (const m of data) {
      const cat = m.category ?? 'Outro';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(m);
    }
    const sortedCats = [...grouped.keys()].sort(
      (a, b) =>
        (MARKET_CATEGORY_ORDER.indexOf(a) === -1 ? 99 : MARKET_CATEGORY_ORDER.indexOf(a)) -
        (MARKET_CATEGORY_ORDER.indexOf(b) === -1 ? 99 : MARKET_CATEGORY_ORDER.indexOf(b)),
    );
    return sortedCats.map((cat) => ({
      title: cat,
      data: (grouped.get(cat) ?? []).map((m) => ({
        label: finalHome && finalAway ? humanizeMarket(m.name, finalHome, finalAway) : m.name,
        value: m.name,
      })),
    }));
  }, [marketsQuery.data, homeTeam, homeTeam2, awayTeam, awayTeam2, isDoubles, sport]);

  const sportLabel = useMemo(
    () => SPORT_OPTIONS.find((s) => s.key === sport) ?? { icon: '🏅', label: sport, key: sport },
    [sport],
  );

  // Derived combined names (for doubles)
  const finalHomeTeam = isDoubles && sport === Sport.TENNIS ? `${homeTeam} / ${homeTeam2}` : homeTeam;
  const finalAwayTeam = isDoubles && sport === Sport.TENNIS ? `${awayTeam} / ${awayTeam2}` : awayTeam;

  // Auto-fill selection for self-describing markets
  useEffect(() => {
    if (!useCustomMarket && isSelfDescribing(market)) {
      setSelection(humanizeMarket(market, finalHomeTeam, finalAwayTeam));
    } else if (!useCustomMarket && !isDoubles) {
      // Don't clear in the middle of doubles entry when one player is still empty
      setSelection('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, homeTeam, homeTeam2, awayTeam, awayTeam2, isDoubles, sport, useCustomMarket]);

  // Seed from item on open
  useEffect(() => {
    if (!item || !visible) return;

    const detectedDoubles = item.sport === Sport.TENNIS && item.homeTeam.includes(' / ');
    setIsDoubles(detectedDoubles);
    setSport(item.sport);
    setCompetition(item.competition);
    setCompetitionCountry('');
    setMarket(item.market);
    setUseCustomMarket(false);
    setSelection(item.selection);
    setOddRaw(String(parseFloat(item.oddValue)));
    setResult(item.result);

    if (detectedDoubles) {
      const homeParts = parseDoublesTeam(item.homeTeam);
      const awayParts = parseDoublesTeam(item.awayTeam);
      setHomeTeam(homeParts?.[0] ?? item.homeTeam);
      setHomeTeam2(homeParts?.[1] ?? '');
      setAwayTeam(awayParts?.[0] ?? item.awayTeam);
      setAwayTeam2(awayParts?.[1] ?? '');
    } else {
      setHomeTeam(item.homeTeam);
      setHomeTeam2('');
      setAwayTeam(item.awayTeam);
      setAwayTeam2('');
    }
    // Seed playerTour for tennis — will be refined once WTA data loads
    if (item.sport === Sport.TENNIS) {
      setPlayerTour(null); // reset; wtaPlayerValueSet effect below will detect
    } else {
      setPlayerTour(null);
    }
  }, [item, visible]);

  const handleSave = useCallback(() => {
    if (!item) return;

    const trimHL = finalHomeTeam.trim();
    const trimAL = finalAwayTeam.trim();
    const trimComp = competition.trim();
    const trimMarket = market.trim();
    const trimSelection = selection.trim();
    const oddNum = parseFloat(oddRaw.replace(',', '.'));

    if (!trimHL || !trimAL) return;
    if (!trimMarket || !trimSelection) return;
    if (isNaN(oddNum) || oddNum < 0) return;

    const humanized = humanizeMarket(trimMarket, trimHL, trimAL);
    const changes: UpdateBoletinItemInput = {};

    if (trimHL !== item.homeTeam) changes.homeTeam = trimHL;
    if (trimAL !== item.awayTeam) changes.awayTeam = trimAL;
    if (trimComp !== item.competition) changes.competition = trimComp || 'Geral';
    if (sport !== item.sport) changes.sport = sport;
    if (humanized !== item.market) changes.market = humanized;
    if (trimSelection !== item.selection) changes.selection = trimSelection;
    if (oddNum !== parseFloat(item.oddValue)) changes.oddValue = oddNum;
    if (result !== item.result) changes.result = result;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    onSave(item.id, changes);
  }, [item, finalHomeTeam, finalAwayTeam, competition, sport, market, selection, oddRaw, result, onSave, onClose]);

  if (!item) return null;

  const homeTeamItem = teamItemsByName.get(homeTeam);
  const homeTeamItem2 = teamItemsByName.get(homeTeam2);
  const awayTeamItem = teamItemsByName.get(awayTeam);
  const awayTeamItem2 = teamItemsByName.get(awayTeam2);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={[styles.navHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable hitSlop={10} onPress={onClose} style={styles.navClose}>
            <Ionicons color={colors.textPrimary} name="close" size={24} />
          </Pressable>
          <Text style={[styles.navTitle, { color: colors.textPrimary }]}>Editar seleção</Text>
          <Pressable disabled={isSaving} hitSlop={10} onPress={handleSave} style={[styles.navSave, { opacity: isSaving ? 0.5 : 1 }]}>
            <Text style={[styles.navSaveText, { color: colors.primary }]}>
              {isSaving ? 'A guardar…' : 'Guardar'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Sport ──────────────────────────────────────────────────── */}
          <PressableScale
            onPress={() => setShowSports(true)}
            style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <View style={styles.fieldBtnInner}>
              <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>DESPORTO</Text>
              <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: colors.textPrimary }]}>
                {`${sportLabel.icon} ${sportLabel.label}`}
              </Text>
            </View>
            <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
          </PressableScale>

          {/* ── Doubles toggle (Tennis only) ───────────────────────────── */}
          {sport === Sport.TENNIS && (
            <View style={styles.doublesRow}>
              {[
                { label: 'Singulares', value: false },
                { label: 'Doubles 🎾', value: true },
              ].map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  onPress={() => {
                    setIsDoubles(opt.value);
                    setHomeTeam2('');
                    setAwayTeam2('');
                  }}
                  style={[
                    styles.doublesBtn,
                    {
                      backgroundColor: isDoubles === opt.value ? colors.primary : colors.surfaceRaised,
                      borderColor: isDoubles === opt.value ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.doublesBtnText, { color: isDoubles === opt.value ? '#fff' : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Competition ────────────────────────────────────────────── */}
          <PressableScale
            onPress={() => setShowCompetitions(true)}
            style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <View style={styles.fieldBtnInner}>
              <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>COMPETIÇÃO</Text>
              <View style={styles.fieldBtnRow}>
                {competition ? <CompetitionBadge country={competitionCountry} name={competition} size={16} /> : null}
                <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: competition ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                  {competition || 'Selecionar competição'}
                </Text>
              </View>
            </View>
            {competition ? (
              <Pressable hitSlop={8} onPress={() => { setCompetition(''); setCompetitionCountry(''); }}>
                <Ionicons color={colors.textMuted} name="close-circle" size={18} />
              </Pressable>
            ) : (
              <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
            )}
          </PressableScale>

          {/* ── Home Team / Player 1 ───────────────────────────────────── */}
          <PressableScale
            onPress={() => setShowHomeTeams(true)}
            style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <View style={styles.fieldBtnInner}>
              <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
                {sport === Sport.TENNIS
                  ? isDoubles ? 'JOGADOR 1 (PAR CASA)' : 'JOGADOR 1'
                  : 'EQUIPA CASA'}
              </Text>
              <View style={styles.fieldBtnRow}>
                {homeTeam ? (
                  <TeamBadge imageUrl={homeTeamItem?.imageUrl} name={homeTeam} size={16} variant={sport === Sport.TENNIS ? 'player' : 'team'} />
                ) : null}
                <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: homeTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                  {homeTeam || (sport === Sport.TENNIS ? 'Selecionar jogador' : 'Selecionar equipa')}
                </Text>
              </View>
            </View>
            {homeTeam ? (
              <Pressable hitSlop={8} onPress={() => setHomeTeam('')}>
                <Ionicons color={colors.textMuted} name="close-circle" size={18} />
              </Pressable>
            ) : (
              <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
            )}
          </PressableScale>

          {/* ── Home Player 2 (doubles only) ───────────────────────────── */}
          {isDoubles && sport === Sport.TENNIS && (
            <PressableScale
              onPress={() => setShowHomeTeams2(true)}
              style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <View style={styles.fieldBtnInner}>
                <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>JOGADOR 2 (PAR CASA)</Text>
                <View style={styles.fieldBtnRow}>
                  {homeTeam2 ? (
                    <TeamBadge imageUrl={homeTeamItem2?.imageUrl} name={homeTeam2} size={16} variant="player" />
                  ) : null}
                  <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: homeTeam2 ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                    {homeTeam2 || 'Selecionar jogador'}
                  </Text>
                </View>
              </View>
              {homeTeam2 ? (
                <Pressable hitSlop={8} onPress={() => setHomeTeam2('')}>
                  <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                </Pressable>
              ) : (
                <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
              )}
            </PressableScale>
          )}

          {/* ── Away Team / Player 1 ───────────────────────────────────── */}
          <PressableScale
            onPress={() => setShowAwayTeams(true)}
            style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <View style={styles.fieldBtnInner}>
              <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
                {sport === Sport.TENNIS
                  ? isDoubles ? 'JOGADOR 1 (PAR FORA)' : 'JOGADOR 2'
                  : 'EQUIPA FORA'}
              </Text>
              <View style={styles.fieldBtnRow}>
                {awayTeam ? (
                  <TeamBadge imageUrl={awayTeamItem?.imageUrl} name={awayTeam} size={16} variant={sport === Sport.TENNIS ? 'player' : 'team'} />
                ) : null}
                <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: awayTeam ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                  {awayTeam || (sport === Sport.TENNIS ? 'Selecionar jogador' : 'Selecionar equipa')}
                </Text>
              </View>
            </View>
            {awayTeam ? (
              <Pressable hitSlop={8} onPress={() => setAwayTeam('')}>
                <Ionicons color={colors.textMuted} name="close-circle" size={18} />
              </Pressable>
            ) : (
              <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
            )}
          </PressableScale>

          {/* ── Away Player 2 (doubles only) ───────────────────────────── */}
          {isDoubles && sport === Sport.TENNIS && (
            <PressableScale
              onPress={() => setShowAwayTeams2(true)}
              style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <View style={styles.fieldBtnInner}>
                <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>JOGADOR 2 (PAR FORA)</Text>
                <View style={styles.fieldBtnRow}>
                  {awayTeam2 ? (
                    <TeamBadge imageUrl={awayTeamItem2?.imageUrl} name={awayTeam2} size={16} variant="player" />
                  ) : null}
                  <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: awayTeam2 ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
                    {awayTeam2 || 'Selecionar jogador'}
                  </Text>
                </View>
              </View>
              {awayTeam2 ? (
                <Pressable hitSlop={8} onPress={() => setAwayTeam2('')}>
                  <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                </Pressable>
              ) : (
                <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
              )}
            </PressableScale>
          )}

          {/* ── Market ─────────────────────────────────────────────────── */}
          <Text style={[styles.sectionDivider, { color: colors.textSecondary }]}>Aposta</Text>

          {useCustomMarket ? (
            <Input
              label="Mercado personalizado"
              placeholder="Ex: Treinador demitido, Golos minuto 90..."
              value={market}
              onChangeText={setMarket}
            />
          ) : (
            <PressableScale
              onPress={() => {
                if (!finalHomeTeam || !finalAwayTeam) return;
                setShowMarkets(true);
              }}
              style={[
                styles.fieldBtn,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: finalHomeTeam && finalAwayTeam ? 1 : 0.45 },
              ]}
            >
              <View style={styles.fieldBtnInner}>
                <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>MERCADO</Text>
                <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: market ? colors.textPrimary : colors.textMuted }]}>
                  {market
                    ? finalHomeTeam && finalAwayTeam
                      ? humanizeMarket(market, finalHomeTeam, finalAwayTeam)
                      : market
                    : 'Selecionar mercado'}
                </Text>
              </View>
              {market ? (
                <Pressable hitSlop={8} onPress={() => { setMarket(''); setSelection(''); }}>
                  <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                </Pressable>
              ) : (
                <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
              )}
            </PressableScale>
          )}

          <Pressable
            onPress={() => { setUseCustomMarket((v) => !v); setMarket(''); setSelection(''); }}
            style={styles.customMarketToggle}
          >
            <Ionicons color={colors.primary} name={useCustomMarket ? 'list-outline' : 'create-outline'} size={13} />
            <Text style={[styles.customMarketToggleText, { color: colors.primary }]}>
              {useCustomMarket ? 'Escolher da lista de mercados' : 'Escrever mercado personalizado'}
            </Text>
          </Pressable>

          {/* ── Selection + Odd ─────────────────────────────────────────── */}
          <View style={styles.inlineRow}>
            {(useCustomMarket || (!isSelfDescribing(market) && market.trim() !== selection.trim())) && (
              <View style={{ flex: 2 }}>
                <Input label="Seleção" placeholder="Ex: 1, X, Over 2.5" value={selection} onChangeText={setSelection} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Input label="Odd" placeholder="1.85" keyboardType="decimal-pad" value={oddRaw} onChangeText={setOddRaw} />
            </View>
          </View>

          {/* ── Result ─────────────────────────────────────────────────── */}
          <Text style={[styles.sectionDivider, { color: colors.textSecondary }]}>Resultado</Text>
          <View style={styles.resultRow}>
            {RESULT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setResult(opt.value)}
                style={[
                  styles.resultBtn,
                  {
                    backgroundColor: result === opt.value ? `${opt.color}22` : colors.surfaceRaised,
                    borderColor: result === opt.value ? opt.color : colors.border,
                  },
                ]}
              >
                <Text style={[styles.resultBtnText, { color: result === opt.value ? opt.color : colors.textSecondary, fontWeight: result === opt.value ? '700' : '400' }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Footer save button */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 32 : 16 }]}>
          <Button loading={isSaving} onPress={handleSave} title="Guardar alterações" />
        </View>
      </KeyboardAvoidingView>

      {/* ── Dropdowns (rendered outside KeyboardAvoidingView to avoid z-index clipping) ── */}
      <SearchableDropdown
        visible={showSports}
        onClose={() => setShowSports(false)}
        title="Desporto"
        items={SPORT_OPTIONS.map((s) => ({ label: `${s.icon} ${s.label}`, value: s.key }))}
        onSelect={(val) => {
          setSport(val as Sport);
          setIsDoubles(false);
          setCompetition('');
          setCompetitionCountry('');
          setHomeTeam('');
          setHomeTeam2('');
          setAwayTeam('');
          setAwayTeam2('');
          setMarket('');
          setSelection('');
        }}
        allowCustomValue
      />
      <CompetitionPickerModal
        visible={showCompetitions}
        onClose={() => setShowCompetitions(false)}
        title="Competição"
        sections={visibleCompetitionSections}
        sport={sportForApi}
        performanceMode="fast"
        preloadWhenHidden
        defaultExpandedCount={sportForApi === Sport.FOOTBALL ? 6 : 10}
        allowCustomValue
        onSelect={(val) => {
          setCompetition(val);
          const found = competitionsQuery.data?.find((c) => c.name === val);
          setCompetitionCountry(found ? getTennisTournamentCountry(found.name, found.country) : '');
          setHomeTeam('');
          setHomeTeam2('');
          setAwayTeam('');
          setAwayTeam2('');
        }}
      />
      <SearchableDropdown
        visible={showHomeTeams}
        onClose={() => setShowHomeTeams(false)}
        title={sport === Sport.TENNIS ? (isDoubles ? 'Jogador 1 (Par Casa)' : 'Jogador 1') : 'Equipa Casa'}
        items={teamItems}
        renderItemLeft={(i) => <TeamBadge disableRemoteFallback imageUrl={i.imageUrl} name={i.value} size={30} variant={sport === Sport.TENNIS ? 'player' : 'team'} />}
          onSelect={(val) => {
            setHomeTeam(val);
            if (sport === Sport.TENNIS) {
              setPlayerTour(wtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
            }
          }}
        isLoading={teamsQuery.isLoading}
        allowCustomValue
        initialVisibleCount={20}
      />
      {isDoubles && sport === Sport.TENNIS && (
        <SearchableDropdown
          visible={showHomeTeams2}
          onClose={() => setShowHomeTeams2(false)}
          title="Jogador 2 (Par Casa)"
          items={teamItems}
          renderItemLeft={(i) => <TeamBadge disableRemoteFallback imageUrl={i.imageUrl} name={i.value} size={30} variant="player" />}
          onSelect={setHomeTeam2}
          isLoading={teamsQuery.isLoading}
          allowCustomValue
          initialVisibleCount={20}
        />
      )}
      <SearchableDropdown
        visible={showAwayTeams}
        onClose={() => setShowAwayTeams(false)}
        title={sport === Sport.TENNIS ? (isDoubles ? 'Jogador 1 (Par Fora)' : 'Jogador 2') : 'Equipa Fora'}
        items={teamItems}
          renderItemLeft={(i) => <TeamBadge disableRemoteFallback imageUrl={i.imageUrl} name={i.value} size={30} variant={sport === Sport.TENNIS ? 'player' : 'team'} />}
          onSelect={(val) => {
            setAwayTeam(val);
            if (sport === Sport.TENNIS && playerTour === null) {
              setPlayerTour(wtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
            }
          }}
        isLoading={teamsQuery.isLoading}
        allowCustomValue
        initialVisibleCount={20}
      />
      {isDoubles && sport === Sport.TENNIS && (
        <SearchableDropdown
          visible={showAwayTeams2}
          onClose={() => setShowAwayTeams2(false)}
          title="Jogador 2 (Par Fora)"
          items={teamItems}
          renderItemLeft={(i) => <TeamBadge disableRemoteFallback imageUrl={i.imageUrl} name={i.value} size={30} variant="player" />}
          onSelect={setAwayTeam2}
          isLoading={teamsQuery.isLoading}
          allowCustomValue
          initialVisibleCount={20}
        />
      )}
      <SearchableDropdown
        visible={showMarkets}
        onClose={() => setShowMarkets(false)}
        title="Mercado"
        sections={marketSections}
        onSelect={setMarket}
        isLoading={marketsQuery.isLoading}
        initialVisibleCount={8}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 56 : 52,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navClose: { width: 60, alignItems: 'flex-start' },
  navTitle: { fontSize: 16, fontWeight: '700' },
  navSave: { width: 60, alignItems: 'flex-end' },
  navSaveText: { fontSize: 16, fontWeight: '700' },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 10 },
  sectionDivider: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 6,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  fieldBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldBtnInner: { flex: 1, gap: 2 },
  fieldBtnLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fieldBtnValue: { fontSize: 15, fontWeight: '600' },
  fieldBtnRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  doublesRow: { flexDirection: 'row', gap: 8 },
  doublesBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flex: 1, paddingVertical: 9 },
  doublesBtnText: { fontSize: 13, fontWeight: '600' },
  customMarketToggle: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: -4 },
  customMarketToggleText: { fontSize: 12, fontWeight: '600' },
  inlineRow: { flexDirection: 'row', gap: 12 },
  resultRow: { flexDirection: 'row', gap: 8 },
  resultBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flex: 1, paddingVertical: 10 },
  resultBtnText: { fontSize: 12 },
  footer: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
});

