import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  GestureResponderEvent,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { FavouriteType, Sport } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { CompetitionBadge } from './CompetitionBadge';
import { getCountryFlagEmoji, getLeagueLogoUrl } from '../../utils/sportAssets';
import { useFavourites, useToggleFavouriteMutation } from '../../services/favouritesService';
import { hapticLight } from '../../utils/haptics';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface CompetitionPickerItem {
  label: string;
  value: string;
  country?: string;
  subtitle?: string;
  /** Competition tier — used for football tier-1 vs tier-2+ split */
  tier?: number;
}

export interface CompetitionPickerSection {
  title: string;
  country?: string;
  subtitle?: string;
  data: CompetitionPickerItem[];
}

interface CompetitionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  sections: CompetitionPickerSection[];
  sport?: Sport;
  preloadWhenHidden?: boolean;
  /** Multi-select mode */
  multiSelect?: boolean;
  selectedValues?: string[];
  onSelectMultiple?: (values: string[]) => void;
  /** Single-select mode */
  onSelect?: (value: string) => void;
  /** Number of top sections to expand by default (default 10) */
  defaultExpandedCount?: number;
  /** Hide favourite star buttons */
  hideFavourites?: boolean;
  /** When true, a "Usar '{search}'" row is shown so the user can enter any free-text competition */
  allowCustomValue?: boolean;
}

export function CompetitionPickerModal(props: CompetitionPickerModalProps) {
  if (!props.visible && !props.preloadWhenHidden) {
    return null;
  }

  return <VisibleCompetitionPickerModal {...props} />;
}

/** Football competitions pinned to the "Top Competições" virtual section. */
const FOOTBALL_TOP_COMP_NAMES: ReadonlyArray<string> = [
  'Liga Portugal Betclic',
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'UEFA Champions League',
  'UEFA Europa League',
  'UEFA Conference League',
];
const FOOTBALL_TOP_COMP_SET = new Set(FOOTBALL_TOP_COMP_NAMES);

/** Top-10 countries to expand by default when no favourite data is available. */
const DEFAULT_TOP_COUNTRIES = 10;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ScalePressableProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  pressedScale?: number;
}

function ScalePressable({
  children,
  style,
  pressedOpacity = 0.96,
  pressedScale = 0.985,
  onPressIn,
  onPressOut,
  ...props
}: ScalePressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    scale.value = withSpring(pressedScale, { damping: 20, stiffness: 320, mass: 0.7 });
    opacity.value = withTiming(pressedOpacity, { duration: 90 });
    onPressIn?.(event);
  }, [onPressIn, opacity, pressedOpacity, pressedScale, scale]);

  const handlePressOut = useCallback((event: GestureResponderEvent) => {
    scale.value = withSpring(1, { damping: 18, stiffness: 260, mass: 0.7 });
    opacity.value = withTiming(1, { duration: 120 });
    onPressOut?.(event);
  }, [onPressOut, opacity, scale]);

  return (
    <AnimatedPressable
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

interface FavouriteStarButtonProps {
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: (event: GestureResponderEvent) => void;
  size?: number;
}

function FavouriteStarButton({
  active,
  activeColor,
  inactiveColor,
  onPress,
  size = 18,
}: FavouriteStarButtonProps) {
  const pop = useSharedValue(0);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + pop.value * 0.28 },
      { rotate: `${pop.value * (active ? -10 : 12)}deg` },
    ],
  }));

  const handlePress = useCallback((event: GestureResponderEvent) => {
    pop.value = 0;
    pop.value = withSequence(
      withTiming(1, { duration: 110 }),
      withSpring(0, { damping: 11, stiffness: 220, mass: 0.7 }),
    );
    onPress(event);
  }, [onPress, pop]);

  return (
    <ScalePressable
      android_ripple={Platform.OS === 'android' ? { color: `${active ? activeColor : inactiveColor}22`, borderless: true, radius: 18 } : undefined}
      hitSlop={8}
      onPress={handlePress}
      pressedOpacity={0.82}
      pressedScale={0.84}
      style={styles.starBtn}
    >
      <Animated.View style={animatedIconStyle}>
        <Ionicons
          color={active ? activeColor : inactiveColor}
          name={active ? 'star' : 'star-outline'}
          size={size}
        />
      </Animated.View>
    </ScalePressable>
  );
}

