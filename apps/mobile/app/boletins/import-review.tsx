import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  Animated as RNAnimated,
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
import { scheduleSelectionReminders } from '../../services/notificationService';
import { StatusBadge } from '../../components/boletins/StatusBadge';
import { NumericKeyboard } from '../../components/ui/NumericKeyboard';
import { useMarkets } from '../../services/referenceService';
import { humanizeMarket, MARKET_CATEGORY_ORDER } from '../../utils/marketUtils';
import { getCountryFlagEmoji } from '../../utils/sportAssets';

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

type BoletinStatusEdit = 'PENDING' | 'WON' | 'LOST' | 'VOID';
const BOLETIN_STATUS_CYCLE: BoletinStatusEdit[] = ['PENDING', 'WON', 'LOST', 'VOID'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The AI sees "03:00" on a betting slip and returns "...T03:00:00Z", treating
 * the printed local time as UTC. Re-interpret the UTC components as local time
 * so the stored ISO string is correct for the device's timezone.
 */
function normalizeAIEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(),
  ).toISOString();
}

function formatSelectionDate(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
  } catch {
    return '—';
  }
}

function formatParsedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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
  market: string;
  selection: string;
  oddValue: string;
  eventDate?: string;
}

function buildEditKey(boletinIdx: number, itemIdx: number): string {
  return `${boletinIdx}-${itemIdx}`;
}

// ─── Numeric keyboard focus state ────────────────────────────────────────────

