import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { getCountryFlagEmoji } from '../../utils/sportAssets';
import { PressableScale } from './PressableScale';

export interface DropdownItem {
  label: string;
  value: string;
  subtitle?: string;
  country?: string;
  imageUrl?: string | null;
}

export interface DropdownSection {
  title: string;
  country?: string;
  subtitle?: string;
  data: DropdownItem[];
}

export interface SearchableDropdownProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  items?: DropdownItem[];
  sections?: DropdownSection[];
  renderLeft?: (value: string) => React.ReactNode;
  renderItemLeft?: (item: DropdownItem) => React.ReactNode;
  onSelect: (value: string) => void | boolean;
  isLoading?: boolean;
  /** When true, a "Usar '{search}'" row is shown so the user can confirm any free-text value */
  allowCustomValue?: boolean;
  /** Enable multi-select mode. Use selectedValues + onSelectMultiple instead of onSelect. */
  multiSelect?: boolean;
  selectedValues?: string[];
  onSelectMultiple?: (values: string[]) => void;
  /**
   * When set, sections or the flat list initially show only this many items.
   * A "Carregar mais" button reveals the rest. Search always shows all matches.
   */
  initialVisibleCount?: number;
  /** Optional content rendered between the search bar and the list (e.g. filter chips). */
  headerContent?: React.ReactNode;
}

export function SearchableDropdown(props: SearchableDropdownProps) {
  if (!props.visible) {
    return null;
  }

  return <VisibleSearchableDropdown {...props} />;
}