function VisibleCompetitionPickerModal({
  visible,
  onClose,
  title = 'Competição',
  sections,
  sport,
  preloadWhenHidden = false,
  multiSelect,
  selectedValues,
  onSelectMultiple,
  onSelect,
  defaultExpandedCount = DEFAULT_TOP_COUNTRIES,
  hideFavourites,
  allowCustomValue,
}: CompetitionPickerModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [localSelected, setLocalSelected] = useState<Set<string>>(() => new Set(selectedValues ?? []));
  const initialisedRef = React.useRef(false);
  const initialisedSportRef = React.useRef<Sport | string | undefined>(undefined);
  const favouriteFeaturesEnabled = Boolean(sport) && !hideFavourites;

  const sheetTranslateY = useSharedValue(320);
  const sheetOpacity = useSharedValue(0);
  useEffect(() => {
    sheetTranslateY.value = withSpring(0, { damping: 28, stiffness: 180, mass: 1.1 });
    sheetOpacity.value = withTiming(1, { duration: 240 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));
  const dismissGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) sheetTranslateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) {
        sheetTranslateY.value = withTiming(800, { duration: 220 }, () => runOnJS(onClose)());
      } else {
        sheetTranslateY.value = withSpring(0, { damping: 28, stiffness: 180, mass: 1.1 });
      }
    });

  // Keep local selection in sync when parent updates (e.g. on open)
  useEffect(() => {
    setLocalSelected(new Set(selectedValues ?? []));
  }, [selectedValues]);

  // Favourites
  const sportKey = sport ?? undefined;
  const favouritesQuery = useFavourites(sportKey, { enabled: favouriteFeaturesEnabled });
  const toggleMutation = useToggleFavouriteMutation();

  const favouriteKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of favouritesQuery.data ?? []) {
      set.add(`${f.type}::${f.targetKey}`);
    }
    return set;
  }, [favouritesQuery.data]);

  const prefetchedLogoUrisRef = React.useRef<Set<string>>(new Set());

  const isFavourite = useCallback(
    (type: FavouriteType, key: string) => favouriteKeys.has(`${type}::${key}`),
    [favouriteKeys],
  );

  useEffect(() => {
    if (!visible) {
      setSearch('');
    }
  }, [visible]);

  useEffect(() => {
    const shouldPrepare = visible || preloadWhenHidden;

    if (!shouldPrepare) {
      initialisedRef.current = false;
      initialisedSportRef.current = undefined;
      setExpandedCountries(new Set());
      return;
    }

    if (sections.length === 0) {
      return;
    }

    if (initialisedRef.current && initialisedSportRef.current === sport) {
      return;
    }

    const next = new Set<string>();
    if (sport === Sport.FOOTBALL) {
      // Football: only the two virtual sections open by default; all country sections closed
      next.add('__top__');
      if (favouriteFeaturesEnabled) {
        next.add('__favourites__');
      }
    } else {
      // Other sports: open Favourites virtual section + top N countries
      if (favouriteFeaturesEnabled) {
        next.add('__favourites__');
        for (const fav of favouritesQuery.data ?? []) {
          if (fav.type === FavouriteType.COUNTRY) next.add(fav.targetKey);
        }
        for (const section of sections) {
          const countryKey = section.country ?? section.title;
          for (const item of section.data) {
            if (isFavourite(FavouriteType.COMPETITION, item.value)) {
              next.add(countryKey);
              break;
            }
          }
        }
      }
      let added = next.size;
      for (const section of sections) {
        if (added >= defaultExpandedCount) break;
        const countryKey = section.country ?? section.title;
        if (!next.has(countryKey)) {
          next.add(countryKey);
          added++;
        }
      }
    }

    setExpandedCountries(next);
    initialisedSportRef.current = sport;
    initialisedRef.current = true;
  }, [defaultExpandedCount, favouriteFeaturesEnabled, favouritesQuery.data, isFavourite, preloadWhenHidden, sections, sport, visible]);

  const prefetchedLogoUris = useMemo(() => {
    const names: string[] = [];

    if (sport === Sport.FOOTBALL) {
      const availableNames = new Set<string>();
      for (const section of sections) {
        for (const item of section.data) {
          availableNames.add(item.value);
        }
      }

      for (const topCompetitionName of FOOTBALL_TOP_COMP_NAMES) {
        if (availableNames.has(topCompetitionName)) {
          names.push(topCompetitionName);
        }
      }
    } else {
      for (const section of sections) {
        for (const item of section.data) {
          names.push(item.value);
          if (names.length >= 12) {
            break;
          }
        }
        if (names.length >= 12) {
          break;
        }
      }
    }

    return names
      .map((name) => getLeagueLogoUrl(name))
      .filter((uri): uri is string => Boolean(uri));
  }, [sections, sport]);

  useEffect(() => {
    for (const uri of prefetchedLogoUris) {
      if (prefetchedLogoUrisRef.current.has(uri)) {
        continue;
      }

      prefetchedLogoUrisRef.current.add(uri);
      void Image.prefetch(uri);
    }
  }, [prefetchedLogoUris]);

  // Filter sections by search; for football always sort A-Z (Top comps handled by virtual section)
  const filteredSections = useMemo(() => {
    const lower = search.trim().toLowerCase();
    let result: CompetitionPickerSection[] = lower
      ? sections
          .map((s) => ({ ...s, data: s.data.filter((i) => i.label.toLowerCase().includes(lower)) }))
          .filter((s) => s.data.length > 0)
      : sections;
    if (sport === Sport.FOOTBALL) {
      result = [...result].sort((a, b) =>
        (a.country ?? a.title).localeCompare(b.country ?? b.title, 'pt'),
      );
    }
    return result;
  }, [sections, search, sport]);

  // When searching, expand all matching sections
  const isSearching = search.trim().length > 0;

  const toggleCountry = useCallback((country: string) => {
    hapticLight();
    LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) {
        next.delete(country);
      } else {
        next.add(country);
      }
      return next;
    });
  }, []);

  const handleToggleFavourite = useCallback(
    (type: FavouriteType, targetKey: string, countryKey?: string) => {
      if (!sport) return;
      hapticLight();
      const isCurrentlyFav = isFavourite(type, targetKey);
      toggleMutation.mutate({ type, sport, targetKey });
      // Auto-expand the country when starring a tournament so it appears expanded at top
      if (!isCurrentlyFav && type === FavouriteType.COMPETITION && countryKey) {
        LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
        setExpandedCountries((prev) => {
          if (prev.has(countryKey)) return prev;
          const next = new Set(prev);
          next.add(countryKey);
          return next;
        });
      }
    },
    [sport, toggleMutation, isFavourite],
  );

  const handleSingleSelect = useCallback(
    (value: string) => {
      if (!onSelect) return;
      onClose();
      startTransition(() => { onSelect(value); });
    },
    [onClose, onSelect],
  );

  const handleSelectItem = useCallback(
    (value: string) => {
      hapticLight();
      if (multiSelect && onSelectMultiple && selectedValues !== undefined) {
        const isCurrentlySelected = localSelected.has(value);
        const next = isCurrentlySelected
          ? selectedValues.filter((v) => v !== value)
          : [...selectedValues, value];
        setLocalSelected(new Set(next));
        onSelectMultiple(next);
      } else {
        handleSingleSelect(value);
      }
    },
    [handleSingleSelect, localSelected, multiSelect, onSelectMultiple, selectedValues],
  );

  const renderItem = useCallback(
    ({ item }: { item: CompetitionPickerItem & { _sectionCountry?: string; _isVirtualSection?: boolean } }) => {
      const isSelected = multiSelect && localSelected.has(item.value);
      const isFav = favouriteFeaturesEnabled && isFavourite(FavouriteType.COMPETITION, item.value);

      const rowChildren = (
        <>
          <CompetitionBadge country={item._sectionCountry} name={item.value} size={22} />
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{item.label}</Text>
            {item._isVirtualSection && item._sectionCountry ? (
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                {getCountryFlagEmoji(item._sectionCountry)} {item._sectionCountry}
              </Text>
            ) : item.subtitle ? (
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
            ) : null}
          </View>
          {favouriteFeaturesEnabled ? (
            <FavouriteStarButton
              active={Boolean(isFav)}
              activeColor={colors.gold}
              inactiveColor={colors.textMuted}
              onPress={(event) => {
                event.stopPropagation?.();
                handleToggleFavourite(FavouriteType.COMPETITION, item.value, item._sectionCountry);
              }}
            />
          ) : null}
          {multiSelect ? (
            isSelected ? (
              <Ionicons color={colors.primary} name="checkmark-circle" size={20} />
            ) : (
              <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
            )
          ) : null}
        </>
      );

      return (
        <ScalePressable
          android_ripple={Platform.OS === 'android' ? { color: `${colors.primary}16` } : undefined}
          onPress={() => handleSelectItem(item.value)}
          pressedOpacity={0.92}
          pressedScale={0.992}
          style={[
            styles.row,
            { borderColor: colors.border },
            isSelected && { backgroundColor: `${colors.primary}18` },
          ]}
        >
          {rowChildren}
        </ScalePressable>
      );
    },
    [colors, favouriteFeaturesEnabled, handleSelectItem, handleToggleFavourite, isFavourite, localSelected, multiSelect],
  );

  // Build a flat list with section headers interspersed for better performance than SectionList
  type HeaderItem = {
    _type: 'header';
    key: string;
    country: string;
    /** Key used for expand/collapse state — differs from country for "rest" sections */
    expandKey: string;
    title: string;
    subtitle?: string;
    count: number;
    /** Virtual section variant — renders differently (no flag, accent colour) */
    headerVariant?: 'top' | 'favourites';
  };
  type ListItem =
    | HeaderItem
    | (CompetitionPickerItem & { _type: 'item'; key: string; _sectionCountry: string; _isVirtualSection?: boolean });

  const flatData = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    const isFootball = sport === Sport.FOOTBALL;

    // ─── 1. TOP COMPETITIONS (football only, hidden during search to avoid duplicate rows) ───
    if (isFootball && !isSearching) {
      const topItems: (CompetitionPickerItem & { _countryKey: string })[] = [];
      for (const section of filteredSections) {
        const countryKey = section.country ?? section.title;
        for (const item of section.data) {
          if (FOOTBALL_TOP_COMP_SET.has(item.value)) topItems.push({ ...item, _countryKey: countryKey });
        }
      }
      // Preserve the canonical order defined in FOOTBALL_TOP_COMP_NAMES
      topItems.sort(
        (a, b) => FOOTBALL_TOP_COMP_NAMES.indexOf(a.value) - FOOTBALL_TOP_COMP_NAMES.indexOf(b.value),
      );
      if (topItems.length > 0) {
        const isTopExp = expandedCountries.has('__top__');
        result.push({
          _type: 'header',
          key: 'header::__top__',
          expandKey: '__top__',
          country: '',
          title: 'Top Competições',
          count: topItems.length,
          headerVariant: 'top',
        } as HeaderItem);
        if (isTopExp) {
          for (const item of topItems) {
            result.push({ ...item, _type: 'item', key: `top::${item.value}`, _sectionCountry: item._countryKey, _isVirtualSection: true });
          }
        }
      }
    }

    // ─── 2. FAVOURITES (starred comps not in top list, hidden during search) ───
    if (favouriteFeaturesEnabled && !isSearching) {
      const seen = new Set<string>();
      const favItems: (CompetitionPickerItem & { sectionCountry: string })[] = [];
      for (const section of filteredSections) {
        const countryKey = section.country ?? section.title;
        for (const item of section.data) {
          if (
            isFavourite(FavouriteType.COMPETITION, item.value) &&
            !(isFootball && FOOTBALL_TOP_COMP_SET.has(item.value)) &&
            !seen.has(item.value)
          ) {
            favItems.push({ ...item, sectionCountry: countryKey });
            seen.add(item.value);
          }
        }
      }
      if (favItems.length > 0) {
        const isFavExp = expandedCountries.has('__favourites__');
        result.push({
          _type: 'header',
          key: 'header::__favourites__',
          expandKey: '__favourites__',
          country: '',
          title: 'Favoritos',
          count: favItems.length,
          headerVariant: 'favourites',
        } as HeaderItem);
        if (isFavExp) {
          for (const item of favItems) {
            result.push({ ...item, _type: 'item', key: `fav::${item.value}`, _sectionCountry: item.sectionCountry, _isVirtualSection: true });
          }
        }
      }
    }

    // ─── 3. COUNTRY SECTIONS (A-Z for football, original order for others) ───
    for (const section of filteredSections) {
      const countryKey = section.country ?? section.title;
      if (section.data.length === 0) continue;

      if (!isFootball) {
        const isExp = isSearching || expandedCountries.has(countryKey);
        result.push({
          _type: 'header',
          key: `header::${countryKey}`,
          expandKey: countryKey,
          country: countryKey,
          title: section.title,
          subtitle: section.subtitle,
          count: section.data.length,
        } as HeaderItem);
        if (isExp) {
          for (const item of section.data) {
            result.push({ ...item, _type: 'item', key: `ctry::${countryKey}::${item.value}`, _sectionCountry: countryKey });
          }
        }
      } else {
        // Football: single merged section per country
        const isExp = isSearching || expandedCountries.has(countryKey);
        result.push({
          _type: 'header',
          key: `header::${countryKey}`,
          expandKey: countryKey,
          country: countryKey,
          title: section.title,
          count: section.data.length,
        } as HeaderItem);
        if (isExp) {
          for (const item of section.data) {
            result.push({ ...item, _type: 'item', key: `ctry::${countryKey}::${item.value}`, _sectionCountry: countryKey });
          }
        }
      }
    }

    return result;
  }, [expandedCountries, favouriteFeaturesEnabled, filteredSections, isSearching, isFavourite, sport]);

  /** All expand-keys present in the current flat list (used for toggle-all) */
  const allExpandKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of flatData) {
      if (item._type === 'header') keys.push((item as HeaderItem).expandKey);
    }
    return keys;
  }, [flatData]);

  const renderFlatItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item._type === 'header') {
        const hItem = item as HeaderItem;
        const isExpanded = isSearching || expandedCountries.has(hItem.expandKey);

        // ── Virtual sections: Top Competições / Favoritos ──
        if (hItem.headerVariant === 'top' || hItem.headerVariant === 'favourites') {
          const isTop = hItem.headerVariant === 'top';
          const accentColor = isTop ? colors.primary : colors.gold;
          const headerChildren = (
            <>
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={accentColor}
              />
              {isTop ? (
                <MaterialCommunityIcons name="trophy" size={13} color={accentColor} />
              ) : (
                <Ionicons name="star" size={13} color={accentColor} />
              )}
              <Text style={[styles.sectionHeaderText, { color: accentColor }]}>
                {hItem.title}
              </Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{hItem.count}</Text>
            </>
          );

          return (
            <ScalePressable
              android_ripple={Platform.OS === 'android' ? { color: `${accentColor}22` } : undefined}
              onPress={() => toggleCountry(hItem.expandKey)}
              pressedOpacity={0.93}
              pressedScale={0.988}
              style={[styles.sectionHeader, styles.virtualSectionHeader, { backgroundColor: colors.surfaceRaised }]}
            >
              {headerChildren}
            </ScalePressable>
          );
        }

        // ── Normal country / (Outros) section header ──
        const countryFav = favouriteFeaturesEnabled && isFavourite(FavouriteType.COUNTRY, hItem.country);
        const headerChildren = (
          <>
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}> 
              {hItem.country ? `${getCountryFlagEmoji(hItem.country)} ` : ''}
              {hItem.title}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{hItem.count}</Text>
            {hItem.subtitle ? (
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                {hItem.subtitle}
              </Text>
            ) : null}
            {favouriteFeaturesEnabled ? (
              <FavouriteStarButton
                active={Boolean(countryFav)}
                activeColor={colors.gold}
                inactiveColor={colors.textMuted}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handleToggleFavourite(FavouriteType.COUNTRY, hItem.country);
                }}
                size={16}
              />
            ) : null}
          </>
        );

        return (
          <ScalePressable
            android_ripple={Platform.OS === 'android' ? { color: `${colors.primary}18` } : undefined}
            onPress={() => toggleCountry(hItem.expandKey)}
            pressedOpacity={0.93}
            pressedScale={0.988}
            style={[styles.sectionHeader, { backgroundColor: colors.surfaceRaised }]}
          >
            {headerChildren}
          </ScalePressable>
        );
      }
      return renderItem({ item });
    },
    [
      expandedCountries,
      isSearching,
      isFavourite,
      colors,
      toggleCountry,
      handleToggleFavourite,
      favouriteFeaturesEnabled,
      renderItem,
    ],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  return (
    <Modal
      visible={visible}
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <Animated.View style={[styles.content, { backgroundColor: colors.background }, sheetStyle]}>
            <GestureDetector gesture={dismissGesture}>
              <View>
                <View style={styles.dragHandle}>
                  <View style={[styles.dragHandlePill, { backgroundColor: colors.border }]} />
                </View>
                {/* Header */}
                <View style={styles.header}>
                  <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
                  <Pressable hitSlop={10} onPress={onClose}>
                    <Ionicons color={colors.textSecondary} name="close" size={24} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

          {/* Search */}
          <View
            style={[
              styles.searchWrap,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
            <TextInput
              placeholder="Pesquisar competição..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons color={colors.textMuted} name="close-circle" size={16} />
              </Pressable>
            ) : null}
          </View>

          {/* Expand/Collapse all */}
          {!isSearching && sections.length > 1 && (
            <View style={styles.toggleAllRow}>
              <ScalePressable
                onPress={() => {
                  LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
                  if (expandedCountries.size >= allExpandKeys.length) {
                    setExpandedCountries(new Set());
                  } else {
                    setExpandedCountries(new Set(allExpandKeys));
                  }
                }}
                pressedOpacity={0.92}
                pressedScale={0.97}
                style={styles.toggleAllBtn}
              >
                <Ionicons
                  name={
                    expandedCountries.size >= allExpandKeys.length
                      ? 'contract-outline'
                      : 'expand-outline'
                  }
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.toggleAllText, { color: colors.primary }]}>
                  {expandedCountries.size >= allExpandKeys.length ? 'Recolher tudo' : 'Expandir tudo'}
                </Text>
              </ScalePressable>
            </View>
          )}

          {/* Custom value row when allowCustomValue and search has text */}
          {allowCustomValue && search.trim() ? (
            <ScalePressable
              onPress={() => {
                const value = search.trim();
                if (value) {
                  hapticLight();
                  handleSingleSelect(value);
                }
              }}
              pressedOpacity={0.92}
              pressedScale={0.982}
              style={[styles.customValueRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.primary }]}
            >
              <Ionicons color={colors.primary} name="create-outline" size={16} />
              <Text style={[styles.customValueText, { color: colors.primary }]}>
                Usar &quot;{search.trim()}&quot;
              </Text>
            </ScalePressable>
          ) : null}

          {/* List */}
          {filteredSections.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ color: colors.textMuted }}>Nenhum resultado</Text>
            </View>
          ) : (
            <FlatList
              data={flatData}
              keyExtractor={keyExtractor}
              renderItem={renderFlatItem}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              updateCellsBatchingPeriod={16}
              windowSize={10}
            />
          )}
          </Animated.View>

          {/* Done button for multi-select */}
          {multiSelect ? (
            <ScalePressable
              onPress={() => {
                setSearch('');
                onClose();
              }}
              pressedOpacity={0.92}
              pressedScale={0.98}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.doneBtnText}>
                Concluir
                {selectedValues && selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
              </Text>
            </ScalePressable>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    marginTop: 60,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  toggleAllRow: { alignItems: 'flex-end', marginBottom: 4, paddingHorizontal: 4 },
  toggleAllBtn: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingVertical: 4 },
  toggleAllText: { fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  virtualSectionHeader: {
    marginTop: 8,
  },
  sectionHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionCount: { fontSize: 11, fontWeight: '600' },
  sectionSubtitle: { fontSize: 11, fontWeight: '600', marginLeft: 4 },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  rowTextWrap: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  rowSubtitle: { fontSize: 11, fontWeight: '500' },
  starBtn: { padding: 4 },
  uncheckCircle: {
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    width: 20,
  },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  customValueRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  customValueText: { flex: 1, fontSize: 15, fontWeight: '700' },
  doneBtn: {
    alignItems: 'center',
    borderRadius: 14,
    marginBottom: 16,
    marginTop: 8,
    paddingVertical: 14,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dragHandle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  dragHandlePill: { borderRadius: 2, height: 4, width: 36 },
});
