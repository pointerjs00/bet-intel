import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, FadeIn, FadeOut, SlideInDown, SlideInUp, useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { BoletinStatus, ItemResult, Sport } from '@betintel/shared';
import type { Notification } from '@betintel/shared';
import { SearchableDropdown } from '../../components/ui/SearchableDropdown';
import { SwipeableBoletinCard } from '../../components/boletins/SwipeableBoletinCard';
import { useShareBoletinSheet } from '../../components/social/ShareBoletinProvider';
import {
  BoletinFilterSheet,
  type BoletinFilter,
  type BoletinSort,
  type CompetitionEntry,
  type TeamEntry,
} from '../../components/boletins/BoletinFilterSheet';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { PressableScale } from '../../components/ui/PressableScale';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useBoletins, useDeleteBoletinMutation, useUpdateBoletinItemsMutation } from '../../services/boletinService';
import {
  useNotifications,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useUnreadNotificationsCount,
} from '../../services/socialService';
import { tokens } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { getNotificationTarget } from '../../utils/notificationNavigation';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { hapticLight } from '../../utils/haptics';
import { BETTING_SITES } from '../../utils/sportAssets';

const INITIAL_VISIBLE_BOLETINS = 15;
const VISIBLE_BATCH_SIZE = 15;
const LOAD_MORE_THRESHOLD = 0.4;

type SlipListItem = { id: string; type: 'skeleton' } | (ReturnType<typeof useBoletins>['data'] extends Array<infer T> | undefined ? T : never);



const STATUS_FILTERS: Array<{ key: BoletinStatus; label: string; activeColor: string; activeBorder: string }> = [
  { key: BoletinStatus.PENDING,  label: '⏳ Pendente',   activeColor: 'rgba(255,149,0,0.15)',  activeBorder: '#FF9500' },
  { key: BoletinStatus.WON,      label: '✅ Ganhou',     activeColor: 'rgba(0,168,67,0.15)',   activeBorder: '#00A843' },
  { key: BoletinStatus.LOST,     label: '❌ Perdeu',     activeColor: 'rgba(255,59,48,0.15)',  activeBorder: '#FF3B30' },
  { key: BoletinStatus.VOID,     label: '🚫 Cancelado',  activeColor: 'rgba(0,122,255,0.15)',  activeBorder: '#007AFF' },
  { key: BoletinStatus.CASHOUT,  label: '💵 Cashout',    activeColor: 'rgba(255,215,0,0.15)',  activeBorder: '#FFD700' },
];

const STATUS_FILTER_ITEMS = STATUS_FILTERS.map((f) => ({ label: f.label, value: f.key }));

const ItemSeparator = () => <View style={{ height: 16 }} />;
const keyExtractor = (item: SlipListItem) => item.id;

const NOTIF_ICONS: Record<string, { name: string; color: string }> = {
  FRIEND_REQUEST: { name: 'account-plus-outline', color: 'info' },
  FRIEND_ACCEPTED: { name: 'account-check-outline', color: 'primary' },
  BOLETIN_SHARED: { name: 'share-variant-outline', color: 'gold' },
  BOLETIN_RESULT: { name: 'trophy-outline', color: 'warning' },
  SYSTEM: { name: 'bell-outline', color: 'info' },
};

const DISMISS_THRESHOLD = -70;
const AUTO_DISMISS_THRESHOLD = -160;