function VisibleSearchableDropdown({
  visible,
  onClose,
  title,
  items,
  sections,
  renderLeft,
  renderItemLeft,
  onSelect,
  isLoading,
  allowCustomValue,
  multiSelect,
  selectedValues,
  onSelectMultiple,
  initialVisibleCount,
  headerContent,
}: SearchableDropdownProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  // Per-section expanded state for sections mode ("Carregar mais")
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // Flat list visible count for items mode ("Carregar mais")
  const [flatVisible, setFlatVisible] = useState<number | undefined>(initialVisibleCount);

  const isSearching = search.trim().length > 0;

  // Reset visible count when modal opens / search changes
  useEffect(() => {
    if (visible) {
      setExpandedSections(new Set());
      setFlatVisible(initialVisibleCount);
    }
  }, [visible, initialVisibleCount]);

  useEffect(() => {
    if (isSearching) {
      // When searching, show everything
      setFlatVisible(undefined);
    } else {
      setFlatVisible(initialVisibleCount);
    }
  }, [isSearching, initialVisibleCount]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
    }
  }, [visible]);

  const filteredSections = useMemo(() => {
    if (!sections) return undefined;
    if (!search.trim()) return sections;
    const lower = search.toLowerCase();
    return sections
      .map((s) => ({ ...s, data: s.data.filter((i) => i.label.toLowerCase().includes(lower)) }))
      .filter((s) => s.data.length > 0);
  }, [sections, search]);

  // Section total counts (before slicing) for "Carregar mais" remaining count
  const sectionTotalCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSections ?? []) map.set(s.title, s.data.length);
    return map;
  }, [filteredSections]);

  // Sliced sections: only apply limit when NOT searching
  const displaySections = useMemo(() => {
    if (!filteredSections) return undefined;
    if (!initialVisibleCount || isSearching) return filteredSections;
    return filteredSections.map((s) => {
      if (expandedSections.has(s.title) || s.data.length <= initialVisibleCount) return s;
      return { ...s, data: s.data.slice(0, initialVisibleCount) };
    });
  }, [filteredSections, initialVisibleCount, expandedSections, isSearching]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items ?? [];
    const lower = search.toLowerCase();
    return (items ?? []).filter((item) => item.label.toLowerCase().includes(lower));
  }, [items, search]);

  // Visible flat items (apply limit when not searching)
  const displayItems = useMemo(() => {
    if (!items) return [];
    if (isSearching || !flatVisible) return filtered;
    return filtered.slice(0, flatVisible);
  }, [filtered, items, isSearching, flatVisible]);

  const flatHasMore = !isSearching && flatVisible !== undefined && filtered.length > flatVisible;
  const flatRemaining = filtered.length - (flatVisible ?? 0);

  const noResults = sections ? (filteredSections?.length === 0) : filtered.length === 0;

  const renderRow = (item: DropdownItem) => {
    const isSelected = multiSelect && selectedValues?.includes(item.value);
    return (
      <PressableScale
        key={item.value}
        onPress={() => {
          if (multiSelect && onSelectMultiple && selectedValues !== undefined) {
            const next = isSelected
              ? selectedValues.filter((v) => v !== item.value)
              : [...selectedValues, item.value];
            onSelectMultiple(next);
          } else {
            const accepted = onSelect(item.value);
            if (accepted !== false) {
              onClose();
            }
          }
        }}
        style={[
          styles.dropdownRow,
          { borderColor: colors.border },
          isSelected && { backgroundColor: `${colors.primary}18` },
        ]}
      >
        {renderItemLeft ? renderItemLeft(item) : renderLeft ? renderLeft(item.value) : null}
        <View style={styles.rowTextWrap}>
          <View style={styles.rowTitleWrap}>
            {item.country ? (
              <Text style={styles.dropdownRowFlag}>{getCountryFlagEmoji(item.country)}</Text>
            ) : null}
            <Text style={[styles.dropdownRowText, { color: colors.textPrimary }]}>{item.label}</Text>
          </View>
          {item.subtitle ? (
            <Text style={[styles.dropdownRowSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
          ) : null}
        </View>
        {multiSelect ? (
          isSelected ? (
            <Ionicons color={colors.primary} name="checkmark-circle" size={20} />
          ) : (
            <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
          )
        ) : null}
      </PressableScale>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
        <Animated.View entering={SlideInDown.springify().damping(22).stiffness(280)} exiting={SlideOutDown.duration(220)} style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons color={colors.textSecondary} name="close" size={24} />
            </Pressable>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
            <TextInput
              placeholder="Pesquisar..."
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

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <Text style={{ color: colors.textSecondary }}>A carregar...</Text>
            </View>
          ) : (
            <>
              {/* Filter chips / custom header injected by caller */}
              {headerContent ?? null}

              {/* Custom value row — always shown when allowCustomValue and search has text */}
              {allowCustomValue && search.trim() ? (
                <PressableScale
                  onPress={() => {
                    const accepted = onSelect(search.trim());
                    if (accepted !== false) {
                      onClose();
                    }
                  }}
                  style={[styles.customValueRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.primary }]}
                >
                  <Ionicons color={colors.primary} name="create-outline" size={16} />
                  <Text style={[styles.customValueText, { color: colors.primary }]}>
                    Usar &quot;{search.trim()}&quot;
                  </Text>
                </PressableScale>
              ) : null}

              {noResults && !allowCustomValue ? (
                <View style={styles.loadingWrap}>
                  <Text style={{ color: colors.textMuted }}>Nenhum resultado</Text>
                </View>
              ) : noResults && allowCustomValue && !search.trim() ? (
                <View style={styles.loadingWrap}>
                  <Text style={{ color: colors.textMuted }}>Escreve o nome da equipa acima</Text>
                </View>
              ) : sections ? (
                <SectionList
                  sections={displaySections ?? sections}
                  keyExtractor={(item) => item.value}
                  renderSectionHeader={({ section }) => (
                    <View style={[styles.sectionHeader, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        {section.country ? `${getCountryFlagEmoji(section.country)} ` : ''}{section.title}
                      </Text>
                      {section.subtitle ? (
                        <Text style={[styles.sectionHeaderSubtitle, { color: colors.textMuted }]}>{section.subtitle}</Text>
                      ) : null}
                    </View>
                  )}
                  renderSectionFooter={({ section }) => {
                    if (!initialVisibleCount || isSearching || expandedSections.has(section.title)) return null;
                    const total = sectionTotalCounts.get(section.title) ?? 0;
                    const remaining = total - initialVisibleCount;
                    if (remaining <= 0) return null;
                    return (
                      <PressableScale
                        onPress={() => setExpandedSections((prev) => new Set([...prev, section.title]))}
                        style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                      >
                        <Ionicons color={colors.primary} name="chevron-down-circle-outline" size={15} />
                        <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                          Carregar mais ({remaining} mais)
                        </Text>
                      </PressableScale>
                    );
                  }}
                  renderItem={({ item }) => renderRow(item)}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={4}
                />
              ) : (
                <FlatList
                  data={displayItems}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => renderRow(item)}
                  ListFooterComponent={
                    flatHasMore ? (
                      <PressableScale
                        onPress={() => setFlatVisible((prev) => (prev ?? 0) + (initialVisibleCount ?? 20))}
                        style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                      >
                        <Ionicons color={colors.primary} name="chevron-down-circle-outline" size={15} />
                        <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                          Carregar mais ({flatRemaining} mais)
                        </Text>
                      </PressableScale>
                    ) : undefined
                  }
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={4}
                />
              )}
            </>
          )}
          {multiSelect ? (
            <PressableScale
              onPress={onClose}
              style={[styles.doneBtn, { backgroundColor: colors.primary, marginBottom: insets.bottom || 16 }]}
            >
              <Text style={styles.doneBtnText}>
                Concluir{selectedValues && selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
              </Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    marginTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900' },
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
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  dropdownRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  rowTextWrap: {
    flex: 1,
    gap: 2,
  },
  rowTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dropdownRowFlag: { fontSize: 15 },
  dropdownRowText: { fontSize: 15, fontWeight: '500' },
  dropdownRowSubtitle: { fontSize: 12, fontWeight: '500' },
  uncheckCircle: {
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    width: 20,
  },
  doneBtn: {
    alignItems: 'center',
    borderRadius: 14,
    marginBottom: 16,
    marginTop: 8,
    paddingVertical: 14,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionHeader: { paddingHorizontal: 4, paddingVertical: 8 },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  sectionHeaderSubtitle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
  loadMoreBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginVertical: 4,
    paddingVertical: 10,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },
});
