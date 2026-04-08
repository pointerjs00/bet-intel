import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FavouriteType, Sport } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { CompetitionBadge } from './CompetitionBadge';
import { getCountryFlagEmoji } from '../../utils/sportAssets';
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

export function CompetitionPickerModal({
  visible,
  onClose,
  title = 'Competição',
  sections,
  sport,
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
  const [initialised, setInitialised] = useState(false);

  // Favourites
  const sportKey = sport ?? undefined;
  const favouritesQuery = useFavourites(sportKey);
  const toggleMutation = useToggleFavouriteMutation();

  const favouriteKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of favouritesQuery.data ?? []) {
      set.add(`${f.type}::${f.targetKey}`);
    }
    return set;
  }, [favouritesQuery.data]);

  const isFavourite = useCallback(
    (type: FavouriteType, key: string) => favouriteKeys.has(`${type}::${key}`),
    [favouriteKeys],
  );

  // Initialise expanded set once when sections arrive (reset when sport changes)
  const [initialisedForSport, setInitialisedForSport] = React.useState<Sport | string | undefined>(undefined);
  if ((!initialised || initialisedForSport !== sport) && sections.length > 0) {
    const next = new Set<string>();
    if (sport === Sport.FOOTBALL) {
      // Football: only the two virtual sections open by default; all country sections closed
      next.add('__top__');
      next.add('__favourites__');
    } else {
      // Other sports: open Favourites virtual section + top N countries
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
    setInitialisedForSport(sport);
    setInitialised(true);
  }

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const handleSelectItem = useCallback(
    (value: string) => {
      if (multiSelect && onSelectMultiple && selectedValues !== undefined) {
        const isSelected = selectedValues.includes(value);
        const next = isSelected
          ? selectedValues.filter((v) => v !== value)
          : [...selectedValues, value];
        onSelectMultiple(next);
      } else if (onSelect) {
        onSelect(value);
        setSearch('');
        onClose();
      }
    },
    [multiSelect, onSelectMultiple, selectedValues, onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: CompetitionPickerItem & { _sectionCountry?: string; _isVirtualSection?: boolean } }) => {
      const isSelected = multiSelect && selectedValues?.includes(item.value);
      const isFav = !hideFavourites && sport && isFavourite(FavouriteType.COMPETITION, item.value);

      return (
        <Pressable
          onPress={() => handleSelectItem(item.value)}
          style={[
            styles.row,
            { borderColor: colors.border },
            isSelected && { backgroundColor: `${colors.primary}18` },
          ]}
        >
          <CompetitionBadge name={item.value} size={22} />
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
          {!hideFavourites && sport ? (
            <Pressable
              hitSlop={8}
              onPress={() => handleToggleFavourite(FavouriteType.COMPETITION, item.value, item._sectionCountry)}
              style={styles.starBtn}
            >
              <Ionicons
                name={isFav ? 'star' : 'star-outline'}
                size={18}
                color={isFav ? colors.gold : colors.textMuted}
              />
            </Pressable>
          ) : null}
          {multiSelect ? (
            isSelected ? (
              <Ionicons color={colors.primary} name="checkmark-circle" size={20} />
            ) : (
              <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
            )
          ) : null}
        </Pressable>
      );
    },
    [multiSelect, selectedValues, hideFavourites, sport, isFavourite, colors, handleSelectItem, handleToggleFavourite],
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
    if (!isSearching) {
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
  }, [filteredSections, expandedCountries, isSearching, isFavourite, sport]);

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
          return (
            <Pressable
              onPress={() => toggleCountry(hItem.expandKey)}
              style={[styles.sectionHeader, styles.virtualSectionHeader, { backgroundColor: colors.surfaceRaised }]}
            >
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
            </Pressable>
          );
        }

        // ── Normal country / (Outros) section header ──
        const countryFav =
          !hideFavourites && sport && isFavourite(FavouriteType.COUNTRY, hItem.country);
        return (
          <Pressable
            onPress={() => toggleCountry(hItem.expandKey)}
            style={[styles.sectionHeader, { backgroundColor: colors.surfaceRaised }]}
          >
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
            {!hideFavourites && sport ? (
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleToggleFavourite(FavouriteType.COUNTRY, hItem.country);
                }}
                style={styles.starBtn}
              >
                <Ionicons
                  name={countryFav ? 'star' : 'star-outline'}
                  size={16}
                  color={countryFav ? colors.gold : colors.textMuted}
                />
              </Pressable>
            ) : null}
          </Pressable>
        );
      }
      return renderItem({ item });
    },
    [
      expandedCountries,
      isSearching,
      hideFavourites,
      sport,
      isFavourite,
      colors,
      toggleCountry,
      handleToggleFavourite,
      renderItem,
    ],
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={[styles.content, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons color={colors.textSecondary} name="close" size={24} />
            </Pressable>
          </View>

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
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  if (expandedCountries.size >= allExpandKeys.length) {
                    setExpandedCountries(new Set());
                  } else {
                    setExpandedCountries(new Set(allExpandKeys));
                  }
                }}
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
              </Pressable>
            </View>
          )}

          {/* Custom value row when allowCustomValue and search has text */}
          {allowCustomValue && search.trim() ? (
            <Pressable
              onPress={() => {
                if (onSelect) {
                  onSelect(search.trim());
                  setSearch('');
                  onClose();
                }
              }}
              style={[styles.customValueRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.primary }]}
            >
              <Ionicons color={colors.primary} name="create-outline" size={16} />
              <Text style={[styles.customValueText, { color: colors.primary }]}>
                Usar &quot;{search.trim()}&quot;
              </Text>
            </Pressable>
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
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              initialNumToRender={30}
              maxToRenderPerBatch={20}
              windowSize={7}
            />
          )}
        </View>

        {/* Done button for multi-select */}
        {multiSelect ? (
          <Pressable
            onPress={() => {
              setSearch('');
              onClose();
            }}
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.doneBtnText}>
              Concluir
              {selectedValues && selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
    paddingTop: 16,
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
});