type NumericFocusTarget =
  | { kind: 'odd'; boletinIdx: number; itemIdx: number }
  | { kind: 'stake'; boletinIdx: number }
  | null;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ImportReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ data: string; siteSlug?: string }>();
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
          market: item.market || '',
          selection: item.selection || '',
          oddValue: item.oddValue != null ? String(item.oddValue) : '',
          eventDate: item.eventDate ? normalizeAIEventDate(item.eventDate) : undefined,
        });
      });
    });
    return initial;
  });

  // Per-boletin stake edits
  const [stakeEdits, setStakeEdits] = useState<Map<number, string>>(() => {
    const initial = new Map<number, string>();
    boletins.forEach((b, bi) => {
      if (b.stake != null) initial.set(bi, String(b.stake));
    });
    return initial;
  });

  // Per-boletin betDate edits
  const [betDateEdits, setBetDateEdits] = useState<Map<number, string>>(new Map());

  // Per-boletin status overrides
  const [boletinStatusEdits, setBoletinStatusEdits] = useState<Map<number, BoletinStatusEdit>>(new Map());

  // Per-item result overrides — seeded from AI parse, fully user-editable
  type ItemResult = 'WON' | 'LOST' | 'VOID' | 'PENDING';
  const RESULT_CYCLE: ItemResult[] = ['PENDING', 'WON', 'LOST', 'VOID'];
  const [itemResults, setItemResults] = useState<Map<string, ItemResult>>(() => {
    const initial = new Map<string, ItemResult>();
    boletins.forEach((b, bi) => {
      b.items.forEach((item, ii) => {
        const r = item.result as ItemResult | undefined;
        if (r && RESULT_CYCLE.includes(r)) {
          initial.set(buildEditKey(bi, ii), r);
        }
      });
    });
    return initial;
  });

  // ── Custom numeric keyboard state ──────────────────────────────────────────
  const [numericFocus, setNumericFocus] = useState<NumericFocusTarget>(null);

  const numericKeyboardValue = useMemo(() => {
    if (!numericFocus) return '';
    if (numericFocus.kind === 'stake') {
      return stakeEdits.get(numericFocus.boletinIdx) ?? '';
    }
    const edits = itemEdits.get(buildEditKey(numericFocus.boletinIdx, numericFocus.itemIdx));
    return edits?.oddValue ?? '';
  }, [numericFocus, stakeEdits, itemEdits]);

  const handleNumericChange = useCallback(
    (text: string) => {
      if (!numericFocus) return;
      if (numericFocus.kind === 'stake') {
        setStakeEdits((prev) => {
          const next = new Map(prev);
          next.set(numericFocus.boletinIdx, text);
          return next;
        });
      } else {
        setItemEdits((prev) => {
          const next = new Map(prev);
          const key = buildEditKey(numericFocus.boletinIdx, numericFocus.itemIdx);
          const existing = next.get(key);
          if (existing) next.set(key, { ...existing, oddValue: text });
          return next;
        });
      }
    },
    [numericFocus],
  );

  const dismissNumericKeyboard = useCallback(() => setNumericFocus(null), []);

  // ── Pickers ────────────────────────────────────────────────────────────────
  const getItemResult = useCallback(
    (boletinIdx: number, itemIdx: number, fallback: string): ItemResult => {
      return (
        itemResults.get(buildEditKey(boletinIdx, itemIdx)) ??
        ((fallback as ItemResult) ?? 'PENDING')
      );
    },
    [itemResults],
  );

  const cycleItemResult = useCallback(
    (boletinIdx: number, itemIdx: number, currentResult: ItemResult) => {
      const next =
        RESULT_CYCLE[
          (RESULT_CYCLE.indexOf(currentResult) + 1) % RESULT_CYCLE.length
        ]!;
      setItemResults((prev) => {
        const next2 = new Map(prev);
        next2.set(buildEditKey(boletinIdx, itemIdx), next);
        return next2;
      });
    },
    [],
  );

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

  // Date picker modal state — supports selection-level and boletin-level dates
  type DatePickerTarget =
    | { kind: 'selection'; boletinIdx: number; itemIdx: number }
    | { kind: 'boletin'; boletinIdx: number };
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget | null>(null);
  const [dateDraft, setDateDraft] = useState({ day: '', month: '', year: '', hour: '', minute: '' });

  // Tennis player dropdown state (shared across home/away picker)
  const [playerTourTab, setPlayerTourTab] = useState<'ALL' | 'ATP' | 'WTA'>('ALL');
  const [playerCountryFilter, setPlayerCountryFilter] = useState<string | null>(null);
  const [showCountryPickerForTeam, setShowCountryPickerForTeam] = useState(false);

  // Market picker modal state
  const [marketPickerTarget, setMarketPickerTarget] = useState<{
    boletinIdx: number;
    itemIdx: number;
  } | null>(null);

  const getItemEdit = useCallback(
    (boletinIdx: number, itemIdx: number): ItemEdits => {
      return (
        itemEdits.get(buildEditKey(boletinIdx, itemIdx)) ?? {
          sport: 'FOOTBALL',
          competition: '',
          homeTeam: '',
          awayTeam: '',
          homeTeamImageUrl: null,
          awayTeamImageUrl: null,
          market: '',
          selection: '',
          oddValue: '',
          eventDate: undefined,
        }
      );
    },
    [itemEdits],
  );

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

  const atpTeamsQuery = useTeams(
    { sport: Sport.TENNIS, competition: 'ATP Tour' },
    { enabled: teamPickerTarget !== null && teamPickerSport === Sport.TENNIS },
  );

  const wtaTeamsQuery = useTeams(
    { sport: Sport.TENNIS, competition: 'WTA Tour' },
    { enabled: teamPickerTarget !== null && teamPickerSport === Sport.TENNIS },
  );

  // Always-loaded ATP/WTA data for auto-resolving player photos after AI parse
  const atpLookupQuery = useTeams({ sport: Sport.TENNIS, competition: 'ATP Tour' });
  const wtaLookupQuery = useTeams({ sport: Sport.TENNIS, competition: 'WTA Tour' });

  const tennisPhotoLookup = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of [...(atpLookupQuery.data ?? []), ...(wtaLookupQuery.data ?? [])]) {
      const name = t.displayName ?? t.name;
      if (name) map.set(name.toLowerCase(), t.imageUrl ?? null);
    }
    return map;
  }, [atpLookupQuery.data, wtaLookupQuery.data]);

  useEffect(() => {
    if (tennisPhotoLookup.size === 0) return;
    setItemEdits((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [key, edits] of next.entries()) {
        if (edits.sport !== 'TENNIS') continue;
        const newHome = edits.homeTeamImageUrl ?? tennisPhotoLookup.get(edits.homeTeam.toLowerCase()) ?? null;
        const newAway = edits.awayTeamImageUrl ?? tennisPhotoLookup.get(edits.awayTeam.toLowerCase()) ?? null;
        if (newHome !== edits.homeTeamImageUrl || newAway !== edits.awayTeamImageUrl) {
          next.set(key, { ...edits, homeTeamImageUrl: newHome, awayTeamImageUrl: newAway });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tennisPhotoLookup]);

  const teamPickerItems = useMemo(() => {
    if (teamPickerSport === Sport.TENNIS) return [];
    const data = teamsQuery.data ?? [];
    const source =
      teamPickerCompetition && !teamsQuery.isLoading && data.length === 0
        ? allTeamsQuery.data ?? []
        : data;
    const seen = new Set<string>();
    return source
      .map((team) => ({
        label: team.displayName ?? team.name,
        value: team.displayName ?? team.name,
        imageUrl: team.imageUrl ?? null,
      }))
      .filter((item) => {
        if (seen.has(item.value)) return false;
        seen.add(item.value);
        return true;
      });
  }, [teamPickerSport, teamPickerCompetition, teamsQuery.isLoading, teamsQuery.data, allTeamsQuery.data]);

  const playerSections = useMemo(() => {
    if (teamPickerSport !== Sport.TENNIS) return undefined;
    const atpItems = (atpTeamsQuery.data ?? [])
      .filter((t) => !playerCountryFilter || t.country === playerCountryFilter)
      .map((t) => ({
        label: t.displayName ?? t.name,
        value: t.displayName ?? t.name,
        imageUrl: t.imageUrl ?? null,
        country: t.country ?? undefined,
        subtitle: [t.country, t.rank ? `ATP Nº${t.rank}` : null].filter(Boolean).join(' · ') || undefined,
      }));
    const wtaItems = (wtaTeamsQuery.data ?? [])
      .filter((t) => !playerCountryFilter || t.country === playerCountryFilter)
      .map((t) => ({
        label: t.displayName ?? t.name,
        value: t.displayName ?? t.name,
        imageUrl: t.imageUrl ?? null,
        country: t.country ?? undefined,
        subtitle: [t.country, t.rank ? `WTA Nº${t.rank}` : null].filter(Boolean).join(' · ') || undefined,
      }));
    const sections = [];
    if (playerTourTab !== 'WTA' && atpItems.length > 0) sections.push({ title: 'ATP', data: atpItems });
    if (playerTourTab !== 'ATP' && wtaItems.length > 0) sections.push({ title: 'WTA', data: wtaItems });
    return sections.length > 0 ? sections : undefined;
  }, [teamPickerSport, atpTeamsQuery.data, wtaTeamsQuery.data, playerTourTab, playerCountryFilter]);

  const availablePlayerCountries = useMemo(() => {
    if (teamPickerSport !== Sport.TENNIS) return [];
    const countries = new Set([
      ...(atpTeamsQuery.data ?? []).map((t) => t.country),
      ...(wtaTeamsQuery.data ?? []).map((t) => t.country),
    ].filter((c): c is string => Boolean(c)));
    return [...countries].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [teamPickerSport, atpTeamsQuery.data, wtaTeamsQuery.data]);

  // Player search header (tabs + country filter) — mirrors create.tsx
  const playerSearchHeader = teamPickerSport === Sport.TENNIS ? (
    <View style={{ paddingBottom: 6, gap: 8 }}>
      <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#444' }}>
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
                backgroundColor: active ? '#00C851' : '#2A2A2A',
                borderRightWidth: tab !== 'WTA' ? 1 : 0,
                borderRightColor: '#444',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#888', letterSpacing: 0.5 }}>
                {tab === 'ALL' ? 'Todos' : tab}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {availablePlayerCountries.length > 0 && (
        <PressableScale
          onPress={() => setShowCountryPickerForTeam(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: '#2A2A2A',
            borderWidth: 1,
            borderColor: playerCountryFilter ? '#00C851' : '#444',
            gap: 8,
          }}
        >
          <Ionicons name="flag-outline" size={16} color={playerCountryFilter ? '#00C851' : '#888'} />
          <Text style={{ flex: 1, fontSize: 13, color: playerCountryFilter ? '#fff' : '#888' }}>
            {playerCountryFilter ? `${getCountryFlagEmoji(playerCountryFilter)} ${playerCountryFilter}` : 'Filtrar por país'}
          </Text>
          {playerCountryFilter ? (
            <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setPlayerCountryFilter(null); }}>
              <Ionicons name="close-circle" size={16} color="#888" />
            </Pressable>
          ) : (
            <Ionicons name="chevron-down" size={14} color="#888" />
          )}
        </PressableScale>
      )}
    </View>
  ) : null;

  // Reset tennis filter state when picker opens for a new target
  useEffect(() => {
    if (teamPickerTarget) {
      setPlayerTourTab('ALL');
      setPlayerCountryFilter(null);
    }
  }, [teamPickerTarget?.boletinIdx, teamPickerTarget?.itemIdx, teamPickerTarget?.side]);

  // Reference data for competition picker — filtered by sport of the target item
  const competitionPickerSport = useMemo(() => {
    if (!competitionPickerTarget) return undefined;
    const edits = getItemEdit(
      competitionPickerTarget.boletinIdx,
      competitionPickerTarget.itemIdx,
    );
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

  const marketPickerSport = useMemo(() => {
    if (!marketPickerTarget) return undefined;
    const edits = getItemEdit(marketPickerTarget.boletinIdx, marketPickerTarget.itemIdx);
    return (edits.sport as Sport) || Sport.FOOTBALL;
  }, [marketPickerTarget, getItemEdit]);

  const marketsQuery = useMarkets(marketPickerSport);

  const marketSections = useMemo(() => {
    const edits = marketPickerTarget
      ? getItemEdit(marketPickerTarget.boletinIdx, marketPickerTarget.itemIdx)
      : null;
    const fHome = edits?.homeTeam ?? '';
    const fAway = edits?.awayTeam ?? '';
    const data = marketsQuery.data ?? [];
    const grouped = new Map<string, typeof data>();
    for (const m of data) {
      const cat = m.category ?? 'Outro';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(m);
    }
    const ORDER = MARKET_CATEGORY_ORDER;
    const sortedCats = [...grouped.keys()].sort(
      (a, b) =>
        (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) -
        (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)),
    );
    return sortedCats.map((cat) => ({
      title: cat,
      data: (grouped.get(cat) ?? []).map((m) => ({
        label: fHome && fAway ? humanizeMarket(m.name, fHome, fAway) : m.name,
        value: m.name,
      })),
    }));
  }, [marketsQuery.data, marketPickerTarget, getItemEdit]);

  const updateItemEdit = useCallback(
    (boletinIdx: number, itemIdx: number, patch: Partial<ItemEdits>) => {
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
          market: '',
          selection: '',
          oddValue: '',
          eventDate: undefined,
        };
        next.set(key, { ...existing, ...patch });
        return next;
      });
    },
    [],
  );

  function parseDateForPicker(iso: string): { day: number; month: number; year: number; hour: number; minute: number } {
    const d = new Date(iso);
    return {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }

  const openSelectionDatePicker = useCallback(
    (boletinIdx: number, itemIdx: number, currentDate?: string) => {
      const parts = currentDate ? parseDateForPicker(currentDate) : (() => {
        const p = parseDateForPicker(new Date().toISOString());
        return p;
      })();
      setDateDraft({
        day: String(parts.day).padStart(2, '0'),
        month: String(parts.month).padStart(2, '0'),
        year: String(parts.year),
        hour: String(parts.hour).padStart(2, '0'),
        minute: String(parts.minute).padStart(2, '0'),
      });
      setDatePickerTarget({ kind: 'selection', boletinIdx, itemIdx });
    },
    [],
  );

  const openBoletinDatePicker = useCallback(
    (boletinIdx: number, currentDate?: string) => {
      const parts = currentDate
        ? parseDateForPicker(currentDate)
        : parseDateForPicker(new Date().toISOString());
      setDateDraft({
        day: String(parts.day).padStart(2, '0'),
        month: String(parts.month).padStart(2, '0'),
        year: String(parts.year),
        hour: String(parts.hour).padStart(2, '0'),
        minute: String(parts.minute).padStart(2, '0'),
      });
      setDatePickerTarget({ kind: 'boletin', boletinIdx });
    },
    [],
  );

  const confirmDatePicker = useCallback(() => {
    if (!datePickerTarget) return;
    const { day, month, year, hour, minute } = dateDraft;
    const d = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
    );
    if (!isNaN(d.getTime())) {
      if (datePickerTarget.kind === 'selection') {
        updateItemEdit(datePickerTarget.boletinIdx, datePickerTarget.itemIdx, {
          eventDate: d.toISOString(),
        });
      } else {
        setBetDateEdits((prev) => {
          const next = new Map(prev);
          next.set(datePickerTarget.boletinIdx, d.toISOString());
          return next;
        });
      }
    }
    setDatePickerTarget(null);
  }, [datePickerTarget, dateDraft, updateItemEdit]);

  const selectedCount = selected.size;
  const errorCount = boletins.filter((b) => b.parseError).length;
  const duplicateCount = 0;

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
      .map((b) => {
        const boletinIdx = boletins.indexOf(b);
        const stakeOverride = stakeEdits.get(boletinIdx);
        return {
          ...b,
          stake: stakeOverride ? parseFloat(stakeOverride.replace(',', '.')) || b.stake : b.stake,
          betDate: betDateEdits.get(boletinIdx) ?? b.betDate,
          status: boletinStatusEdits.get(boletinIdx) ?? b.status,
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
              market: edits.market || item.market,
              selection: edits.selection || item.selection,
              oddValue: edits.oddValue
                ? parseFloat(edits.oddValue.replace(',', '.'))
                : item.oddValue,
              result: getItemResult(boletinIdx, itemIdx, item.result ?? 'PENDING'),
              eventDate: edits.eventDate ?? item.eventDate,
            };
          }),
        };
      });

    try {
      const result = await bulkImportMutation.mutateAsync({ boletins: selectedBoletins, source: params.siteSlug ?? 'betclic' });

      if (result.imported === 0 && result.duplicates > 0) {
        showToast('Todas as apostas já tinham sido importadas anteriormente', 'info');
        router.dismiss();
        return;
      }

      if (result.imported === 0 && result.errors > 0) {
        const detail = result.errorDetails?.[0];
        showToast(detail ?? 'Erro ao importar. Verifica os dados e tenta novamente.', 'error');
        return;
      }

      showToast(`${result.imported} boletins importados com sucesso 🎉`, 'success');

      // Schedule kickoff reminders for newly imported PENDING boletins
      if (result.createdBoletins) {
        for (const boletin of result.createdBoletins) {
          const itemsWithKickoff = boletin.items
            .filter((item) => item.kickoffAt != null)
            .map((item) => ({ id: item.id, eventDate: item.kickoffAt! }));
          if (itemsWithKickoff.length > 0) {
            scheduleSelectionReminders(boletin.id, itemsWithKickoff, boletin.name).catch(() => {});
          }
        }
      }

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
        ).catch(() => {});
      }

      router.dismiss();
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Erro de ligação. Tenta novamente';
      showToast(msg, 'error');
    }
  }, [
    selectedCount,
    boletins,
    selected,
    stakeEdits,
    betDateEdits,
    boletinStatusEdits,
    bulkImportMutation,
    router,
    showToast,
    shakeX,
    getItemEdit,
    getItemResult,
  ]);

  // ── Render item ────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item, index }: { item: ParsedBetclicBoletin; index: number }) => {
      const isSelected = selected.has(index);
      const isExpanded = expanded.has(index);
      const firstItem = item.items[0];
      const firstEdits = firstItem ? getItemEdit(index, 0) : null;
      const stakeDisplay = stakeEdits.get(index) ?? String(item.stake ?? '');

      return (
        <Pressable onPress={dismissNumericKeyboard} style={{ flex: 1 }}>
          <Card
            style={[
              styles.betCard,
              !isSelected && styles.betCardDeselected,
              {
                borderLeftColor: isSelected
                  ? item.parseError
                    ? colors.warning
                    : colors.primary
                  : colors.border,
              },
            ]}
          >
            {/* Header: checkbox + date + status — all tappable */}
            <View style={styles.betCardHeader}>
              <Pressable hitSlop={10} onPress={() => toggleItem(index)}>
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
              </Pressable>
              <PressableScale
                scaleDown={0.96}
                onPress={() => openBoletinDatePicker(index, betDateEdits.get(index) ?? item.betDate)}
                style={styles.betCardDateBtn}
              >
                <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                <Text
                  style={[styles.betCardDate, { color: betDateEdits.has(index) ? colors.primary : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {formatParsedDate(betDateEdits.get(index) ?? item.betDate)}
                </Text>
                <Ionicons name="pencil" size={9} color={colors.primary} />
              </PressableScale>
              <View style={styles.betCardBadges}>
                {item.parseError && <Badge label="Erro" variant="warning" />}
                <PressableScale
                  scaleDown={0.94}
                  onPress={() => {
                    const current = (boletinStatusEdits.get(index) ?? item.status) as BoletinStatusEdit;
                    const next = BOLETIN_STATUS_CYCLE[(BOLETIN_STATUS_CYCLE.indexOf(current) + 1) % BOLETIN_STATUS_CYCLE.length]!;
                    setBoletinStatusEdits((prev) => {
                      const m = new Map(prev);
                      m.set(index, next);
                      return m;
                    });
                  }}
                >
                  <StatusBadge status={(boletinStatusEdits.get(index) ?? item.status) as BoletinStatus} />
                </PressableScale>
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
                  <Text
                    style={[styles.betCardTeams, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {firstItem.homeTeam}
                  </Text>
                  {(firstEdits?.awayTeam ||
                    (firstItem.awayTeam && firstItem.awayTeam !== 'Desconhecido')) && (
                    <>
                      <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
                      <TeamBadge
                        name={firstEdits?.awayTeam || firstItem.awayTeam}
                        imageUrl={firstEdits?.awayTeamImageUrl}
                        size={20}
                        variant={firstEdits?.sport === 'TENNIS' ? 'player' : 'team'}
                      />
                      <Text
                        style={[styles.betCardTeams, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {firstEdits?.awayTeam || firstItem.awayTeam}
                      </Text>
                    </>
                  )}
                </View>
                {item.items.length > 1 && (
                  <Text style={[styles.betCardMore, { color: colors.textMuted }]}>
                    + {item.items.length - 1}{' '}
                    {item.items.length === 2 ? 'seleção' : 'seleções'}
                  </Text>
                )}
              </View>
            )}

            {firstItem && (
              <View style={styles.betCardMeta}>
                <Text style={{ fontSize: 14 }}>
                  {getSportIcon(firstEdits?.sport ?? 'FOOTBALL')}{' '}
                </Text>
                <Text
                  style={[styles.betCardMetaText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {firstItem.market} • {firstItem.selection}
                </Text>
              </View>
            )}

            {/* Stake / Odds / Return row */}
            <View style={styles.betCardMetrics}>
              {/* Stake — tappable to open numeric keyboard */}
              <Pressable
                style={styles.betCardMetricItem}
                onPress={() => {
                  setNumericFocus({ kind: 'stake', boletinIdx: index });
                }}
              >
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Stake</Text>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color:
                        numericFocus?.kind === 'stake' &&
                        numericFocus.boletinIdx === index
                          ? colors.primary
                          : colors.textPrimary,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {stakeDisplay ? formatCurrency(parseFloat(stakeDisplay.replace(',', '.'))) : formatCurrency(item.stake)}
                </Text>
              </Pressable>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Odds</Text>
                <Text
                  style={[styles.metricValue, { color: colors.gold }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatOdds(item.totalOdds)}
                </Text>
              </View>
              <View style={styles.betCardMetricItem}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                  {item.status === BoletinStatus.LOST ? 'Perdas' : 'Retorno'}
                </Text>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color:
                        item.status === BoletinStatus.LOST
                          ? colors.danger
                          : colors.primary,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {item.status === BoletinStatus.LOST
                    ? `-${formatCurrency(item.stake)}`
                    : formatCurrency(item.potentialReturn)}
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
                style={[
                  styles.detailsButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceRaised,
                  },
                ]}
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
                  const isOddFocused =
                    numericFocus?.kind === 'odd' &&
                    numericFocus.boletinIdx === index &&
                    numericFocus.itemIdx === selectionIndex;

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
                            <View
                              style={[
                                styles.matchNumberPill,
                                { backgroundColor: colors.primary + '20' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.matchNumberText,
                                  { color: colors.primary },
                                ]}
                              >
                                Jogo {selectionIndex + 1}
                              </Text>
                            </View>
                          )}
                          <PressableScale
                            scaleDown={0.96}
                            onPress={() => openSelectionDatePicker(index, selectionIndex, edits.eventDate ?? selectionItem.eventDate)}
                            style={[
                              styles.matchDatePill,
                              { backgroundColor: colors.surfaceRaised },
                            ]}
                          >
                            <Ionicons
                              name="time-outline"
                              size={11}
                              color={colors.textMuted}
                            />
                            <Text
                              style={[
                                styles.matchDateText,
                                { color: edits.eventDate ? colors.primary : colors.textMuted },
                              ]}
                            >
                              {(edits.eventDate ?? selectionItem.eventDate)
                                ? formatSelectionDate(edits.eventDate ?? selectionItem.eventDate!)
                                : 'Definir data'}
                            </Text>
                            <Ionicons name="pencil" size={9} color={colors.primary} />
                          </PressableScale>
                        </View>
                        <Pressable
                          hitSlop={10}
                          onPress={() => {
                            const current = getItemResult(
                              index,
                              selectionIndex,
                              selectionItem.result ?? item.status,
                            );
                            cycleItemResult(index, selectionIndex, current);
                          }}
                        >
                          <StatusBadge
                            status={
                              getItemResult(
                                index,
                                selectionIndex,
                                selectionItem.result ?? item.status,
                              ) as BoletinStatus
                            }
                          />
                          <Text
                            style={[
                              styles.tapToChangeTip,
                              { color: colors.textMuted },
                            ]}
                          >
                            toca para alterar
                          </Text>
                        </Pressable>
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
                          <Text
                            style={[
                              styles.matchTeamName,
                              { color: colors.textPrimary },
                            ]}
                            numberOfLines={2}
                          >
                            {selectionItem.homeTeam}
                          </Text>
                        </View>
                        <View style={styles.matchVsContainer}>
                          <Text style={[styles.matchVs, { color: colors.textMuted }]}>
                            vs
                          </Text>
                          <Text style={[styles.matchOdd, { color: colors.gold }]}>
                            @{' '}
                            {formatOdds(
                              edits.oddValue
                                ? parseFloat(edits.oddValue.replace(',', '.'))
                                : selectionItem.oddValue,
                            )}
                          </Text>
                        </View>
                        <View style={styles.matchTeamSide}>
                          <TeamBadge
                            name={edits.awayTeam || '?'}
                            imageUrl={edits.awayTeamImageUrl}
                            size={28}
                            variant={edits.sport === 'TENNIS' ? 'player' : 'team'}
                          />
                          <Text
                            style={[
                              styles.matchTeamName,
                              {
                                color: edits.awayTeam
                                  ? colors.textPrimary
                                  : colors.textMuted,
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {edits.awayTeam || 'Adversário'}
                          </Text>
                        </View>
                      </View>

                      {/* ── Editable fields — same order as create screen ── */}
                      <View style={styles.editFieldsContainer}>

                        {/* 1. Sport */}
                        <View
                          style={[
                            styles.editField,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>
                            DESPORTO
                          </Text>
                          <View style={styles.editFieldValue}>
                            <PressableScale
                              scaleDown={0.97}
                              onPress={() =>
                                setSportPickerTarget({
                                  boletinIdx: index,
                                  itemIdx: selectionIndex,
                                })
                              }
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                flex: 1,
                              }}
                            >
                              <Text style={{ fontSize: 14 }}>
                                {getSportIcon(edits.sport)}
                              </Text>
                              <Text
                                style={[
                                  styles.editFieldValueText,
                                  { color: colors.textPrimary },
                                ]}
                              >
                                {SPORT_OPTIONS.find((o) => o.key === edits.sport)?.label ??
                                  edits.sport}
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.textMuted}
                              />
                            </PressableScale>
                            {edits.sport && edits.sport !== Sport.FOOTBALL && (
                              <Pressable
                                hitSlop={8}
                                onPress={() =>
                                  updateItemEdit(index, selectionIndex, {
                                    sport: Sport.FOOTBALL,
                                  })
                                }
                              >
                                <Ionicons
                                  name="close-circle"
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </Pressable>
                            )}
                          </View>
                        </View>

                        {/* 2. Competition */}
                        <View
                          style={[
                            styles.editField,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>
                            COMPETIÇÃO
                          </Text>
                          <View style={styles.editFieldValue}>
                            <PressableScale
                              scaleDown={0.97}
                              onPress={() =>
                                setCompetitionPickerTarget({
                                  boletinIdx: index,
                                  itemIdx: selectionIndex,
                                })
                              }
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                flex: 1,
                              }}
                            >
                              {edits.competition ? (
                                <>
                                  <CompetitionBadge name={edits.competition} size={16} />
                                  <Text
                                    style={[
                                      styles.editFieldValueText,
                                      { color: colors.textPrimary },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {edits.competition}
                                  </Text>
                                </>
                              ) : (
                                <Text
                                  style={[
                                    styles.editFieldValueText,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  Escolher competição...
                                </Text>
                              )}
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.textMuted}
                              />
                            </PressableScale>
                            {edits.competition ? (
                              <Pressable
                                hitSlop={8}
                                onPress={() =>
                                  updateItemEdit(index, selectionIndex, {
                                    competition: '',
                                  })
                                }
                              >
                                <Ionicons
                                  name="close-circle"
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>

                        {/* 3. Home team */}
                        <PressableScale
                          scaleDown={0.97}
                          onPress={() =>
                            setTeamPickerTarget({
                              boletinIdx: index,
                              itemIdx: selectionIndex,
                              side: 'home',
                            })
                          }
                          style={[
                            styles.editField,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>
                            {edits.sport === 'TENNIS' ? 'JOGADOR 1' : 'EQUIPA CASA'}
                          </Text>
                          <View style={styles.editFieldValue}>
                            {edits.homeTeam ? (
                              <TeamBadge
                                name={edits.homeTeam}
                                imageUrl={edits.homeTeamImageUrl}
                                size={16}
                                variant={
                                  edits.sport === 'TENNIS' ? 'player' : 'team'
                                }
                              />
                            ) : null}
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.editFieldValueText,
                                {
                                  color: edits.homeTeam
                                    ? colors.textPrimary
                                    : colors.textMuted,
                                },
                              ]}
                            >
                              {edits.homeTeam ||
                                (edits.sport === 'TENNIS'
                                  ? 'Selecionar jogador...'
                                  : 'Selecionar equipa...')}
                            </Text>
                            {edits.homeTeam ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  updateItemEdit(index, selectionIndex, {
                                    homeTeam: '',
                                    homeTeamImageUrl: null,
                                  });
                                }}
                              >
                                <Ionicons
                                  name="close-circle"
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </Pressable>
                            ) : (
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.textMuted}
                              />
                            )}
                          </View>
                        </PressableScale>

                        {/* 4. Away team */}
                        <PressableScale
                          scaleDown={0.97}
                          onPress={() =>
                            setTeamPickerTarget({
                              boletinIdx: index,
                              itemIdx: selectionIndex,
                              side: 'away',
                            })
                          }
                          style={[
                            styles.editField,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>
                            {edits.sport === 'TENNIS' ? 'JOGADOR 2' : 'EQUIPA FORA'}
                          </Text>
                          <View style={styles.editFieldValue}>
                            {edits.awayTeam ? (
                              <TeamBadge
                                name={edits.awayTeam}
                                imageUrl={edits.awayTeamImageUrl}
                                size={16}
                                variant={
                                  edits.sport === 'TENNIS' ? 'player' : 'team'
                                }
                              />
                            ) : null}
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.editFieldValueText,
                                {
                                  color: edits.awayTeam
                                    ? colors.textPrimary
                                    : colors.textMuted,
                                },
                              ]}
                            >
                              {edits.awayTeam ||
                                (edits.sport === 'TENNIS'
                                  ? 'Selecionar jogador...'
                                  : 'Selecionar equipa...')}
                            </Text>
                            {edits.awayTeam ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  updateItemEdit(index, selectionIndex, {
                                    awayTeam: '',
                                    awayTeamImageUrl: null,
                                  });
                                }}
                              >
                                <Ionicons
                                  name="close-circle"
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </Pressable>
                            ) : (
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.textMuted}
                              />
                            )}
                          </View>
                        </PressableScale>

                        {/* 5. Market */}
                        <PressableScale
                          scaleDown={0.97}
                          onPress={() =>
                            setMarketPickerTarget({
                              boletinIdx: index,
                              itemIdx: selectionIndex,
                            })
                          }
                          style={[
                            styles.editField,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                        >
                          <Text style={[styles.editFieldLabel, { color: colors.textMuted }]}>
                            MERCADO
                          </Text>
                          <View style={styles.editFieldValue}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.editFieldValueText,
                                {
                                  color: edits.market ? colors.textPrimary : colors.textMuted,
                                  flex: 1,
                                },
                              ]}
                            >
                              {edits.market
                                ? (edits.homeTeam && edits.awayTeam
                                    ? humanizeMarket(edits.market, edits.homeTeam, edits.awayTeam)
                                    : edits.market)
                                : 'Selecionar mercado...'}
                            </Text>
                            {edits.market ? (
                              <Pressable
                                hitSlop={8}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  updateItemEdit(index, selectionIndex, { market: '' });
                                }}
                              >
                                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                              </Pressable>
                            ) : (
                              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                            )}
                          </View>
                        </PressableScale>

                        {/* 6. Selection + Odd — inline row like create screen */}
                        <View style={styles.inlineRow}>
                          {/* Selection */}
                          <View
                            style={[
                              styles.editField,
                              styles.inlineFieldFlex2,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.editFieldLabel, { color: colors.textMuted }]}
                            >
                              SELEÇÃO
                            </Text>
                            <TextInput
                              style={[
                                styles.editFieldInput,
                                { color: colors.textPrimary },
                              ]}
                              value={edits.selection}
                              onChangeText={(v) =>
                                updateItemEdit(index, selectionIndex, { selection: v })
                              }
                              placeholder="ex: 1"
                              placeholderTextColor={colors.textMuted}
                              autoCapitalize="none"
                            />
                          </View>

                          {/* Odd — taps open numeric keyboard */}
                          <Pressable
                            onPress={() => {
                              setNumericFocus({
                                kind: 'odd',
                                boletinIdx: index,
                                itemIdx: selectionIndex,
                              });
                            }}
                            style={[
                              styles.editField,
                              styles.inlineFieldFlex1,
                              {
                                borderColor: isOddFocused
                                  ? colors.primary
                                  : colors.border,
                                backgroundColor: colors.surface,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.editFieldLabel, { color: colors.textMuted }]}
                            >
                              ODD
                            </Text>
                            <Text
                              style={[
                                styles.editFieldInput,
                                {
                                  color: isOddFocused ? colors.primary : colors.gold,
                                  fontWeight: '700',
                                },
                              ]}
                            >
                              {edits.oddValue ||
                                formatOdds(selectionItem.oddValue) ||
                                '—'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}
          </Card>
        </Pressable>
      );
    },
    [
      selected,
      expanded,
      itemResults,
      numericFocus,
      stakeEdits,
      toggleItem,
      toggleExpanded,
      colors,
      getItemEdit,
      getItemResult,
      cycleItemResult,
      updateItemEdit,
      openSelectionDatePicker,
      openBoletinDatePicker,
      betDateEdits,
      boletinStatusEdits,
      setBoletinStatusEdits,
      dismissNumericKeyboard,
    ],
  );

  if (!pdfResult || boletins.length === 0) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons
            name="file-alert-outline"
            size={48}
            color={colors.textMuted}
          />
          <Text
            style={[styles.emptyText, { color: colors.textSecondary }]}
          >
            Não encontrámos apostas neste ficheiro.
          </Text>
          <Button title="Voltar" onPress={() => router.back()} variant="ghost" />
        </View>
      </View>
    );
  }

  const numericKeyboardVisible = numericFocus !== null;
  const numericIsDecimal = numericFocus?.kind === 'odd'; // odds allow decimals; stake is integer

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Summary banner */}
      <Animated.View
        entering={FadeInDown.duration(160)}
        style={[styles.summaryBanner, { backgroundColor: colors.surface }]}
      >
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
        <PressableScale
          scaleDown={0.96}
          onPress={toggleAll}
          style={styles.selectAllButton}
        >
          <Ionicons
            name={
              selectedCount === boletins.length ? 'checkbox' : 'square-outline'
            }
            size={20}
            color={
              selectedCount === boletins.length
                ? colors.primary
                : colors.textMuted
            }
          />
          <Text style={[styles.selectAllLabel, { color: colors.textPrimary }]}>
            {selectedCount === boletins.length
              ? 'Desselecionar tudo'
              : 'Selecionar tudo'}
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
          paddingBottom: insets.bottom + (numericKeyboardVisible ? 320 : 100),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={dismissNumericKeyboard}
      />

      {/* Sticky footer + numeric keyboard (slides up together) */}
      <Animated.View style={[shakeStyle]}>
        {/* Numeric keyboard — shown when odd or stake is focused */}
        {numericKeyboardVisible && (
          <Animated.View
            entering={FadeInDown.duration(220).springify()}
            style={[
              styles.numericKeyboardPanel,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: 0,
              },
            ]}
          >
            {/* Label + dismiss */}
            <View style={styles.numericKeyboardHeader}>
              <Text style={[styles.numericKeyboardLabel, { color: colors.textSecondary }]}>
                {numericFocus?.kind === 'stake' ? 'Stake (€)' : 'Odd'}
              </Text>
              <Pressable hitSlop={12} onPress={dismissNumericKeyboard}>
                <Ionicons name="checkmark-done" size={20} color={colors.primary} />
              </Pressable>
            </View>
            {/* Current value display */}
            <View
              style={[
                styles.numericValueDisplay,
                { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
              ]}
            >
              <Text
                style={[
                  styles.numericValueText,
                  { color: numericFocus?.kind === 'odd' ? colors.gold : colors.textPrimary },
                ]}
              >
                {numericKeyboardValue || '0'}
              </Text>
              {numericKeyboardValue.length > 0 && (
                <Pressable
                  hitSlop={8}
                  onPress={() => handleNumericChange('')}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <NumericKeyboard
              value={numericKeyboardValue}
              maxLength={numericFocus?.kind === 'odd' ? 6 : 8}
              allowDecimal={numericIsDecimal}
              onChangeText={handleNumericChange}
            />
          </Animated.View>
        )}

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
            title={
              selectedCount > 0
                ? `Importar ${selectedCount} apostas`
                : 'Importar'
            }
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
            updateItemEdit(
              competitionPickerTarget.boletinIdx,
              competitionPickerTarget.itemIdx,
              { competition: value },
            );
          }
          setCompetitionPickerTarget(null);
        }}
      />

      {/* Team Picker Modal */}
      <SearchableDropdown
        visible={teamPickerTarget !== null}
        onClose={() => setTeamPickerTarget(null)}
        title={
          teamPickerTarget?.side === 'home'
            ? teamPickerSport === Sport.TENNIS
              ? 'Jogador 1'
              : 'Equipa Casa'
            : teamPickerSport === Sport.TENNIS
            ? 'Jogador 2'
            : 'Equipa Fora'
        }
        items={teamPickerSport === Sport.TENNIS ? [] : teamPickerItems}
        sections={teamPickerSport === Sport.TENNIS ? playerSections : undefined}
        headerContent={teamPickerSport === Sport.TENNIS ? playerSearchHeader : undefined}
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
            const picked =
              teamsQuery.data?.find((t) => (t.displayName ?? t.name) === val) ??
              allTeamsQuery.data?.find((t) => (t.displayName ?? t.name) === val) ??
              atpTeamsQuery.data?.find((t) => (t.displayName ?? t.name) === val) ??
              wtaTeamsQuery.data?.find((t) => (t.displayName ?? t.name) === val);
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
        isLoading={teamsQuery.isLoading || allTeamsQuery.isLoading || atpTeamsQuery.isLoading || wtaTeamsQuery.isLoading}
        allowCustomValue
        initialVisibleCount={20}
      />

      {/* Market picker — plain text entry via SearchableDropdown custom value */}
      <SearchableDropdown
        visible={marketPickerTarget !== null}
        onClose={() => setMarketPickerTarget(null)}
        title="Mercado"
        sections={marketSections}
        onSelect={(val) => {
          if (marketPickerTarget) {
            updateItemEdit(marketPickerTarget.boletinIdx, marketPickerTarget.itemIdx, {
              market: val,
            });
          }
          setMarketPickerTarget(null);
        }}
        isLoading={marketsQuery.isLoading}
        initialVisibleCount={8}
        allowCustomValue
      />

      {/* Country picker for tennis player filter */}
      <SearchableDropdown
        visible={showCountryPickerForTeam}
        onClose={() => setShowCountryPickerForTeam(false)}
        title="Filtrar por país"
        items={availablePlayerCountries.map((c) => ({
          label: `${getCountryFlagEmoji(c)} ${c}`,
          value: c,
        }))}
        onSelect={(val) => {
          setPlayerCountryFilter(val);
          setShowCountryPickerForTeam(false);
        }}
        initialVisibleCount={30}
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
          <View
            style={[styles.sportModalContent, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.sportModalTitle, { color: colors.textPrimary }]}>
              Desporto
            </Text>
            <View style={styles.sportModalGrid}>
              {SPORT_OPTIONS.map((opt) => {
                const isActive =
                  sportPickerTarget !== null &&
                  getItemEdit(
                    sportPickerTarget.boletinIdx,
                    sportPickerTarget.itemIdx,
                  ).sport === opt.key;
                return (
                  <PressableScale
                    scaleDown={0.92}
                    key={opt.key}
                    onPress={() => {
                      if (sportPickerTarget) {
                        updateItemEdit(
                          sportPickerTarget.boletinIdx,
                          sportPickerTarget.itemIdx,
                          { sport: opt.key },
                        );
                      }
                      setSportPickerTarget(null);
                    }}
                    style={[
                      styles.sportModalChip,
                      {
                        borderColor: isActive ? colors.primary : colors.border,
                        backgroundColor: isActive
                          ? colors.primary + '18'
                          : colors.surfaceRaised,
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

      {/* Date Picker Modal */}
      <Modal
        visible={datePickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <Pressable
          style={styles.sportModalBackdrop}
          onPress={() => setDatePickerTarget(null)}
        >
          <Pressable
            style={[styles.dateModalContent, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <Text style={[styles.dateModalTitle, { color: colors.textPrimary }]}>
              Data do jogo
            </Text>
            <View style={styles.dateFieldsRow}>
              <View style={styles.dateFieldGroup}>
                <Text style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Dia</Text>
                <TextInput
                  style={[styles.dateFieldInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                  value={dateDraft.day}
                  onChangeText={(v) => setDateDraft((p) => ({ ...p, day: v.replace(/\D/g, '').slice(0, 2) }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="DD"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                />
              </View>
              <Text style={[styles.dateSeparator, { color: colors.textMuted }]}>/</Text>
              <View style={styles.dateFieldGroup}>
                <Text style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Mês</Text>
                <TextInput
                  style={[styles.dateFieldInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                  value={dateDraft.month}
                  onChangeText={(v) => setDateDraft((p) => ({ ...p, month: v.replace(/\D/g, '').slice(0, 2) }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                />
              </View>
              <Text style={[styles.dateSeparator, { color: colors.textMuted }]}>/</Text>
              <View style={[styles.dateFieldGroup, styles.dateFieldWide]}>
                <Text style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Ano</Text>
                <TextInput
                  style={[styles.dateFieldInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                  value={dateDraft.year}
                  onChangeText={(v) => setDateDraft((p) => ({ ...p, year: v.replace(/\D/g, '').slice(0, 4) }))}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="AAAA"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                />
              </View>
            </View>
            <View style={styles.dateFieldsRow}>
              <View style={styles.dateFieldGroup}>
                <Text style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Hora</Text>
                <TextInput
                  style={[styles.dateFieldInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                  value={dateDraft.hour}
                  onChangeText={(v) => setDateDraft((p) => ({ ...p, hour: v.replace(/\D/g, '').slice(0, 2) }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="HH"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                />
              </View>
              <Text style={[styles.dateSeparator, { color: colors.textMuted }]}>:</Text>
              <View style={styles.dateFieldGroup}>
                <Text style={[styles.dateFieldLabel, { color: colors.textMuted }]}>Min</Text>
                <TextInput
                  style={[styles.dateFieldInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
                  value={dateDraft.minute}
                  onChangeText={(v) => setDateDraft((p) => ({ ...p, minute: v.replace(/\D/g, '').slice(0, 2) }))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={colors.textMuted}
                  textAlign="center"
                />
              </View>
            </View>
            <View style={styles.dateModalButtons}>
              <Button
                variant="ghost"
                title="Cancelar"
                onPress={() => setDatePickerTarget(null)}
                style={{ flex: 1 }}
              />
              <Button
                title="Confirmar"
                onPress={confirmDatePicker}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
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
  betCardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  betCardDate: { fontSize: 12, fontWeight: '600' },
  betCardDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  betCardEvent: { gap: 4 },
  betCardTeams: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  betCardMore: { fontSize: 12 },
  betCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  betCardMetaText: { fontSize: 13, flexShrink: 1 },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
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
  tapToChangeTip: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
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
  matchDateText: { fontSize: 10, fontWeight: '600' },
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
  matchVs: { fontSize: 11, fontWeight: '600' },
  matchOdd: { fontSize: 12, fontWeight: '900' },

  // ── Edit fields — ordered like create screen ──
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
  editFieldInput: {
    fontSize: 13,
    fontWeight: '500',
    paddingVertical: 0,
  },
  // Inline row (selection + odd) — mirrors create screen
  inlineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineFieldFlex2: { flex: 2 },
  inlineFieldFlex1: { flex: 1 },

  // ── Numeric keyboard panel ──
  numericKeyboardPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  numericKeyboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numericKeyboardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  numericValueDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  numericValueText: {
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
  },

  // ── Sport modal ──
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
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  dateModalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  dateModalTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  dateFieldsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    justifyContent: 'center',
  },
  dateFieldGroup: { alignItems: 'center', gap: 4 },
  dateFieldWide: { minWidth: 68 },
  dateFieldLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  dateFieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 44,
  },
  dateSeparator: { fontSize: 20, fontWeight: '700', paddingBottom: 8 },
  dateModalButtons: { flexDirection: 'row', gap: 10 },
});