import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  compareTennisCompetitions,
  compareTennisCountries,
  getTennisTournamentCountry,
  getTennisTournamentPoints,
  BoletinStatus,
  ItemResult,
  Sport,
} from '@betintel/shared';
import type { BoletinDetail } from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { NumericInput } from '../../components/ui/NumericInput';
import { CompetitionBadge } from '../../components/ui/CompetitionBadge';
import { PressableScale } from '../../components/ui/PressableScale';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import { BoletinItem as BoletinSelectionRow } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { ProjectionCard } from '../../components/boletins/ProjectionCard';
import { StakeInput } from '../../components/boletins/StakeInput';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import type { DropdownItem, DropdownSection } from '../../components/ui/SearchableDropdown';
import { CompetitionPickerModal } from '../../components/ui/CompetitionPickerModal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { boletinQueryKeys, useBoletins } from '../../services/boletinService';
import { useMeProfile } from '../../services/socialService';
import { usePersonalStats } from '../../services/statsService';
import { useCompetitions, useTeams, useMarkets } from '../../services/referenceService';
import { BETTING_SITES, COMPETITION_COUNTRY_ORDER, getCountryFlagEmoji } from '../../utils/sportAssets';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { useBoletinBuilderStore, type BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

// ─── Sport options ───────────────────────────────────────────────────────────
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

function normalizeSelectionValue(value: string): string {
  return value.trim().toLocaleLowerCase('pt-PT');
}

function createExcludedValueSet(...values: Array<string | null | undefined>): Set<string> {
  return new Set(
    values
      .map((value) => (value ? normalizeSelectionValue(value) : ''))
      .filter(Boolean),
  );
}

function filterDropdownItems(items: DropdownItem[], excludedValues: Set<string>): DropdownItem[] {
  if (excludedValues.size === 0) return items;
  return items.filter((item) => !excludedValues.has(normalizeSelectionValue(item.value)));
}

function filterDropdownSections(
  sections: DropdownSection[] | undefined,
  excludedValues: Set<string>,
): DropdownSection[] | undefined {
  if (!sections || excludedValues.size === 0) return sections;
  return sections
    .map((section) => ({
      ...section,
      data: section.data.filter((item) => !excludedValues.has(normalizeSelectionValue(item.value))),
    }))
    .filter((section) => section.data.length > 0);
}

// ─── Add Selection Form ──────────────────────────────────────────────────────
interface AddSelectionFormProps {
  onAdd: (item: BoletinBuilderItem) => void;
  pendingBoletins: BoletinDetail[];
}

function AddSelectionForm({ onAdd, pendingBoletins }: AddSelectionFormProps) {
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();

  const [sport, setSport] = useState<string>(Sport.FOOTBALL);
  const [competition, setCompetition] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [homeTeam2, setHomeTeam2] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [awayTeam2, setAwayTeam2] = useState('');
  const [isDoubles, setIsDoubles] = useState(false);
  const [market, setMarket] = useState('');
  const [useCustomMarket, setUseCustomMarket] = useState(false);
  const [selection, setSelection] = useState('');

  // Auto-fill selection when the market is self-describing, updating when teams change too
  useEffect(() => {
    const fHome = isDoubles && sport === Sport.TENNIS ? `${homeTeam} / ${homeTeam2}` : homeTeam;
    const fAway = isDoubles && sport === Sport.TENNIS ? `${awayTeam} / ${awayTeam2}` : awayTeam;
    if (!useCustomMarket && isSelfDescribing(market)) {
      setSelection(humanizeMarket(market, fHome, fAway));
    } else if (!useCustomMarket) {
      setSelection('');
    }
  }, [market, homeTeam, homeTeam2, awayTeam, awayTeam2, isDoubles, sport, useCustomMarket]);
  const [oddValue, setOddValue] = useState('');

  const [showCompetitions, setShowCompetitions] = useState(false);
  const [showHomeTeams, setShowHomeTeams] = useState(false);
  const [showHomeTeams2, setShowHomeTeams2] = useState(false);
  const [showAwayTeams, setShowAwayTeams] = useState(false);
  const [showAwayTeams2, setShowAwayTeams2] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showSports, setShowSports] = useState(false);
  const [competitionCountry, setCompetitionCountry] = useState('');

  // Tennis player filters
  const [playerCountryFilter, setPlayerCountryFilter] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  // Whether any currently selected player is from the WTA (drives competition list filter)
  const [playerTour, setPlayerTour] = useState<'ATP' | 'WTA' | null>(null);
  // Tab selection for the player search header (ALL shows both sections)
  const [playerTourTab, setPlayerTourTab] = useState<'ALL' | 'ATP' | 'WTA'>('ALL');

  // Map custom-typed sport strings to Sport.OTHER for API queries
  const sportForApi = useMemo(
    () => (Object.values(Sport).includes(sport as Sport) ? (sport as Sport) : Sport.OTHER),
    [sport],
  );

  const competitionsQuery = useCompetitions(sportForApi);
  const teamQueryParams = useMemo(
    () => (sport === Sport.TENNIS
      ? { sport: sportForApi, competition: 'ATP Tour' }
      : (competition ? { sport: sportForApi, competition } : { sport: sportForApi })),
    [competition, sport, sportForApi],
  );
  // Tennis ATP singles rankings pool
  const teamsQuery = useTeams(teamQueryParams);
  // Tennis WTA singles rankings pool
  const wtaTeamsQuery = useTeams(
    { sport: sportForApi, competition: 'WTA Tour' },
    { enabled: sport === Sport.TENNIS },
  );
  // Fallback pool — used only when the competition-scoped query returns nothing (cups, intl comps).
  const allTeamsQuery = useTeams({ sport: sportForApi });
  const marketsQuery = useMarkets(sportForApi);

  const competitionSections = useMemo(() => {
    const comps = (competitionsQuery.data ?? []).map((competition) => (
      sport === Sport.TENNIS
        ? {
          ...competition,
          country: getTennisTournamentCountry(competition.name, competition.country),
          points: competition.points ?? getTennisTournamentPoints(competition.name),
        }
        : competition
    ));

    if (sport === Sport.TENNIS) {
      const countryPoints = new Map<string, number>();
      for (const competition of comps) {
        countryPoints.set(
          competition.country,
          (countryPoints.get(competition.country) ?? 0) + (competition.points ?? 0),
        );
      }

      const sortedCompetitions = [...comps].sort((left, right) => {
        const countryComparison = compareTennisCountries(left.country, right.country, countryPoints);
        if (countryComparison !== 0) {
          return countryComparison;
        }

        return compareTennisCompetitions(left, right);
      });

      const countryMap = new Map<string, typeof sortedCompetitions>();
      for (const competition of sortedCompetitions) {
        if (!countryMap.has(competition.country)) countryMap.set(competition.country, []);
        countryMap.get(competition.country)!.push(competition);
      }

      return Array.from(countryMap.entries()).map(([country, countryCompetitions]) => ({
        title: country,
        country,
        subtitle: `${countryPoints.get(country) ?? 0} pts totais`,
        data: countryCompetitions.map((competition) => ({
          label: competition.name,
          value: competition.name,
          country: competition.country,
          subtitle: competition.points ? `${competition.points} pts` : undefined,
        })),
      }));
    }

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
    // Top-6 football countries fixed first; remaining purely alphabetically
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
  }, [competitionsQuery.data]);

  // Filter competition list to WTA-only when a WTA player is selected, and vice-versa
  const visibleCompetitionSections = useMemo(() => {
    if (sport !== Sport.TENNIS || !playerTour) return competitionSections;
    const isWta = (name: string) =>
      name.includes('WTA') || name === 'Billie Jean King Cup';
    if (playerTour === 'WTA') {
      return competitionSections
        .map((s) => ({ ...s, data: s.data.filter((item) => isWta(item.value)) }))
        .filter((s) => s.data.length > 0);
    }
    // ATP: hide WTA-named competitions
    return competitionSections
      .map((s) => ({ ...s, data: s.data.filter((item) => !isWta(item.value)) }))
      .filter((s) => s.data.length > 0);
  }, [competitionSections, sport, playerTour]);

  // Resolve display label for sport (handles both enum and custom string)
  const sportLabelObj = useMemo(
    () => SPORT_OPTIONS.find((s) => s.key === sport) ?? (sport ? { icon: '🏅', label: sport } : null),
    [sport],
  );

  const teamItems = useMemo(() => {
    if (sport === Sport.TENNIS) return []; // Tennis uses separate ATP/WTA queries below
    const data = teamsQuery.data ?? [];
    // If competition-scoped query finished but returned nothing, fall back to all teams for the sport.
    const source =
      competition && !teamsQuery.isLoading && data.length === 0
        ? (allTeamsQuery.data ?? [])
        : data;
    return source.map((team) => ({
      label: team.displayName ?? team.name,
      value: team.displayName ?? team.name,
      subtitle: undefined as string | undefined,
      imageUrl: team.imageUrl ?? null,
    }));
  }, [competition, sport, teamsQuery.isLoading, teamsQuery.data, allTeamsQuery.data]);

  // ATP player items (tennis only)
  const atpPlayerItems = useMemo(() => {
    if (sport !== Sport.TENNIS) return [];
    return (teamsQuery.data ?? [])
      .filter((team) => !playerCountryFilter || team.country === playerCountryFilter)
      .map((team) => ({
        label: team.displayName ?? team.name,
        value: team.displayName ?? team.name,
        country: team.country ?? undefined,
        subtitle: [team.country, team.rank ? `ATP Nº${team.rank}` : null].filter(Boolean).join(' · ') || undefined,
        imageUrl: team.imageUrl ?? null,
      }));
  }, [sport, teamsQuery.data, playerCountryFilter]);

  // WTA player items (tennis only)
  const wtaPlayerItems = useMemo(() => {
    if (sport !== Sport.TENNIS) return [];
    return (wtaTeamsQuery.data ?? [])
      .filter((team) => !playerCountryFilter || team.country === playerCountryFilter)
      .map((team) => ({
        label: team.displayName ?? team.name,
        value: team.displayName ?? team.name,
        country: team.country ?? undefined,
        subtitle: [team.country, team.rank ? `WTA Nº${team.rank}` : null].filter(Boolean).join(' · ') || undefined,
        imageUrl: team.imageUrl ?? null,
      }));
  }, [sport, wtaTeamsQuery.data, playerCountryFilter]);

  // Player sections shown in SearchableDropdown for tennis
  const playerSections = useMemo(() => {
    if (sport !== Sport.TENNIS) return undefined;
    const sections = [];
    if (playerTourTab !== 'WTA' && atpPlayerItems.length > 0) sections.push({ title: 'ATP', data: atpPlayerItems });
    if (playerTourTab !== 'ATP' && wtaPlayerItems.length > 0) sections.push({ title: 'WTA', data: wtaPlayerItems });
    return sections.length > 0 ? sections : undefined;
  }, [sport, atpPlayerItems, wtaPlayerItems, playerTourTab]);

  const homeExcludedValues = useMemo(
    () => createExcludedValueSet(
      awayTeam,
      sport === Sport.TENNIS && isDoubles ? homeTeam2 : undefined,
      sport === Sport.TENNIS && isDoubles ? awayTeam2 : undefined,
    ),
    [awayTeam, sport, isDoubles, homeTeam2, awayTeam2],
  );

  const awayExcludedValues = useMemo(
    () => createExcludedValueSet(
      homeTeam,
      sport === Sport.TENNIS && isDoubles ? homeTeam2 : undefined,
      sport === Sport.TENNIS && isDoubles ? awayTeam2 : undefined,
    ),
    [homeTeam, sport, isDoubles, homeTeam2, awayTeam2],
  );

  const home2ExcludedValues = useMemo(
    () => createExcludedValueSet(homeTeam, awayTeam, awayTeam2),
    [homeTeam, awayTeam, awayTeam2],
  );

  const away2ExcludedValues = useMemo(
    () => createExcludedValueSet(homeTeam, homeTeam2, awayTeam),
    [homeTeam, homeTeam2, awayTeam],
  );

  const homeTeamItems = useMemo(
    () => filterDropdownItems(teamItems, homeExcludedValues),
    [teamItems, homeExcludedValues],
  );

  const awayTeamItems = useMemo(
    () => filterDropdownItems(teamItems, awayExcludedValues),
    [teamItems, awayExcludedValues],
  );

  const homePlayerSections = useMemo(
    () => filterDropdownSections(playerSections, homeExcludedValues),
    [playerSections, homeExcludedValues],
  );

  const awayPlayerSections = useMemo(
    () => filterDropdownSections(playerSections, awayExcludedValues),
    [playerSections, awayExcludedValues],
  );

  const homePlayerSections2 = useMemo(
    () => filterDropdownSections(playerSections, home2ExcludedValues),
    [playerSections, home2ExcludedValues],
  );

  const awayPlayerSections2 = useMemo(
    () => filterDropdownSections(playerSections, away2ExcludedValues),
    [playerSections, away2ExcludedValues],
  );

  // Set of WTA player values — used to detect tour when a player is selected
  const wtaPlayerValueSet = useMemo(
    () => new Set((wtaTeamsQuery.data ?? []).map((t) => t.displayName ?? t.name)),
    [wtaTeamsQuery.data],
  );

  // Available countries for the player country filter (union of ATP + WTA)
  const availablePlayerCountries = useMemo(() => {
    if (sport !== Sport.TENNIS) return [];
    const countries = new Set([
      ...(teamsQuery.data ?? []).map((t) => t.country),
      ...(wtaTeamsQuery.data ?? []).map((t) => t.country),
    ].filter((c): c is string => Boolean(c)));
    return [...countries].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [sport, teamsQuery.data, wtaTeamsQuery.data]);

  const teamItemsByName = useMemo(() => {
    if (sport === Sport.TENNIS) {
      const allItems = [...atpPlayerItems, ...wtaPlayerItems];
      return new Map(allItems.map((item) => [item.value, item]));
    }
    return new Map(teamItems.map((item) => [item.value, item]));
  }, [sport, teamItems, atpPlayerItems, wtaPlayerItems]);

  const homeTeamItem = teamItemsByName.get(homeTeam);
  const homeTeamItem2 = teamItemsByName.get(homeTeam2);
  const awayTeamItem = teamItemsByName.get(awayTeam);
  const awayTeamItem2 = teamItemsByName.get(awayTeam2);

  const finalHomeTeam = isDoubles && sport === Sport.TENNIS ? `${homeTeam} / ${homeTeam2}` : homeTeam;
  const finalAwayTeam = isDoubles && sport === Sport.TENNIS ? `${awayTeam} / ${awayTeam2}` : awayTeam;

  // True only when every required player/team field is filled.
  // For doubles, all 4 slots must be non-empty before the market can be picked.
  const allPlayersComplete = useMemo(() => {
    if (isDoubles && sport === Sport.TENNIS) {
      return !!homeTeam.trim() && !!homeTeam2.trim() && !!awayTeam.trim() && !!awayTeam2.trim();
    }
    return !!homeTeam.trim() && !!awayTeam.trim();
  }, [homeTeam, homeTeam2, awayTeam, awayTeam2, isDoubles, sport]);

  const marketSections = useMemo(() => {
    const fHome = isDoubles && sport === Sport.TENNIS ? `${homeTeam} / ${homeTeam2}` : homeTeam;
    const fAway = isDoubles && sport === Sport.TENNIS ? `${awayTeam} / ${awayTeam2}` : awayTeam;
    const data = marketsQuery.data ?? [];
    // Group by category
    const grouped = new Map<string, typeof data>();
    for (const m of data) {
      const cat = m.category ?? 'Outro';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(m);
    }
    // Display order: most popular first
    const ORDER = MARKET_CATEGORY_ORDER;
    const sortedCats = [...grouped.keys()].sort(
      (a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)),
    );
    return sortedCats.map((cat) => ({
      title: cat,
      data: (grouped.get(cat) ?? []).map((m) => ({
        label:
          fHome && fAway
            ? humanizeMarket(m.name, fHome, fAway)
            : m.name,
        value: m.name,
      })),
    }));
  }, [marketsQuery.data, homeTeam, homeTeam2, awayTeam, awayTeam2, isDoubles, sport]);

  // sportLabel is now derived above as sportLabelObj; keep alias for compatibility
  const sportLabel = sportLabelObj;

  const handleAdd = useCallback(() => {
    const fHome = isDoubles && sport === Sport.TENNIS ? `${homeTeam.trim()} / ${homeTeam2.trim()}` : homeTeam.trim();
    const fAway = isDoubles && sport === Sport.TENNIS ? `${awayTeam.trim()} / ${awayTeam2.trim()}` : awayTeam.trim();
    const participantValues = isDoubles && sport === Sport.TENNIS
      ? [homeTeam.trim(), homeTeam2.trim(), awayTeam.trim(), awayTeam2.trim()]
      : [homeTeam.trim(), awayTeam.trim()];
    const uniqueParticipantCount = new Set(
      participantValues
        .map((value) => normalizeSelectionValue(value))
        .filter(Boolean),
    ).size;

    if (!homeTeam.trim() || !awayTeam.trim()) {
      showToast('Preenche as duas equipas.', 'error');
      return;
    }
    if (isDoubles && sport === Sport.TENNIS && (!homeTeam2.trim() || !awayTeam2.trim())) {
      showToast('Preenche os 4 jogadores do par.', 'error');
      return;
    }
    if (uniqueParticipantCount !== participantValues.filter((value) => value.trim()).length) {
      showToast(
        sport === Sport.TENNIS
          ? 'Escolhe jogadores diferentes em todos os campos.'
          : 'Escolhe equipas diferentes.',
        'error',
      );
      return;
    }
    if (!market.trim() || !selection.trim()) {
      showToast('Preenche o mercado e a seleção.', 'error');
      return;
    }
    const parsedOdd = parseFloat(oddValue.replace(',', '.'));
    if (!parsedOdd || parsedOdd < 1.01) {
      showToast('Odd inválida (mínimo 1.01).', 'error');
      return;
    }

    const humanized = humanizeMarket(market, fHome, fAway);
    const id = `${fHome}:${fAway}:${competition}:${humanized}:${selection}`;

    // Duplicate detection — check against items in all PENDING boletins
    const normH = fHome.toLowerCase();
    const normA = fAway.toLowerCase();
    const normM = humanized.toLowerCase();
    const duplicate = pendingBoletins.some((b) =>
      b.items.some(
        (i) =>
          i.homeTeam.toLowerCase() === normH &&
          i.awayTeam.toLowerCase() === normA &&
          i.market.toLowerCase() === normM,
      ),
    );
    if (duplicate) {
      showToast('Atenção: já tens uma aposta pendente com esta seleção.', 'info');
    }

    onAdd({
      id,
      homeTeam: fHome,
      homeTeamImageUrl: homeTeamItem?.imageUrl ?? null,
      awayTeam: fAway,
      awayTeamImageUrl: awayTeamItem?.imageUrl ?? null,
      competition: competition.trim() || 'Geral',
      sport: sportForApi,
      market: humanized,
      selection: selection.trim(),
      oddValue: parsedOdd,
    });

    // Reset selection fields but keep sport/competition for rapid multi-entry
    setHomeTeam('');
    setHomeTeam2('');
    setAwayTeam('');
    setAwayTeam2('');
    setIsDoubles(false);
    setMarket('');
    setUseCustomMarket(false);
    setSelection('');
    setOddValue('');
    setPlayerTour(null);
    setPlayerTourTab('ALL');
    Keyboard.dismiss();
    hapticLight();
    showToast('Seleção adicionada.', 'success');
  }, [homeTeam, homeTeam2, homeTeamItem?.imageUrl, awayTeam, awayTeam2, awayTeamItem?.imageUrl, isDoubles, competition, sport, sportForApi, market, selection, oddValue, onAdd, showToast]);

  const rejectDuplicateSelection = useCallback((value: string, excludedValues: Set<string>) => {
    if (!excludedValues.has(normalizeSelectionValue(value))) {
      return true;
    }

    showToast(
      sport === Sport.TENNIS
        ? 'Esse jogador já está selecionado noutro campo.'
        : 'Essa equipa já está selecionada no outro campo.',
      'error',
    );
    return false;
  }, [showToast, sport]);

  // ── Player filter header (tennis only) ──────────────────────────────────────

  const playerSearchHeader = sport === Sport.TENNIS ? (
    <View style={{ paddingBottom: 6, gap: 8 }}>
      {/* ATP / WTA tab row */}
      <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        {(['ALL', 'ATP', 'WTA'] as const).map((tab) => {
          const active = playerTourTab === tab;
          return (
            <PressableScale
              key={tab}
              onPress={() => setPlayerTourTab(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                backgroundColor: active ? colors.primary : colors.surfaceRaised,
                borderRightWidth: tab !== 'WTA' ? 1 : 0,
                borderRightColor: colors.border,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: active ? '#fff' : colors.textSecondary,
                letterSpacing: 0.5,
              }}>
                {tab === 'ALL' ? 'Todos' : tab}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {/* Country dropdown */}
      {availablePlayerCountries.length > 0 && (
        <PressableScale
          onPress={() => setShowCountryPicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: colors.surfaceRaised,
            borderWidth: 1,
            borderColor: playerCountryFilter ? colors.primary : colors.border,
            gap: 8,
          }}
        >
          <Ionicons
            name="flag-outline"
            size={16}
            color={playerCountryFilter ? colors.primary : colors.textMuted}
          />
          <Text style={{
            flex: 1,
            fontSize: 13,
            color: playerCountryFilter ? colors.textPrimary : colors.textMuted,
          }}>
            {playerCountryFilter
              ? `${getCountryFlagEmoji(playerCountryFilter)} ${playerCountryFilter}`
              : 'Filtrar por país'}
          </Text>
          {playerCountryFilter ? (
            <Pressable
              hitSlop={8}
              onPress={(e) => { e.stopPropagation(); setPlayerCountryFilter(null); }}
            >
              <Ionicons color={colors.textMuted} name="close-circle" size={16} />
            </Pressable>
          ) : (
            <Ionicons color={colors.textMuted} name="chevron-down" size={14} />
          )}
        </PressableScale>
      )}
    </View>
  ) : null;

  return (
    <Card style={[styles.addForm, { borderColor: colors.border }]}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Adicionar seleção</Text>

      {/* Sport */}
      <PressableScale onPress={() => setShowSports(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>DESPORTO</Text>
          <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: colors.textPrimary }]}>
            {sportLabel ? `${sportLabel.icon} ${sportLabel.label}` : 'Selecionar'}
          </Text>
        </View>
        {sport !== Sport.FOOTBALL ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              setSport(Sport.FOOTBALL);
              setIsDoubles(false);
              setCompetition('');
              setCompetitionCountry('');
              setHomeTeam('');
              setHomeTeam2('');
              setAwayTeam('');
              setAwayTeam2('');
              setMarket('');
              setSelection('');
              setPlayerTour(null);
              setPlayerTourTab('ALL');
              setPlayerCountryFilter(null);
            }}
          >
            <Ionicons color={colors.textMuted} name="close-circle" size={18} />
          </Pressable>
        ) : (
          <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
        )}
      </PressableScale>

      {/* Competition */}
      <PressableScale onPress={() => setShowCompetitions(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
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
          <Pressable
            hitSlop={8}
            onPress={() => {
              setCompetition('');
              setCompetitionCountry('');
              setHomeTeam('');
              setHomeTeam2('');
              setAwayTeam('');
              setAwayTeam2('');
            }}
          >
            <Ionicons color={colors.textMuted} name="close-circle" size={18} />
          </Pressable>
        ) : (
          <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
        )}
      </PressableScale>

      {/* Doubles toggle — shown only for Tennis */}
      {sport === Sport.TENNIS && (
        <View style={styles.doublesRow}>
          {[{ label: 'Singulares', value: false }, { label: 'Doubles 🎾', value: true }].map((opt) => (
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

      {/* Home Team / Player 1 */}
      <PressableScale onPress={() => setShowHomeTeams(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
            {sport === Sport.TENNIS ? (isDoubles ? 'JOGADOR 1 (PAR CASA)' : 'JOGADOR 1') : 'EQUIPA CASA'}
          </Text>
          <View style={styles.fieldBtnRow}>
            {homeTeam ? (
              <TeamBadge
                imageUrl={homeTeamItem?.imageUrl}
                name={homeTeam}
                size={16}
                variant={sport === Sport.TENNIS ? 'player' : 'team'}
              />
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

      {/* Home Player 2 — doubles only */}
      {isDoubles && sport === Sport.TENNIS && (
        <PressableScale onPress={() => setShowHomeTeams2(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
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

      {/* Away Team / Player 2 */}
      <PressableScale onPress={() => setShowAwayTeams(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
            {sport === Sport.TENNIS ? (isDoubles ? 'JOGADOR 1 (PAR FORA)' : 'JOGADOR 2') : 'EQUIPA FORA'}
          </Text>
          <View style={styles.fieldBtnRow}>
            {awayTeam ? (
              <TeamBadge
                imageUrl={awayTeamItem?.imageUrl}
                name={awayTeam}
                size={16}
                variant={sport === Sport.TENNIS ? 'player' : 'team'}
              />
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

      {/* Away Player 2 — doubles only */}
      {isDoubles && sport === Sport.TENNIS && (
        <PressableScale onPress={() => setShowAwayTeams2(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
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

      {/* Market — only enabled once both teams are selected */}
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
            if (!allPlayersComplete) {
              showToast(
                isDoubles && sport === Sport.TENNIS
                  ? 'Preenche os 4 jogadores primeiro.'
                  : 'Seleciona as duas equipas primeiro.',
                'error',
              );
              return;
            }
            setShowMarkets(true);
          }}
              style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: allPlayersComplete ? 1 : 0.45 }]}
        >
          <View style={styles.fieldBtnInner}>
            <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>MERCADO</Text>
            <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: market ? colors.textPrimary : colors.textMuted }]}>
              {market ? (finalHomeTeam && finalAwayTeam ? humanizeMarket(market, finalHomeTeam, finalAwayTeam) : market) : 'Selecionar mercado'}
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
        onPress={() => {
          setUseCustomMarket((v) => !v);
          setMarket('');
          setSelection('');
        }}
        style={styles.customMarketToggle}
      >
        <Ionicons
          color={colors.primary}
          name={useCustomMarket ? 'list-outline' : 'create-outline'}
          size={13}
        />
        <Text style={[styles.customMarketToggleText, { color: colors.primary }]}>
          {useCustomMarket ? 'Escolher da lista de mercados' : 'Escrever mercado personalizado'}
        </Text>
      </Pressable>

      {/* Odd + optional manual Seleção */}
      <View style={styles.inlineRow}>
        {(useCustomMarket || !isSelfDescribing(market)) && (
          <View style={{ flex: 2 }}>
            <Input
              label="Seleção"
              placeholder="Ex: 1, X, Over 2.5"
              value={selection}
              onChangeText={setSelection}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <NumericInput
            allowDecimal
            label="Odd"
            maxLength={6}
            onChangeText={setOddValue}
            placeholder="1.85"
            value={oddValue}
          />
        </View>
      </View>

      <Button
        variant="secondary"
        title="Adicionar ao boletim"
        onPress={handleAdd}
        leftSlot={<Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
        style={{ borderColor: colors.primary }}
      />

      {/* Modals */}
      <SearchableDropdown
        visible={showSports}
        onClose={() => setShowSports(false)}
        title="Desporto"
        items={SPORT_OPTIONS.map((s) => ({ label: `${s.icon} ${s.label}`, value: s.key }))}
        onSelect={(val) => {
          setSport(val);
          setIsDoubles(false);
          setCompetition('');
          setCompetitionCountry('');
          setHomeTeam('');
          setHomeTeam2('');
          setAwayTeam('');
          setAwayTeam2('');
          setMarket('');
          setSelection('');
          setPlayerTour(null);
          setPlayerTourTab('ALL');
          setPlayerCountryFilter(null);
        }}
        allowCustomValue
      />
      <CompetitionPickerModal
        visible={showCompetitions}
        onClose={() => setShowCompetitions(false)}
        title="Competição"
        sections={visibleCompetitionSections}
        sport={sportForApi}
        preloadWhenHidden
        defaultExpandedCount={sportForApi === Sport.FOOTBALL ? 6 : 10}
        allowCustomValue
        onSelect={(val) => {
          setCompetition(val);
          const found = competitionsQuery.data?.find((c) => c.name === val);
          setCompetitionCountry(found ? getTennisTournamentCountry(found.name, found.country) : '');
          // Clear teams so the user re-picks from the filtered list
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
        items={sport === Sport.TENNIS ? undefined : homeTeamItems}
        sections={sport === Sport.TENNIS ? homePlayerSections : undefined}
        renderItemLeft={(item) => (
          <TeamBadge
            disableRemoteFallback
            imageUrl={item.imageUrl}
            name={item.value}
            size={30}
            variant={sport === Sport.TENNIS ? 'player' : 'team'}
          />
        )}
        onSelect={(val) => {
          if (!rejectDuplicateSelection(val, homeExcludedValues)) return false;
          setHomeTeam(val);
          if (sport === Sport.TENNIS) {
            setPlayerTour(wtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
          }
          return true;
        }}
        isLoading={teamsQuery.isLoading || wtaTeamsQuery.isLoading || (competition !== '' && allTeamsQuery.isLoading)}
        allowCustomValue
        initialVisibleCount={20}
        headerContent={playerSearchHeader}
      />
      <SearchableDropdown
        visible={showAwayTeams}
        onClose={() => setShowAwayTeams(false)}
        title={sport === Sport.TENNIS ? (isDoubles ? 'Jogador 1 (Par Fora)' : 'Jogador 2') : 'Equipa Fora'}
        items={sport === Sport.TENNIS ? undefined : awayTeamItems}
        sections={sport === Sport.TENNIS ? awayPlayerSections : undefined}
        renderItemLeft={(item) => (
          <TeamBadge
            disableRemoteFallback
            imageUrl={item.imageUrl}
            name={item.value}
            size={30}
            variant={sport === Sport.TENNIS ? 'player' : 'team'}
          />
        )}
        onSelect={(val) => {
          if (!rejectDuplicateSelection(val, awayExcludedValues)) return false;
          setAwayTeam(val);
          if (sport === Sport.TENNIS && !homeTeam) {
            setPlayerTour(wtaPlayerValueSet.has(val) ? 'WTA' : 'ATP');
          }
          return true;
        }}
        isLoading={teamsQuery.isLoading || wtaTeamsQuery.isLoading || (competition !== '' && allTeamsQuery.isLoading)}
        allowCustomValue
        initialVisibleCount={20}
        headerContent={playerSearchHeader}
      />
      {isDoubles && sport === Sport.TENNIS && (
        <SearchableDropdown
          visible={showHomeTeams2}
          onClose={() => setShowHomeTeams2(false)}
          title="Jogador 2 (Par Casa)"
          items={undefined}
          sections={homePlayerSections2}
          renderItemLeft={(item) => (
            <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={30} variant="player" />
          )}
          onSelect={(val) => {
            if (!rejectDuplicateSelection(val, home2ExcludedValues)) return false;
            setHomeTeam2(val);
            return true;
          }}
          isLoading={teamsQuery.isLoading || wtaTeamsQuery.isLoading}
          allowCustomValue
          initialVisibleCount={20}
          headerContent={playerSearchHeader}
        />
      )}
      {isDoubles && sport === Sport.TENNIS && (
        <SearchableDropdown
          visible={showAwayTeams2}
          onClose={() => setShowAwayTeams2(false)}
          title="Jogador 2 (Par Fora)"
          items={undefined}
          sections={awayPlayerSections2}
          renderItemLeft={(item) => (
            <TeamBadge disableRemoteFallback imageUrl={item.imageUrl} name={item.value} size={30} variant="player" />
          )}
          onSelect={(val) => {
            if (!rejectDuplicateSelection(val, away2ExcludedValues)) return false;
            setAwayTeam2(val);
            return true;
          }}
          isLoading={teamsQuery.isLoading || wtaTeamsQuery.isLoading}
          allowCustomValue
          initialVisibleCount={20}
          headerContent={playerSearchHeader}
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
      {/* Country picker for tennis player filter */}
      <SearchableDropdown
        visible={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        title="Filtrar por país"
        items={[
          { label: '🌍  Todos os países', value: '__ALL__' },
          ...availablePlayerCountries.map((c) => ({
            label: `${getCountryFlagEmoji(c)}  ${c}`,
            value: c,
          })),
        ]}
        onSelect={(val) => setPlayerCountryFilter(val === '__ALL__' ? null : val)}
      />
    </Card>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function CreateBoletinScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const profileQuery = useMeProfile();

  const items = useBoletinBuilderStore((state) => state.items);
  const stake = useBoletinBuilderStore((state) => state.stake);
  const name = useBoletinBuilderStore((state) => state.name);
  const notes = useBoletinBuilderStore((state) => state.notes);
  const isPublic = useBoletinBuilderStore((state) => state.isPublic);
  const isFreebet = useBoletinBuilderStore((state) => state.isFreebet);
  const siteSlug = useBoletinBuilderStore((state) => state.siteSlug);
  const totalOdds = useBoletinBuilderStore((state) => state.totalOdds);
  const potentialReturn = useBoletinBuilderStore((state) => state.potentialReturn);
  const addItem = useBoletinBuilderStore((state) => state.addItem);
  const removeItem = useBoletinBuilderStore((state) => state.removeItem);
  const setStake = useBoletinBuilderStore((state) => state.setStake);
  const setName = useBoletinBuilderStore((state) => state.setName);
  const setNotes = useBoletinBuilderStore((state) => state.setNotes);
  const setDefaultPublicPreference = useBoletinBuilderStore((state) => state.setDefaultPublicPreference);
  const setPublic = useBoletinBuilderStore((state) => state.setPublic);
  const setFreebet = useBoletinBuilderStore((state) => state.setFreebet);
  const setSiteSlug = useBoletinBuilderStore((state) => state.setSiteSlug);
  const setBetDate = useBoletinBuilderStore((state) => state.setBetDate);
  const betDate = useBoletinBuilderStore((state) => state.betDate);
  const reset = useBoletinBuilderStore((state) => state.reset);
  const save = useBoletinBuilderStore((state) => state.save);

  const [showSites, setShowSites] = useState(false);
  const selectedSiteName = BETTING_SITES.find((s) => s.slug === siteSlug)?.name;

  // Pending boletins used for duplicate bet detection
  const boletinsQuery = useBoletins();
  const pendingBoletins = useMemo(
    () => (boletinsQuery.data ?? []).filter((b) => b.status === BoletinStatus.PENDING),
    [boletinsQuery.data],
  );

  // Cached stats for projections
  const statsQuery = usePersonalStats('all');

  // Confirmation modals
  const [pendingReset, setPendingReset] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    if (profileQuery.data) {
      setDefaultPublicPreference(profileQuery.data.defaultBoletinsPublic ?? false);
    }
  }, [profileQuery.data, setDefaultPublicPreference]);

  // Smart default name based on selections (e.g. "FC Porto vs SL Benfica")
  const defaultName = useMemo(() => {
    if (items.length === 0) return '';
    if (items.length === 1) {
      return `${items[0]!.homeTeam} vs ${items[0]!.awayTeam}`;
    }
    return `${items[0]!.homeTeam} vs ${items[0]!.awayTeam} + ${items.length - 1}`;
  }, [items]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Novo boletim' }} />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Animated.View entering={FadeInUp.duration(160).springify()} style={styles.topRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Construtor</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Cria o teu boletim adicionando seleções.</Text>
              </View>

              <Pressable
                accessibilityLabel="Limpar boletim"
                hitSlop={10}
                onPress={() => {
                  if (items.length > 0) {
                    setPendingReset(true);
                  } else {
                    reset();
                  }
                }}
              >
                <Ionicons color={colors.danger} name="refresh-outline" size={22} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(30).duration(160).springify()}>
              <Text style={[styles.sectionDivider, { color: colors.textSecondary }]}>1. Seleção</Text>
              <AddSelectionForm onAdd={addItem} pendingBoletins={pendingBoletins} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(45).duration(160).springify()}>
              <Text style={[styles.sectionDivider, { color: colors.textSecondary }]}>2. Aposta</Text>
              <OddsCalculator potentialReturn={potentialReturn} stake={stake} totalOdds={totalOdds} />
            </Animated.View>

            {items.length > 0 && statsQuery.data ? (
              <Animated.View entering={FadeInDown.delay(50).duration(160).springify()}>
                <ProjectionCard items={items} stats={statsQuery.data} />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(35).duration(160).springify()}>
              <StakeInput onChange={setStake} value={stake} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(45).duration(160).springify()} style={{ gap: tokens.spacing.lg }}>
              <Text style={[styles.sectionDivider, { color: colors.textSecondary }]}>3. Detalhes</Text>
              <Input label="Nome" onChangeText={setName} placeholder={defaultName || 'Liga Portugal Domingo'} value={name} />
              <Input label="Notas" multiline onChangeText={setNotes} placeholder="Notas opcionais" value={notes} />
              {/* Data da aposta */}
              <DatePickerField
                label="Data da aposta"
                maxDate={new Date()}
                placeholder="DD/MM/AAAA (opcional)"
                value={(() => {
                  if (!betDate || betDate.length < 10) return null;
                  const [dd, mm, yyyy] = betDate.split('/');
                  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                  return isNaN(d.getTime()) ? null : d;
                })()}
                onChange={(date) => {
                  const dd = String(date.getDate()).padStart(2, '0');
                  const mm = String(date.getMonth() + 1).padStart(2, '0');
                  const yyyy = date.getFullYear();
                  setBetDate(`${dd}/${mm}/${yyyy}`);
                }}
                onClear={() => setBetDate('')}
              />
              {/* Site de apostas */}
              <PressableScale
                onPress={() => setShowSites(true)}
                style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <View style={styles.fieldBtnInner}>
                  <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>SITE DE APOSTAS</Text>
                  <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: selectedSiteName ? colors.textPrimary : colors.textMuted }]}>
                    {selectedSiteName ?? 'Selecionar site (opcional)'}
                  </Text>
                </View>
                <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
              </PressableScale>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(45).duration(160).springify()} style={{ gap: tokens.spacing.sm }}>
              <Card style={styles.publicRow}>
                <View style={styles.publicTextWrap}>
                  <Text style={[styles.publicTitle, { color: colors.textPrimary }]}>Tornar boletim público</Text>
                  <Text style={[styles.publicSubtitle, { color: colors.textSecondary }]}>Permite mostrar este boletim no teu perfil e em futuras partilhas.</Text>
                </View>
                <Switch onValueChange={setPublic} value={isPublic} />
              </Card>
              <Card style={styles.publicRow}>
                <View style={styles.publicTextWrap}>
                  <Text style={[styles.publicTitle, { color: colors.textPrimary }]}>Aposta gratuita (freebet)</Text>
                  <Text style={[styles.publicSubtitle, { color: colors.textSecondary }]}>A stake era um freebet — não tens dinheiro real em risco. As tuas estatísticas de lucro/prejuízo serão calculadas em conformidade.</Text>
                </View>
                <Switch
                  onValueChange={setFreebet}
                  trackColor={{ false: undefined, true: '#FFB300' }}
                  value={isFreebet}
                />
              </Card>
            </Animated.View>

            {items.length > 0 ? (
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Seleções ({items.length})
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="layers-triple-outline"
            title="Sem seleções"
            message="Usa o formulário acima para adicionares seleções ao boletim."
          />
        }
        renderItem={({ item }) => (
          <BoletinSelectionRow
            item={{
              homeTeam: item.homeTeam,
              homeTeamImageUrl: item.homeTeamImageUrl,
              awayTeam: item.awayTeam,
              awayTeamImageUrl: item.awayTeamImageUrl,
              competition: item.competition,
              market: item.market,
              oddValue: String(item.oddValue),
              result: ItemResult.PENDING,
              selection: item.selection,
              sport: item.sport,
            }}
            onRemove={() => setRemoveTarget(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Save button */}
      <View style={[styles.footerBar, { paddingBottom: insets.bottom + tokens.spacing.md, paddingHorizontal: tokens.spacing.lg }]}>
        <Button
          disabled={items.length === 0}
          loading={isSaving}
          onPress={async () => {
            try {
              setIsSaving(true);
              const created = await save();
              await queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
              await queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
              hapticSuccess();
              showToast('Boletim criado com sucesso.', 'success');
              router.replace(`/boletins/${created.id}`);
            } catch (error) {
              showToast(getErrorMessage(error), 'error');
            } finally {
              setIsSaving(false);
            }
          }}
          title="Guardar boletim"
          leftSlot={!isSaving ? <Ionicons name="checkmark-circle-outline" size={18} color="#fff" /> : undefined}
        />
      </View>

      {/* Confirmation modals */}
      <ConfirmModal
        visible={pendingReset}
        title="Limpar boletim"
        message="Tens a certeza que queres remover todas as seleções e repor o construtor?"
        confirmLabel="Limpar tudo"
        storageKey="reset-builder"
        onConfirm={() => {
          setPendingReset(false);
          reset();
        }}
        onCancel={() => setPendingReset(false)}
      />
      <ConfirmModal
        visible={removeTarget !== null}
        title="Remover seleção"
        message="Queres remover esta seleção do boletim?"
        confirmLabel="Remover"
        storageKey="remove-selection"
        onConfirm={() => {
          if (removeTarget) removeItem(removeTarget);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Site selector modal */}
      <SearchableDropdown
        visible={showSites}
        onClose={() => setShowSites(false)}
        title="Site de apostas"
        items={BETTING_SITES.map((s) => ({ label: s.name, value: s.slug }))}
        onSelect={(val) => setSiteSlug(val)}
        renderLeft={(slug) => {
          const site = BETTING_SITES.find((s) => s.slug === slug);
          return site?.logo ? (
            <Image source={site.logo} style={styles.siteLogo} />
          ) : (
            <View style={[styles.siteLogoFallback, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.siteLogoFallbackText, { color: colors.textMuted }]}>
                {(site?.name ?? slug).slice(0, 2).toUpperCase()}
              </Text>
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
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

  return 'Não foi possível guardar o boletim.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 18, marginBottom: 18 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 6, paddingRight: 12 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  publicRow: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  publicTextWrap: { flex: 1, gap: 4 },
  publicTitle: { fontSize: 15, fontWeight: '800' },
  publicSubtitle: { fontSize: 13, lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionDivider: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, textTransform: 'uppercase' },
  footerBar: { paddingTop: 12 },
  // Add selection form
  addForm: { gap: 14 },
  formTitle: { fontSize: 16, fontWeight: '800' },
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
  inlineRow: { flexDirection: 'row', gap: 12 },
  impliedSelectionBox: { borderRadius: 10, borderWidth: 1, gap: 3, justifyContent: 'center', minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
  impliedSelectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  impliedSelectionValue: { fontSize: 13, fontWeight: '600' },
  // Searchable dropdown modal
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1, marginTop: 60, paddingHorizontal: 16, paddingTop: 16 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  dropdownRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingVertical: 14 },
  dropdownRowText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sectionHeader: { paddingHorizontal: 4, paddingVertical: 8 },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  customMarketToggle: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  customMarketToggleText: { fontSize: 12, fontWeight: '600' },
  doublesRow: { flexDirection: 'row', gap: 8 },
  doublesBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flex: 1, paddingVertical: 9 },
  doublesBtnText: { fontSize: 13, fontWeight: '600' },
  siteLogo: { borderRadius: 6, height: 28, width: 28 },
  siteLogoFallback: { alignItems: 'center', borderRadius: 6, height: 28, justifyContent: 'center', width: 28 },
  siteLogoFallbackText: { fontSize: 9, fontWeight: '800' },
});