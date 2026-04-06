import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  Modal,
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
  ItemResult,
  Sport,
} from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { CompetitionBadge } from '../../components/ui/CompetitionBadge';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import { BoletinItem as BoletinSelectionRow } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { StakeInput } from '../../components/boletins/StakeInput';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import type { DropdownSection } from '../../components/ui/SearchableDropdown';
import { boletinQueryKeys } from '../../services/boletinService';
import { useCompetitions, useTeams, useMarkets } from '../../services/referenceService';
import { BETTING_SITES, COMPETITION_COUNTRY_ORDER } from '../../utils/sportAssets';
import { isSelfDescribing, humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { useBoletinBuilderStore, type BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';

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

// ─── Add Selection Form ──────────────────────────────────────────────────────
interface AddSelectionFormProps {
  onAdd: (item: BoletinBuilderItem) => void;
}

function AddSelectionForm({ onAdd }: AddSelectionFormProps) {
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();

  const [sport, setSport] = useState<Sport>(Sport.FOOTBALL);
  const [competition, setCompetition] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [market, setMarket] = useState('');
  const [useCustomMarket, setUseCustomMarket] = useState(false);
  const [selection, setSelection] = useState('');

  // Auto-fill selection when the market is self-describing, updating when teams change too
  useEffect(() => {
    if (!useCustomMarket && isSelfDescribing(market)) {
      setSelection(humanizeMarket(market, homeTeam, awayTeam));
    } else if (!useCustomMarket) {
      setSelection('');
    }
  }, [market, homeTeam, awayTeam, useCustomMarket]);
  const [oddValue, setOddValue] = useState('');

  const [showCompetitions, setShowCompetitions] = useState(false);
  const [showHomeTeams, setShowHomeTeams] = useState(false);
  const [showAwayTeams, setShowAwayTeams] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const [showSports, setShowSports] = useState(false);
  const [competitionCountry, setCompetitionCountry] = useState('');

  const competitionsQuery = useCompetitions(sport);
  const teamQueryParams = useMemo(
    () => (sport === Sport.TENNIS
      ? { sport, competition: 'ATP Tour' }
      : (competition ? { sport, competition } : { sport })),
    [competition, sport],
  );
  // Tennis selections should always come from the ATP rankings pool, regardless of tournament.
  const teamsQuery = useTeams(teamQueryParams);
  const allTeamsQuery = useTeams({ sport });
  const marketsQuery = useMarkets(sport);

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
      data: cs.map((c) => ({ label: c.name, value: c.name })),
    }));
    sections.sort((a, b) => {
      const ai = COMPETITION_COUNTRY_ORDER.indexOf(a.country);
      const bi = COMPETITION_COUNTRY_ORDER.indexOf(b.country);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return sections;
  }, [competitionsQuery.data]);

  const teamItems = useMemo(() => {
    const data = teamsQuery.data ?? [];
    // If competition-scoped query finished but returned nothing, fall back to all teams for the sport.
    // Tennis intentionally stays pinned to the ATP rankings pool instead of broad sport fallbacks.
    const source = sport !== Sport.TENNIS && competition && !teamsQuery.isLoading && data.length === 0
      ? (allTeamsQuery.data ?? [])
      : data;
    return source.map((team) => ({
      label: team.displayName ?? team.name,
      value: team.displayName ?? team.name,
      subtitle: sport === Sport.TENNIS && team.country ? team.country : undefined,
      imageUrl: team.imageUrl ?? null,
    }));
  }, [competition, sport, teamsQuery.isLoading, teamsQuery.data, allTeamsQuery.data]);

  const teamItemsByName = useMemo(
    () => new Map(teamItems.map((item) => [item.value, item])),
    [teamItems],
  );

  const homeTeamItem = teamItemsByName.get(homeTeam);
  const awayTeamItem = teamItemsByName.get(awayTeam);

  const marketSections = useMemo(() => {
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
          homeTeam && awayTeam
            ? humanizeMarket(m.name, homeTeam, awayTeam)
            : m.name,
        value: m.name,
      })),
    }));
  }, [marketsQuery.data, homeTeam, awayTeam]);

  const sportLabel = SPORT_OPTIONS.find((s) => s.key === sport);

  const handleAdd = useCallback(() => {
    if (!homeTeam.trim() || !awayTeam.trim()) {
      showToast('Preenche as duas equipas.', 'error');
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

    const humanized = humanizeMarket(market, homeTeam, awayTeam);
    const id = `${homeTeam}:${awayTeam}:${competition}:${humanized}:${selection}`;
    onAdd({
      id,
      homeTeam: homeTeam.trim(),
      homeTeamImageUrl: homeTeamItem?.imageUrl ?? null,
      awayTeam: awayTeam.trim(),
      awayTeamImageUrl: awayTeamItem?.imageUrl ?? null,
      competition: competition.trim() || 'Geral',
      sport,
      // For self-describing markets, store the humanized name so market === selection
      // and BoletinItem can display it just once.
      market: humanized,
      selection: selection.trim(),
      oddValue: parsedOdd,
    });

    // Reset selection fields but keep sport/competition for rapid multi-entry
    setHomeTeam('');
    setAwayTeam('');
    setMarket('');
    setUseCustomMarket(false);
    setSelection('');
    setOddValue('');
    Keyboard.dismiss();
    showToast('Seleção adicionada.', 'success');
  }, [homeTeam, homeTeamItem?.imageUrl, awayTeam, awayTeamItem?.imageUrl, competition, sport, market, selection, oddValue, onAdd, showToast]);

  return (
    <Card style={[styles.addForm, { borderColor: colors.border }]}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Adicionar seleção</Text>

      {/* Sport */}
      <Pressable onPress={() => setShowSports(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>DESPORTO</Text>
          <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: colors.textPrimary }]}>
            {sportLabel ? `${sportLabel.icon} ${sportLabel.label}` : 'Selecionar'}
          </Text>
        </View>
        <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
      </Pressable>

      {/* Competition */}
      <Pressable onPress={() => setShowCompetitions(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>COMPETIÇÃO</Text>
          <View style={styles.fieldBtnRow}>
            {competition ? <CompetitionBadge country={competitionCountry} name={competition} size={16} /> : null}
            <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: competition ? colors.textPrimary : colors.textMuted, flex: 1 }]}>
              {competition || 'Selecionar competição'}
            </Text>
          </View>
        </View>
        <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
      </Pressable>

      {/* Home Team / Player 1 */}
      <Pressable onPress={() => setShowHomeTeams(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
            {sport === Sport.TENNIS ? 'JOGADOR 1' : 'EQUIPA CASA'}
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
        <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
      </Pressable>

      {/* Away Team / Player 2 */}
      <Pressable onPress={() => setShowAwayTeams(true)} style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.fieldBtnInner}>
          <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>
            {sport === Sport.TENNIS ? 'JOGADOR 2' : 'EQUIPA FORA'}
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
        <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
      </Pressable>

      {/* Market — only enabled once both teams are selected */}
      {useCustomMarket ? (
        <Input
          label="Mercado personalizado"
          placeholder="Ex: Treinador demitido, Golos minuto 90..."
          value={market}
          onChangeText={setMarket}
        />
      ) : (
        <Pressable
          onPress={() => {
            if (!homeTeam || !awayTeam) {
              showToast('Seleciona as duas equipas primeiro.', 'error');
              return;
            }
            setShowMarkets(true);
          }}
          style={[styles.fieldBtn, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: homeTeam && awayTeam ? 1 : 0.45 }]}
        >
          <View style={styles.fieldBtnInner}>
            <Text style={[styles.fieldBtnLabel, { color: colors.textSecondary }]}>MERCADO</Text>
            <Text numberOfLines={1} style={[styles.fieldBtnValue, { color: market ? colors.textPrimary : colors.textMuted }]}>
              {market ? (homeTeam && awayTeam ? humanizeMarket(market, homeTeam, awayTeam) : market) : 'Selecionar mercado'}
            </Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
        </Pressable>
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
          color={colors.info}
          name={useCustomMarket ? 'list-outline' : 'create-outline'}
          size={13}
        />
        <Text style={[styles.customMarketToggleText, { color: colors.info }]}>
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
          <Input
            label="Odd"
            placeholder="1.85"
            keyboardType="decimal-pad"
            value={oddValue}
            onChangeText={setOddValue}
          />
        </View>
      </View>

      <Button title="Adicionar ao boletim" onPress={handleAdd} />

      {/* Modals */}
      <SearchableDropdown
        visible={showSports}
        onClose={() => setShowSports(false)}
        title="Desporto"
        items={SPORT_OPTIONS.map((s) => ({ label: `${s.icon} ${s.label}`, value: s.key }))}
        onSelect={(val) => setSport(val as Sport)}
      />
      <SearchableDropdown
        visible={showCompetitions}
        onClose={() => setShowCompetitions(false)}
        title="Competição"
        sections={competitionSections}
        renderItemLeft={(item) => <CompetitionBadge country={item.country} name={item.value} size={22} />}
        onSelect={(val) => {
          setCompetition(val);
          const found = competitionsQuery.data?.find((c) => c.name === val);
          setCompetitionCountry(found ? getTennisTournamentCountry(found.name, found.country) : '');
          // Clear teams so the user re-picks from the filtered list
          setHomeTeam('');
          setAwayTeam('');
        }}
        isLoading={competitionsQuery.isLoading}
      />
      <SearchableDropdown
        visible={showHomeTeams}
        onClose={() => setShowHomeTeams(false)}
        title={sport === Sport.TENNIS ? 'Jogador 1' : 'Equipa Casa'}
        items={teamItems}
        renderItemLeft={(item) => (
          <TeamBadge
            imageUrl={item.imageUrl}
            name={item.value}
            size={30}
            variant={sport === Sport.TENNIS ? 'player' : 'team'}
          />
        )}
        onSelect={setHomeTeam}
        isLoading={teamsQuery.isLoading || (competition !== '' && allTeamsQuery.isLoading)}
        allowCustomValue
      />
      <SearchableDropdown
        visible={showAwayTeams}
        onClose={() => setShowAwayTeams(false)}
        title={sport === Sport.TENNIS ? 'Jogador 2' : 'Equipa Fora'}
        items={teamItems}
        renderItemLeft={(item) => (
          <TeamBadge
            imageUrl={item.imageUrl}
            name={item.value}
            size={30}
            variant={sport === Sport.TENNIS ? 'player' : 'team'}
          />
        )}
        onSelect={setAwayTeam}
        isLoading={teamsQuery.isLoading || (competition !== '' && allTeamsQuery.isLoading)}
        allowCustomValue
      />
      <SearchableDropdown
        visible={showMarkets}
        onClose={() => setShowMarkets(false)}
        title="Mercado"
        sections={marketSections}
        onSelect={setMarket}
        isLoading={marketsQuery.isLoading}
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

  const items = useBoletinBuilderStore((state) => state.items);
  const stake = useBoletinBuilderStore((state) => state.stake);
  const name = useBoletinBuilderStore((state) => state.name);
  const notes = useBoletinBuilderStore((state) => state.notes);
  const isPublic = useBoletinBuilderStore((state) => state.isPublic);
  const siteSlug = useBoletinBuilderStore((state) => state.siteSlug);
  const totalOdds = useBoletinBuilderStore((state) => state.totalOdds);
  const potentialReturn = useBoletinBuilderStore((state) => state.potentialReturn);
  const addItem = useBoletinBuilderStore((state) => state.addItem);
  const removeItem = useBoletinBuilderStore((state) => state.removeItem);
  const setStake = useBoletinBuilderStore((state) => state.setStake);
  const setName = useBoletinBuilderStore((state) => state.setName);
  const setNotes = useBoletinBuilderStore((state) => state.setNotes);
  const setPublic = useBoletinBuilderStore((state) => state.setPublic);
  const setSiteSlug = useBoletinBuilderStore((state) => state.setSiteSlug);
  const setBetDate = useBoletinBuilderStore((state) => state.setBetDate);
  const betDate = useBoletinBuilderStore((state) => state.betDate);
  const reset = useBoletinBuilderStore((state) => state.reset);
  const save = useBoletinBuilderStore((state) => state.save);

  const [showSites, setShowSites] = useState(false);
  const selectedSiteName = BETTING_SITES.find((s) => s.slug === siteSlug)?.name;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ title: 'Novo boletim' }} />
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.topRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Construtor</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Cria o teu boletim adicionando seleções.</Text>
              </View>

              <Pressable hitSlop={10} onPress={reset}>
                <Ionicons color={colors.danger} name="refresh-outline" size={22} />
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <AddSelectionForm onAdd={addItem} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(150).duration(400).springify()}>
              <OddsCalculator potentialReturn={potentialReturn} stake={stake} totalOdds={totalOdds} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <StakeInput onChange={setStake} value={stake} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(250).duration(400).springify()} style={{ gap: tokens.spacing.lg }}>
              <Input label="Nome" onChangeText={setName} placeholder="Liga Portugal Domingo" value={name} />
              <Input label="Notas" multiline onChangeText={setNotes} placeholder="Notas opcionais" value={notes} />
              {/* Data da aposta */}
              <Input
                label="DATA DA APOSTA"
                placeholder="DD/MM/AAAA (opcional)"
                keyboardType="numeric"
                maxLength={10}
                value={betDate}
                onChangeText={(v) => {
                  // Strip non-digits, then re-insert slashes at positions 2 and 4
                  const digits = v.replace(/\D/g, '').slice(0, 8);
                  let formatted = digits;
                  if (digits.length > 4) {
                    formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
                  } else if (digits.length > 2) {
                    formatted = digits.slice(0, 2) + '/' + digits.slice(2);
                  }
                  setBetDate(formatted);
                }}
              />
              {/* Site de apostas */}
              <Pressable
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
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <Card style={styles.publicRow}>
                <View style={styles.publicTextWrap}>
                  <Text style={[styles.publicTitle, { color: colors.textPrimary }]}>Tornar boletim público</Text>
                  <Text style={[styles.publicSubtitle, { color: colors.textSecondary }]}>Permite mostrar este boletim no teu perfil e em futuras partilhas.</Text>
                </View>
                <Switch onValueChange={setPublic} value={isPublic} />
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
            onRemove={() => removeItem(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footerBar, { paddingBottom: insets.bottom + tokens.spacing.md, paddingHorizontal: tokens.spacing.lg }]}>
        <Button
          loading={isSaving}
          onPress={async () => {
            try {
              setIsSaving(true);
              const created = await save();
              await queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
              await queryClient.invalidateQueries({ queryKey: boletinQueryKeys.shared() });
              showToast('Boletim criado com sucesso.', 'success');
              router.replace(`/boletins/${created.id}`);
            } catch (error) {
              showToast(getErrorMessage(error), 'error');
            } finally {
              setIsSaving(false);
            }
          }}
          title="Guardar boletim"
        />
      </View>

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
  footerBar: { bottom: 0, left: 0, position: 'absolute', right: 0 },
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
  siteLogo: { borderRadius: 6, height: 28, width: 28 },
  siteLogoFallback: { alignItems: 'center', borderRadius: 6, height: 28, justifyContent: 'center', width: 28 },
  siteLogoFallbackText: { fontSize: 9, fontWeight: '800' },
});