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

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface CompetitionPickerItem {
  label: string;
  value: string;
  country?: string;
  subtitle?: string;
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
}

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

  // Initialise expanded set once when sections arrive
  if (!initialised && sections.length > 0) {
    const next = new Set<string>();
    // Always expand favourited countries
    for (const fav of favouritesQuery.data ?? []) {
      if (fav.type === FavouriteType.COUNTRY) next.add(fav.targetKey);
    }
    // Also expand countries containing favourited tournaments
    for (const section of sections) {
      const countryKey = section.country ?? section.title;
      for (const item of section.data) {
        if (isFavourite(FavouriteType.COMPETITION, item.value)) {
          next.add(countryKey);
          break;
        }
      }
    }
    // Expand top N that aren't already in the set
    let added = next.size;
    for (const section of sections) {
      if (added >= defaultExpandedCount) break;
      const countryKey = section.country ?? section.title;
      if (!next.has(countryKey)) {
        next.add(countryKey);
        added++;
      }
    }
    setExpandedCountries(next);
    setInitialised(true);
  }

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const lower = search.toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        data: s.data.filter((i) => i.label.toLowerCase().includes(lower)),
      }))
      .filter((s) => s.data.length > 0);
  }, [sections, search]);

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
    ({ item }: { item: CompetitionPickerItem & { _sectionCountry?: string } }) => {
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
            {item.subtitle ? (
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
    /** True when this header shows only non-starred competitions for a country whose starred ones float above */
    isRestSection?: boolean;
  };
  type ListItem =
    | HeaderItem
    | (CompetitionPickerItem & { _type: 'item'; key: string; _sectionCountry: string });

  const flatData = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];

    // Starred country keys
    const favCountryKeys = new Set<string>();
    const countryPrefix = `${FavouriteType.COUNTRY}::`;
    for (const key of favouriteKeys) {
      if (key.startsWith(countryPrefix)) {
        favCountryKeys.add(key.slice(countryPrefix.length));
      }
    }

    // For non-starred countries, split competitions into starred / rest
    const sectionFavItems = new Map<string, CompetitionPickerItem[]>();
    const sectionRestItems = new Map<string, CompetitionPickerItem[]>();
    for (const section of filteredSections) {
      const countryKey = section.country ?? section.title;
      if (favCountryKeys.has(countryKey)) continue;
      const favItems = section.data.filter((item) =>
        isFavourite(FavouriteType.COMPETITION, item.value),
      );
      if (favItems.length > 0) {
        sectionFavItems.set(countryKey, favItems);
        const rest = section.data.filter((item) => !isFavourite(FavouriteType.COMPETITION, item.value));
        if (rest.length > 0) sectionRestItems.set(countryKey, rest);
      }
    }

    const addedToGroupAB = new Set<string>();

    const pushSection = (
      section: CompetitionPickerSection,
      countryKey: string,
      expandKey: string,
      isExpanded: boolean,
      items: CompetitionPickerItem[],
      isRestSection?: boolean,
    ) => {
      result.push({
        _type: 'header',
        key: `header::${expandKey}`,
        expandKey,
        country: countryKey,
        title: section.title,
        subtitle: section.subtitle,
        count: section.data.length,
        isRestSection,
      });
      if (isExpanded) {
        for (const item of items) {
          result.push({ ...item, _type: 'item', key: `item::${item.value}`, _sectionCountry: countryKey });
        }
      }
    };

    // Group A: Starred countries — full list floated to top
    for (const section of filteredSections) {
      const countryKey = section.country ?? section.title;
      if (!favCountryKeys.has(countryKey)) continue;
      pushSection(section, countryKey, countryKey, isSearching || expandedCountries.has(countryKey), section.data);
      addedToGroupAB.add(countryKey);
    }

    // Group B: Countries with starred competitions (country itself not starred)
    //   → floated to top, expanded by default, showing ONLY the starred competitions
    for (const section of filteredSections) {
      const countryKey = section.country ?? section.title;
      if (addedToGroupAB.has(countryKey) || !sectionFavItems.has(countryKey)) continue;
      pushSection(
        section,
        countryKey,
        countryKey,
        isSearching || expandedCountries.has(countryKey),
        sectionFavItems.get(countryKey)!,
      );
      addedToGroupAB.add(countryKey);
    }

    // Group C: Remaining sections in original order
    //   For Group A countries: already fully rendered — skip
    //   For Group B countries: render a second entry with the non-starred competitions
    //   For others: render normally
    for (const section of filteredSections) {
      const countryKey = section.country ?? section.title;

      if (favCountryKeys.has(countryKey)) continue; // Group A handled above

      if (addedToGroupAB.has(countryKey)) {
        const restItems = sectionRestItems.get(countryKey);
        if (!restItems || restItems.length === 0) continue;
        const expandKey = `${countryKey}::rest`;
        pushSection(section, countryKey, expandKey, isSearching || expandedCountries.has(expandKey), restItems, true);
      } else {
        pushSection(section, countryKey, countryKey, isSearching || expandedCountries.has(countryKey), section.data);
      }
    }

    return result;
  }, [filteredSections, expandedCountries, isSearching, favouriteKeys, isFavourite]);

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
        const countryFav =
          !hideFavourites && sport && isFavourite(FavouriteType.COUNTRY, item.country);

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
              {item.country ? `${getCountryFlagEmoji(item.country)} ` : ''}
              {item.title}
              {hItem.isRestSection ? ' (outros)' : ''}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{item.count}</Text>
            {item.subtitle ? (
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                {item.subtitle}
              </Text>
            ) : null}
            {!hideFavourites && sport ? (
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleToggleFavourite(FavouriteType.COUNTRY, item.country);
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
              autoFocus
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
                  {expandedCountries.size >= allExpandKeys.length ? 'Fechar todos' : 'Abrir todos'}
                </Text>
              </Pressable>
            </View>
          )}

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
  doneBtn: {
    alignItems: 'center',
    borderRadius: 14,
    marginBottom: 16,
    marginTop: 8,
    paddingVertical: 14,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