function SwipeableNotifRow({
  notif,
  colors,
  onDismiss,
  onPress,
  onNavigate,
}: {
  notif: Notification;
  colors: Record<string, string>;
  onDismiss: () => void;
  onPress: () => void;
  onNavigate?: () => void;
}) {
  const iconConfig = NOTIF_ICONS[notif.type] ?? NOTIF_ICONS.SYSTEM;
  const iconColor = (colors[iconConfig.color] ?? colors.info) as string;
  const translateX = useSharedValue(0);
  const offset = useSharedValue(0);
  const scale = useSharedValue(1);
  const rowWidth = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onBegin(() => {
      offset.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.min(0, offset.value + e.translationX);
    })
    .onEnd((e) => {
      const total = offset.value + e.translationX;
      if (total < AUTO_DISMISS_THRESHOLD) {
        translateX.value = withTiming(-400, { duration: 200 }, () => runOnJS(onDismiss)());
      } else if (total < DISMISS_THRESHOLD) {
        translateX.value = withSpring(DISMISS_THRESHOLD, { damping: 20, stiffness: 200 });
        offset.value = DISMISS_THRESHOLD;
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        offset.value = 0;
      }
    });

  const tap = Gesture.Tap()
    .onBegin(() => { scale.value = withTiming(0.96, { duration: 80 }); })
    .onFinalize(() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); })
    .onEnd((event) => {
      if (translateX.value < -5) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        offset.value = 0;
      } else if (
        onNavigate
        && rowWidth.value > 0
        && event.x >= Math.max(0, rowWidth.value - 52)
      ) {
        runOnJS(onNavigate)();
      } else {
        runOnJS(onPress)();
      }
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
  }));

  const revealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, DISMISS_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Red dismiss background */}
      <Animated.View
        style={[
          { position: 'absolute', right: 0, top: 0, bottom: 0, width: 70, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FF3B3020', borderRadius: 8 },
          revealOpacity,
        ]}
      >
        <MaterialCommunityIcons name="delete-outline" size={20} color="#FF3B30" />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          onLayout={(event) => { rowWidth.value = event.nativeEvent.layout.width; }}
          style={[
            swipeableRowStyles.row,
            { borderBottomColor: colors.border as string },
            !notif.isRead && { backgroundColor: `${colors.primary}08` },
            rowStyle,
          ]}
        >
          <View style={[swipeableRowStyles.icon, { backgroundColor: `${iconColor}18` }]}>
            <MaterialCommunityIcons color={iconColor} name={iconConfig.name as keyof typeof MaterialCommunityIcons.glyphMap} size={16} />
          </View>
          <View style={swipeableRowStyles.content}>
            <Text numberOfLines={1} style={[swipeableRowStyles.title, { color: colors.textPrimary as string }]}>{notif.title}</Text>
            <Text numberOfLines={1} style={[swipeableRowStyles.body, { color: colors.textSecondary as string }]}>{notif.body}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[swipeableRowStyles.time, { color: colors.textMuted as string }]}>{formatRelativeTime(notif.createdAt)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {!notif.isRead && <View style={[swipeableRowStyles.dot, { backgroundColor: colors.primary as string }]} />}
              {onNavigate && (
                <View pointerEvents="none" style={swipeableRowStyles.navigateIconWrap}>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textMuted as string} />
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const swipeableRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10, backgroundColor: 'transparent' },
  icon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 11, lineHeight: 15 },
  time: { fontSize: 10, fontWeight: '600' },
  dot: { borderRadius: 4, height: 8, width: 8 },
  navigateIconWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 18 },
});

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { openShareBoletinSheet } = useShareBoletinSheet();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const filterSheetRef = useRef<GorhomBottomSheet>(null);

  const [activeStatuses, setActiveStatuses] = useState<Set<BoletinStatus>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [exactMarket, setExactMarket] = useState<string | null>(null);
  const [sort, setSort] = useState<BoletinSort>({ by: 'date', dir: 'desc' });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_BOLETINS);


  // Read filter params pushed from the stats screen (e.g. filterTeam, filterSport, etc.)
  const {
    filterSport,
    filterTeam,
    filterCompetition,
    filterMarket,
    filterSite,
    filterWeekday,
    filterLegCount,
    filterStakeMin,
    filterStakeMax,
  } = useLocalSearchParams<{
    filterSport?: string;
    filterTeam?: string;
    filterCompetition?: string;
    filterMarket?: string;
    filterSite?: string;
    filterWeekday?: string;
    filterLegCount?: string;
    filterStakeMin?: string;
    filterStakeMax?: string;
  }>();

  const boletinsQuery = useBoletins();
  const deleteMutation = useDeleteBoletinMutation();
  const updateItemsMutation = useUpdateBoletinItemsMutation();
  const unreadCount = useUnreadNotificationsCount().data ?? 0;
  const notificationsQuery = useNotifications(1, 8);
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllMutation = useMarkAllNotificationsReadMutation();
  const [showNotifBubble, setShowNotifBubble] = useState(false);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(new Set());

  // Track whether the filter sheet is open so the back gesture dismisses it
  // instead of doing default OS back handling (which exits the app on a root tab).
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // State for the delete-boletin confirmation modal.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name?: string } | null>(null);
  const [showMarkAllConfirm, setShowMarkAllConfirm] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  const handleQuickResolve = useCallback(
    (boletin: { id: string; items: Array<{ id: string }> }, result: ItemResult) => {
      updateItemsMutation.mutate(
        { boletinId: boletin.id, items: boletin.items.map((i) => ({ id: i.id, result })) },
        {
          onSuccess: () => showToast(result === ItemResult.WON ? 'Ganhou! 🎉' : result === ItemResult.LOST ? 'Perdeu.' : 'Void.', 'success'),
          onError: (err) => showToast(getErrorMessage(err), 'error'),
        },
      );
    },
    [updateItemsMutation, showToast],
  );

  // Hide the tab bar when the notification detail popup is open.
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedNotif ? { display: 'none' } : undefined,
    });
  }, [selectedNotif, navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFilterSheetOpen) {
        filterSheetRef.current?.close();
        return true; // consume — don't let OS handle it
      }
      return false;
    });
    return () => sub.remove();
  }, [isFilterSheetOpen]);

  useFocusEffect(
    useCallback(() => {
      void boletinsQuery.refetch();
    }, [boletinsQuery.refetch]),
  );

  const boletins = boletinsQuery.data ?? [];

  // Derive range maxima from actual data for slider bounds
  const dataRanges = useMemo(() => {
    if (boletins.length === 0) return { maxStake: 100, maxOdds: 20, maxReturn: 1000 };
    return {
      maxStake: Math.max(100, ...boletins.map((b) => Number(b.stake))),
      maxOdds: Math.max(10, ...boletins.map((b) => Number(b.totalOdds))),
      maxReturn: Math.max(100, ...boletins.map((b) => Number(b.actualReturn ?? b.potentialReturn))),
    };
  }, [boletins]);

  const [filter, setFilter] = useState<BoletinFilter>({
    stakeRange: [0, dataRanges.maxStake],
    oddsRange: [1, dataRanges.maxOdds],
    returnRange: [0, dataRanges.maxReturn],
    sport: null,
    competitions: [],
    teams: [],
    sites: [],
    weekday: null,
    legCount: null,
    dateFrom: null,
    dateTo: null,
  });

  // When data loads and range maxima grow, expand any upper bounds the user hasn't manually narrowed.
  // useLayoutEffect (not useEffect) so the correction fires synchronously before the screen paints,
  // preventing a one-render flash where activeFilterCount > 0 from stale upper bounds.
  const prevDataRanges = useRef(dataRanges);
  useLayoutEffect(() => {
    const prev = prevDataRanges.current;
    prevDataRanges.current = dataRanges;
    setFilter((f) => ({
      ...f,
      stakeRange: [f.stakeRange[0], f.stakeRange[1] >= prev.maxStake ? dataRanges.maxStake : f.stakeRange[1]],
      oddsRange: [f.oddsRange[0], f.oddsRange[1] >= prev.maxOdds ? dataRanges.maxOdds : f.oddsRange[1]],
      returnRange: [f.returnRange[0], f.returnRange[1] >= prev.maxReturn ? dataRanges.maxReturn : f.returnRange[1]],
    }));
  }, [dataRanges]);

  useEffect(() => {
    const hasRouteFilter = [
      filterSport,
      filterTeam,
      filterCompetition,
      filterMarket,
      filterSite,
      filterWeekday,
      filterLegCount,
      filterStakeMin,
      filterStakeMax,
    ].some((value) => value !== undefined && value !== '');

    if (!hasRouteFilter) {
      return;
    }

    const hasStakeRoute =
      (filterStakeMin !== undefined && filterStakeMin !== '') ||
      (filterStakeMax !== undefined && filterStakeMax !== '');
    const parsedWeekday =
      filterWeekday !== undefined && filterWeekday !== '' ? Number(filterWeekday) : null;
    const parsedLegCount =
      filterLegCount !== undefined && filterLegCount !== '' ? Number(filterLegCount) : null;
    const parsedStakeMin =
      filterStakeMin !== undefined && filterStakeMin !== '' ? Number(filterStakeMin) : 0;
    const parsedStakeMax =
      filterStakeMax === 'open' || filterStakeMax === undefined || filterStakeMax === ''
        ? dataRanges.maxStake
        : Number(filterStakeMax);

    setFilter((prev) => ({
      ...prev,
      sport: filterSport ? (filterSport as Sport) : prev.sport,
      teams: filterTeam ? [filterTeam] : prev.teams,
      competitions: filterCompetition ? [filterCompetition] : prev.competitions,
      sites: filterSite ? [filterSite] : prev.sites,
      stakeRange: hasStakeRoute
        ? [
            Number.isFinite(parsedStakeMin) ? parsedStakeMin : 0,
            Number.isFinite(parsedStakeMax) ? parsedStakeMax : dataRanges.maxStake,
          ]
        : prev.stakeRange,
      weekday:
        parsedWeekday !== null && Number.isInteger(parsedWeekday)
          ? parsedWeekday
          : filterSite || hasStakeRoute || filterSport || filterTeam || filterCompetition || filterMarket || filterLegCount
          ? null
          : prev.weekday,
      legCount:
        parsedLegCount !== null && Number.isInteger(parsedLegCount)
          ? parsedLegCount
          : filterSite || hasStakeRoute || filterSport || filterTeam || filterCompetition || filterMarket || filterWeekday
          ? null
          : prev.legCount,
    }));

    if (filterMarket) {
      setExactMarket(filterMarket);
    }

    router.setParams({
      filterSport: '',
      filterTeam: '',
      filterCompetition: '',
      filterMarket: '',
      filterSite: '',
      filterWeekday: '',
      filterLegCount: '',
      filterStakeMin: '',
      filterStakeMax: '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filterSport,
    filterTeam,
    filterCompetition,
    filterMarket,
    filterSite,
    filterWeekday,
    filterLegCount,
    filterStakeMin,
    filterStakeMax,
    dataRanges.maxStake,
  ]);

  // All unique competitions and teams from loaded data
  const allCompetitions = useMemo((): CompetitionEntry[] => {
    const map = new Map<string, CompetitionEntry['sport']>();
    boletins.forEach((b) => b.items.forEach((i) => { if (!map.has(i.competition)) map.set(i.competition, i.sport); }));
    return Array.from(map.entries()).map(([name, sport]) => ({ name, sport })).sort((a, b) => a.name.localeCompare(b.name));
  }, [boletins]);

  const allTeams = useMemo((): TeamEntry[] => {
    const map = new Map<string, TeamEntry['sport']>();
    boletins.forEach((b) =>
      b.items.forEach((i) => {
        if (!map.has(i.homeTeam)) map.set(i.homeTeam, i.sport);
        if (!map.has(i.awayTeam)) map.set(i.awayTeam, i.sport);
      }),
    );
    return Array.from(map.entries()).map(([name, sport]) => ({ name, sport })).sort((a, b) => a.name.localeCompare(b.name));
  }, [boletins]);

  // All betting sites that appear in loaded boletins (in BETTING_SITES canonical order)
  const allSitesInData = useMemo(() => {
    const slugsInData = new Set(boletins.map((b) => b.siteSlug).filter(Boolean) as string[]);
    return BETTING_SITES.filter((s) => slugsInData.has(s.slug));
  }, [boletins]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter.stakeRange[0] > 0 || filter.stakeRange[1] < dataRanges.maxStake) count++;
    if (filter.oddsRange[0] > 1 || filter.oddsRange[1] < dataRanges.maxOdds) count++;
    if (filter.returnRange[0] > 0 || filter.returnRange[1] < dataRanges.maxReturn) count++;
    if (filter.sport !== null) count++;
    if (filter.competitions.length > 0) count++;
    if (filter.teams.length > 0) count++;
    if (filter.sites.length > 0) count++;
    if (filter.weekday !== null) count++;
    if (filter.legCount !== null) count++;
    if (filter.dateFrom !== null || filter.dateTo !== null) count++;
    if (exactMarket) count++;
    return count;
  }, [filter, dataRanges, exactMarket]);

  const isDefaultSort = sort.by === 'date' && sort.dir === 'desc';

  const filtered = useMemo(() => {
    let result = activeStatuses.size > 0 ? boletins.filter((b) => activeStatuses.has(b.status)) : boletins;

    // Search by name, team, market or selection
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          (b.name ?? '').toLowerCase().includes(q) ||
          b.items.some(
            (i) =>
              i.homeTeam.toLowerCase().includes(q) ||
              i.awayTeam.toLowerCase().includes(q) ||
              i.market.toLowerCase().includes(q) ||
              i.selection.toLowerCase().includes(q),
          ),
      );
    }

    // Range filters
    result = result.filter((b) => {
      const stake = Number(b.stake);
      const odds = Number(b.totalOdds);
      const ret = Number(b.actualReturn ?? b.potentialReturn);
      return (
        stake >= filter.stakeRange[0] &&
        stake <= filter.stakeRange[1] &&
        odds >= filter.oddsRange[0] &&
        odds <= filter.oddsRange[1] &&
        ret >= filter.returnRange[0] &&
        ret <= filter.returnRange[1]
      );
    });

    // Sport filter
    if (filter.sport !== null) {
      result = result.filter((b) => b.items.some((i) => i.sport === filter.sport));
    }

    // Competition filter
    if (filter.competitions.length > 0) {
      result = result.filter((b) =>
        b.items.some((i) => filter.competitions.includes(i.competition)),
      );
    }

    // Team filter
    if (filter.teams.length > 0) {
      result = result.filter((b) =>
        b.items.some(
          (i) => filter.teams.includes(i.homeTeam) || filter.teams.includes(i.awayTeam),
        ),
      );
    }

    // Betting site filter
    if (filter.sites.length > 0) {
      const includesUnknownSite = filter.sites.includes('unknown');
      result = result.filter((b) => {
        if (!b.siteSlug) {
          return includesUnknownSite;
        }
        return filter.sites.includes(b.siteSlug);
      });
    }

    if (filter.weekday !== null) {
      result = result.filter(
        (b) => new Date(b.betDate ?? b.createdAt).getDay() === filter.weekday,
      );
    }

    if (filter.legCount !== null) {
      // legCount === 6 is the "6+" sentinel meaning 6 or more selections
      result = result.filter((b) =>
        filter.legCount! >= 6 ? b.items.length >= 6 : b.items.length === filter.legCount,
      );
    }

    // Date range filter
    if (filter.dateFrom !== null) {
      const from = filter.dateFrom.getTime();
      result = result.filter((b) => new Date(b.betDate ?? b.createdAt).getTime() >= from);
    }
    if (filter.dateTo !== null) {
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((b) => new Date(b.betDate ?? b.createdAt).getTime() <= to.getTime());
    }

    // Exact market filter (from stats drilldown — uses strict equality, not substring)
    if (exactMarket) {
      result = result.filter((b) => b.items.some((i) => i.market === exactMarket));
    }

    // Sort
    return [...result].sort((a, b) => {
      let valA: number;
      let valB: number;
      switch (sort.by) {
        case 'stake':
          valA = Number(a.stake);
          valB = Number(b.stake);
          break;
        case 'odds':
          valA = Number(a.totalOdds);
          valB = Number(b.totalOdds);
          break;
        case 'return':
          valA = Number(a.actualReturn ?? a.potentialReturn);
          valB = Number(b.actualReturn ?? b.potentialReturn);
          break;
        case 'events':
          valA = a.items.length;
          valB = b.items.length;
          break;
        case 'date':
        default:
          valA = new Date(a.betDate ?? a.createdAt).getTime();
          valB = new Date(b.betDate ?? b.createdAt).getTime();
      }
      return sort.dir === 'asc' ? valA - valB : valB - valA;
    });
  }, [boletins, activeStatuses, searchQuery, exactMarket, filter, sort]);

  // Reset visible count only when filters/sort change — never on scrolling
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_BOLETINS);
  }, [activeStatuses, searchQuery, exactMarket, filter, sort]);

  const visibleBoletins = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const hasMoreBoletins = visibleCount < filtered.length;

  const handleLoadMore = useCallback(() => {
    if (!hasMoreBoletins) return;
    setVisibleCount((c) => Math.min(c + VISIBLE_BATCH_SIZE, filtered.length));
  }, [hasMoreBoletins, filtered.length]);

  const listData: SlipListItem[] = boletinsQuery.isLoading
    ? [{ id: 's1', type: 'skeleton' }, { id: 's2', type: 'skeleton' }, { id: 's3', type: 'skeleton' }]
    : [...visibleBoletins];

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, boletin) => {
        if (!boletin.isFreebet) {
          acc.totalStaked += Number(boletin.stake);
        }
        // Freebet returns count as pure gain (stake was free)
        acc.totalReturned += Number(boletin.actualReturn ?? 0);
        return acc;
      },
      { totalStaked: 0, totalReturned: 0 },
    );
  }, [filtered]);

  const roi =
    summary.totalStaked > 0
      ? ((summary.totalReturned - summary.totalStaked) / summary.totalStaked) * 100
      : 0;

  const pendingCount = useMemo(
    () => (boletinsQuery.data ?? []).filter((b) => b.status === BoletinStatus.PENDING).length,
    [boletinsQuery.data],
  );

  const hasActiveControls = searchQuery.trim().length > 0 || activeFilterCount > 0 || !isDefaultSort;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: Math.max(insets.bottom, 12) + 64 + tokens.spacing.lg,
          paddingHorizontal: tokens.spacing.lg,
        }}
        data={listData}
        keyExtractor={keyExtractor}
        onRefresh={() => {
          hapticLight();
          void boletinsQuery.refetch();
        }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={LOAD_MORE_THRESHOLD}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* Title row */}
            <Animated.View entering={FadeInUp.duration(160).springify()} style={styles.titleRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.logo, { color: colors.textPrimary }]}>BetIntel</Text>
                <Text style={[styles.tagline, { color: colors.textMuted }]}>O teu tracker de apostas</Text>
              </View>
              <View style={styles.topActions}>
                <PressableScale
                  scaleDown={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Notificações"
                  onPress={() => { hapticLight(); setShowNotifBubble((v) => !v); }}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                >
                  <Ionicons color={colors.textSecondary} name="notifications-outline" size={20} />
                  {unreadCount > 0 ? (
                    <View style={[styles.notifBadge, { backgroundColor: colors.danger }]}>
                      <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  ) : null}
                </PressableScale>
                <PressableScale
                  scaleDown={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Diário de apostas"
                  onPress={() => router.push('/boletins/journal')}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                >
                  <Ionicons color={colors.textSecondary} name="journal-outline" size={20} />
                </PressableScale>
                <PressableScale
                  scaleDown={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={fabOpen ? 'Fechar menu' : 'Criar boletim'}
                  onPress={() => { hapticLight(); setFabOpen((v) => !v); }}
                  style={[styles.iconButton, { backgroundColor: fabOpen ? colors.danger : colors.primary }]}
                >
                  <Ionicons color="#FFFFFF" name={fabOpen ? 'close' : 'add'} size={20} />
                </PressableScale>
              </View>
            </Animated.View>

            {/* Summary card */}
            <Animated.View entering={FadeInDown.delay(30).duration(160).springify()}>
              <PressableScale onPress={() => router.push('/(tabs)/stats')}>
                <Card style={[styles.summaryCard, { borderColor: colors.border }]}>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total apostado</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatCurrency(summary.totalStaked)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Retorno</Text>
                    <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(summary.totalReturned)}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>ROI</Text>
                    <Text style={[styles.summaryValue, { color: roi >= 0 ? colors.primary : colors.danger }]}>{roi.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.summaryChevron}>
                    <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                  </View>
                </Card>
              </PressableScale>
            </Animated.View>

            {/* Batch resolve shortcut */}
            {pendingCount > 1 && (
              <Animated.View entering={FadeInDown.delay(40).duration(160).springify()}>
                <PressableScale
                  onPress={() => router.push('/boletins/batch-resolve')}
                  style={[styles.batchResolveBtn, { backgroundColor: `${colors.warning}18`, borderColor: colors.warning }]}
                >
                  <Ionicons color={colors.warning} name="checkmark-done" size={18} />
                  <Text style={[styles.batchResolveBtnText, { color: colors.warning }]}>
                    Resolver {pendingCount} pendentes
                  </Text>
                  <Ionicons color={colors.warning} name="chevron-forward" size={16} />
                </PressableScale>
              </Animated.View>
            )}

            {/* Search bar */}
            <Animated.View entering={FadeInDown.delay(45).duration(160).springify()}>
              <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons color={colors.textMuted} name="search" size={18} />
                <TextInput
                  onChangeText={setSearchQuery}
                  placeholder="Pesquisar boletins..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  value={searchQuery}
                />
                {searchQuery.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Limpar pesquisa"
                    hitSlop={8}
                    onPress={() => setSearchQuery('')}
                  >
                    <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>

            {/* Status dropdown + advanced filter button */}
            <Animated.View entering={FadeInDown.delay(35).duration(160).springify()} style={styles.controlsRow}>
              {/* Status dropdown trigger */}
              <PressableScale
                onPress={() => { hapticLight(); setShowStatusDropdown(true); }}
                style={[styles.statusDropdownTrigger, { backgroundColor: activeStatuses.size > 0 ? 'rgba(0,168,67,0.12)' : colors.surfaceRaised, borderColor: activeStatuses.size > 0 ? colors.primary : colors.border }]}
              >
                <Ionicons color={activeStatuses.size > 0 ? colors.primary : colors.textSecondary} name="funnel-outline" size={15} />
                <Text
                  numberOfLines={1}
                  style={[styles.statusDropdownLabel, { color: activeStatuses.size > 0 ? colors.primary : colors.textSecondary }]}
                >
                  {activeStatuses.size === 0
                    ? 'Estado'
                    : activeStatuses.size === 1
                      ? (STATUS_FILTERS.find((f) => activeStatuses.has(f.key))?.label ?? 'Estado')
                      : `${activeStatuses.size} estados`}
                </Text>
                {activeStatuses.size > 0 ? (
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => { e.stopPropagation(); hapticLight(); setActiveStatuses(new Set()); }}
                  >
                    <Ionicons color={colors.primary} name="close-circle" size={15} />
                  </Pressable>
                ) : (
                  <Ionicons color={colors.textMuted} name="chevron-down" size={15} />
                )}
              </PressableScale>

              <SearchableDropdown
                visible={showStatusDropdown}
                onClose={() => setShowStatusDropdown(false)}
                title="Filtrar por estado"
                items={STATUS_FILTER_ITEMS}
                multiSelect
                selectedValues={Array.from(activeStatuses)}
                onSelectMultiple={(vals) => setActiveStatuses(new Set(vals as BoletinStatus[]))}
                onSelect={() => {}}
              />

              {/* Advanced filter button */}
              <PressableScale
                onPress={() => filterSheetRef.current?.expand()}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor:
                      activeFilterCount > 0 || !isDefaultSort ? colors.primary : colors.surfaceRaised,
                    borderColor: activeFilterCount > 0 || !isDefaultSort ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons
                  color={activeFilterCount > 0 || !isDefaultSort ? '#fff' : colors.textSecondary}
                  name="options-outline"
                  size={18}
                />
                {(activeFilterCount > 0 || !isDefaultSort) ? (
                  <Text style={styles.filterBtnBadge}>
                    {activeFilterCount + (!isDefaultSort ? 1 : 0)}
                  </Text>
                ) : null}
              </PressableScale>
            </Animated.View>

            {/* Active filters summary */}
            {hasActiveControls ? (
              <View style={styles.clearFiltersRow}>
                <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
                  {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                </Text>
                <PressableScale
                  scaleDown={0.94}
                  onPress={() => {
                    hapticLight();
                    setSearchQuery('');
                    setExactMarket(null);
                    setSort({ by: 'date', dir: 'desc' });
                    setActiveStatuses(new Set());
                    setFilter({
                      stakeRange: [0, dataRanges.maxStake],
                      oddsRange: [1, dataRanges.maxOdds],
                      returnRange: [0, dataRanges.maxReturn],
                      sport: null,
                      competitions: [],
                      teams: [],
                      sites: [],
                      weekday: null,
                      legCount: null,
                      dateFrom: null,
                      dateTo: null,
                    });
                  }}
                  style={[styles.clearFiltersBtn, { backgroundColor: `${colors.danger}18`, borderColor: `${colors.danger}50` }]}
                >
                  <Ionicons color={colors.danger} name="close-circle" size={14} />
                  <Text style={[styles.clearFiltersBtnText, { color: colors.danger }]}>Limpar filtros</Text>
                </PressableScale>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !boletinsQuery.isLoading ? (
            boletinsQuery.isError ? (
              <EmptyState
                icon="cloud-outline"
                title="Não foi possível carregar os boletins"
                message={
                  (() => {
                    const axiosErr = boletinsQuery.error as { response?: { data?: { error?: string } } } | null;
                    const apiMsg = axiosErr?.response?.data?.error;
                    return apiMsg
                      ? `Erro: ${apiMsg}`
                      : 'Toca em tentar novamente para actualizar a lista com os dados mais recentes.';
                  })()
                }
                action={<Button onPress={() => void boletinsQuery.refetch()} title="Tentar novamente" />}
              />
            ) : (
              <EmptyState
                icon="receipt"
                title={hasActiveControls ? 'Nenhum boletim encontrado' : 'Ainda não tens boletins'}
                message={
                  hasActiveControls
                    ? 'Nenhum boletim corresponde aos filtros activos.'
                    : 'Cria o teu primeiro boletim tocando no botão + acima.'
                }
                action={
                  hasActiveControls ? undefined : (
                    <Button onPress={() => router.push('/boletins/create')} title="Criar boletim" />
                  )
                }
              />
            )
          ) : null
        }
        renderItem={({ item, index }) => {
          if ('type' in item) {
            return (
              <Card style={styles.skeletonCard}>
                <Skeleton height={20} width={110} />
                <Skeleton height={26} width="88%" />
                <Skeleton height={80} width="100%" />
              </Card>
            );
          }

          const card = (
            <SwipeableBoletinCard
              boletin={item}
              onDelete={() => setDeleteTarget({ id: item.id, name: item.name ?? undefined })}
              onPress={() => router.push(`/boletins/${item.id}`)}
              onShare={() => openShareBoletinSheet({ boletinId: item.id, boletinName: item.name ?? undefined })}
              onQuickResolve={item.status === BoletinStatus.PENDING ? (result) => handleQuickResolve(item, result) : undefined}
            />
          );

          return card;
        }}
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={
          hasMoreBoletins ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : boletinsQuery.isLoading || boletins.length === 0 ? null : (
            <View style={styles.footerBar}>
              <Button onPress={() => router.push('/boletins/create')} title="Novo boletim" />
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        refreshing={boletinsQuery.isRefetching && !boletinsQuery.isLoading}
        windowSize={101}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={5}
        initialNumToRender={15}
      />

      {/* Notification bubble overlay */}
      {showNotifBubble ? (
        <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fechar notificações"
                    onPress={() => setShowNotifBubble(false)}
                    style={StyleSheet.absoluteFill}
                  />
          <Animated.View
            entering={FadeIn.duration(200).springify().damping(18).stiffness(260)}
            exiting={FadeOut.duration(120)}
            style={[
              styles.notifBubble,
              {
                top: insets.top + 60,
                right: tokens.spacing.lg,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.notifBubbleHeader}>
              <Text style={[styles.notifBubbleTitle, { color: colors.textPrimary }]}>Notificações</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {(notificationsQuery.data?.items ?? []).some((n: Notification) => !n.isRead) && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Marcar todas como lidas"
                    hitSlop={8}
                    onPress={() => setShowMarkAllConfirm(true)}
                    disabled={markAllMutation.isPending}
                  >
                    <Text style={[styles.notifBubbleMarkAll, { color: colors.textSecondary }]}>Marcar todas</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ver todas as notificações"
                  hitSlop={8}
                  onPress={() => { setShowNotifBubble(false); router.push('/notifications'); }}
                >
                  <Text style={[styles.notifBubbleSeeAll, { color: colors.primary }]}>Ver todas</Text>
                </Pressable>
              </View>
            </View>
            {notificationsQuery.isLoading ? (
              <View style={styles.notifBubbleLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            ) : (() => {
              const visibleItems = (notificationsQuery.data?.items ?? []).filter((n: Notification) => !dismissedNotifIds.has(n.id));
              if (visibleItems.length === 0) {
                return (
                  <View style={styles.notifBubbleEmpty}>
                    <MaterialCommunityIcons color={colors.textMuted} name="bell-off-outline" size={28} />
                    <Text style={[styles.notifBubbleEmptyText, { color: colors.textMuted }]}>Sem notificações</Text>
                  </View>
                );
              }
              return visibleItems.map((notif: Notification) => {
                const target = getNotificationTarget(notif);
                return (
                  <SwipeableNotifRow
                    key={notif.id}
                    notif={notif}
                    colors={colors as Record<string, string>}
                    onDismiss={() => {
                      if (!notif.isRead) markReadMutation.mutate(notif.id);
                      setDismissedNotifIds((prev) => new Set([...prev, notif.id]));
                    }}
                    onPress={() => {
                      if (!notif.isRead) markReadMutation.mutate(notif.id);
                      setSelectedNotif(notif);
                      setShowNotifBubble(false);
                    }}
                    onNavigate={
                      target
                        ? () => {
                            if (!notif.isRead) markReadMutation.mutate(notif.id);
                            setShowNotifBubble(false);
                            router.push(target as never);
                          }
                        : undefined
                    }
                  />
                );
              });
            })()}
          </Animated.View>
        </>
      ) : null}

      {/* FAB create menu overlay */}
      {fabOpen && (
        <>
          <Pressable onPress={() => setFabOpen(false)} style={StyleSheet.absoluteFill} />
          <Animated.View
            entering={FadeIn.duration(100)}
            exiting={FadeOut.duration(80)}
            style={[
              styles.fabMenu,
              { top: insets.top + 52, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {([
              { label: 'Criar manualmente',   icon: 'create-outline',       lib: 'ion' as const, route: '/boletins/create',    color: colors.primary },
              { label: 'Registo rápido',        icon: 'flash',                lib: 'ion' as const, route: '/boletins/quick-log',  color: colors.warning },
              { label: 'Importar screenshot',   icon: 'cellphone-screenshot', lib: 'mci' as const, route: '/boletins/scan',        color: colors.info    },
            ] as const).map((opt, i) => (
              <Animated.View key={opt.route} entering={FadeInDown.delay(i * 40).duration(130).springify()}>
                <PressableScale
                  onPress={() => { hapticLight(); setFabOpen(false); router.push(opt.route as never); }}
                  style={[
                    styles.fabMenuItem,
                    { borderBottomColor: colors.border },
                    i === 2 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={[styles.fabMenuIcon, { backgroundColor: `${opt.color}18` }]}>
                    {opt.lib === 'ion'
                      ? <Ionicons color={opt.color} name={opt.icon as keyof typeof Ionicons.glyphMap} size={18} />
                      : <MaterialCommunityIcons color={opt.color} name={opt.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} />}
                  </View>
                  <Text style={[styles.fabMenuLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={14} />
                </PressableScale>
              </Animated.View>
            ))}
          </Animated.View>
        </>
      )}

      {/* Sort & Filter bottom sheet */}
      <BoletinFilterSheet
        sheetRef={filterSheetRef}
        sort={sort}
        filter={filter}
        maxStake={dataRanges.maxStake}
        maxOdds={dataRanges.maxOdds}
        maxReturn={dataRanges.maxReturn}
        allCompetitions={allCompetitions}
        allTeams={allTeams}
        allSites={allSitesInData}
        onApply={(newSort, newFilter) => {
          setSort(newSort);
          setFilter(newFilter);
        }}
        onIndexChange={(idx) => setIsFilterSheetOpen(idx >= 0)}
      />

      {/* Notification detail popup */}
      {selectedNotif && (() => {
        const n = selectedNotif;
        const nIconConfig = NOTIF_ICONS[n.type] ?? NOTIF_ICONS.SYSTEM;
        const nIconColor = colors[nIconConfig.color as keyof typeof colors] ?? colors.info;
        const target = getNotificationTarget(n);
        const hasNavTarget = Boolean(target);

        return (
          <>
            <Pressable onPress={() => setSelectedNotif(null)} style={StyleSheet.absoluteFill} />
            <Animated.View
              entering={SlideInDown.springify().damping(22).stiffness(280)}
              exiting={FadeOut.duration(120)}
              style={[
                styles.notifDetailPopup,
                {
                  bottom: 0,
                  paddingBottom: 28,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.notifDetailHeader}>
                <View style={[styles.notifDetailIcon, { backgroundColor: `${nIconColor}18` }]}>
                  <MaterialCommunityIcons color={nIconColor} name={nIconConfig.name as keyof typeof MaterialCommunityIcons.glyphMap} size={22} />
                </View>
                <Pressable hitSlop={8} onPress={() => setSelectedNotif(null)}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.notifDetailTitle, { color: colors.textPrimary }]}>{n.title}</Text>
              <Text style={[styles.notifDetailBody, { color: colors.textSecondary }]}>{n.body}</Text>
              <Text style={[styles.notifDetailTime, { color: colors.textMuted }]}>{formatRelativeTime(n.createdAt)}</Text>
              {hasNavTarget && (
                <Pressable
                  onPress={() => {
                    setSelectedNotif(null);
                    if (target) {
                      router.push(target as never);
                    }
                  }}
                  style={[styles.notifDetailButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.notifDetailButtonText}>
                    {n.type === 'FRIEND_REQUEST' || n.type === 'FRIEND_ACCEPTED' ? 'Ver amigos' : 'Ver boletim'}
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
                </Pressable>
              )}
            </Animated.View>
          </>
        );
      })()}

      <ConfirmModal
        visible={deleteTarget !== null}
        title="Eliminar boletim"
        message={`Tens a certeza que queres eliminar "${deleteTarget?.name ?? 'este boletim'}"? Esta ação não pode ser revertida.`}
        confirmLabel="Eliminar"
        storageKey="delete-boletim"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const id = deleteTarget.id;
          setDeleteTarget(null);
          try {
            await deleteMutation.mutateAsync(id);
            showToast('Boletim eliminado.', 'success');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        visible={showMarkAllConfirm}
        title="Marcar todas como lidas"
        message="Tens a certeza que queres marcar todas as notificações como lidas?"
        confirmLabel="Marcar todas"
        confirmVariant="primary"
        onConfirm={() => {
          setShowMarkAllConfirm(false);
          markAllMutation.mutate();
        }}
        onCancel={() => setShowMarkAllConfirm(false)}
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
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a operação.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 14, marginBottom: 18 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 4, paddingRight: 16 },
  logo: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontWeight: '600' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  notifBadge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    top: -4,
    right: -4,
  },
  notifBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  notifBubble: {
    position: 'absolute',
    width: 320,
    maxHeight: 420,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    zIndex: 100,
  },
  notifBubbleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  notifBubbleTitle: { fontSize: 16, fontWeight: '800' },
  notifBubbleSeeAll: { fontSize: 13, fontWeight: '700' },
  notifBubbleLoading: { alignItems: 'center', paddingVertical: 32 },
  notifBubbleEmpty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  notifBubbleEmptyText: { fontSize: 13, fontWeight: '600' },
  notifBubbleRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notifBubbleIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  notifBubbleContent: { flex: 1, gap: 2 },
  notifBubbleRowTitle: { fontSize: 13, fontWeight: '700' },
  notifBubbleRowBody: { fontSize: 11, lineHeight: 15 },
  notifBubbleTime: { fontSize: 10, fontWeight: '600' },
  notifBubbleDot: { borderRadius: 4, height: 8, width: 8 },
  notifBubbleMarkAll: { fontSize: 12, fontWeight: '600' },
  notifDetailPopup: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
    zIndex: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  notifDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  notifDetailIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  notifDetailTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  notifDetailBody: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  notifDetailTime: { fontSize: 12, fontWeight: '600', marginBottom: 14 },
  notifDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  notifDetailButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  summaryCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1 },
  summaryMetric: { flex: 1, gap: 6 },
  summaryChevron: { justifyContent: 'center', paddingLeft: 4 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '900' },
  searchBar: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  controlsRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  statusDropdownTrigger: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  statusDropdownLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  filterList: { gap: 8 },
  filterBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterBtnBadge: { color: '#fff', fontSize: 12, fontWeight: '800' },
  clearFilters: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  clearFiltersRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  resultsCount: { fontSize: 13, fontWeight: '600' },
  clearFiltersBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  clearFiltersBtnText: { fontSize: 12, fontWeight: '700' },
  skeletonCard: { gap: 14 },
  loadMoreFooter: { alignItems: 'center', gap: 10, marginTop: 8, paddingBottom: 32, paddingTop: 4 },
  loadMoreText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  batchResolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  batchResolveBtnText: { fontSize: 13, fontWeight: '700', flex: 1 },
  footerBar: { marginTop: tokens.spacing.xl },
  fabMenu: {
    position: 'absolute',
    right: tokens.spacing.lg,
    width: 230,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 50,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fabMenuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabMenuLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
});
