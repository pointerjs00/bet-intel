import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { getCountryFlagEmoji } from '../../utils/sportAssets';

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
  onSelect: (value: string) => void;
  isLoading?: boolean;
  /** When true, a "Usar '{search}'" row is shown so the user can confirm any free-text value */
  allowCustomValue?: boolean;
  /** Enable multi-select mode. Use selectedValues + onSelectMultiple instead of onSelect. */
  multiSelect?: boolean;
  selectedValues?: string[];
  onSelectMultiple?: (values: string[]) => void;
}

export function SearchableDropdown({
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
}: SearchableDropdownProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filteredSections = useMemo(() => {
    if (!sections) return undefined;
    if (!search.trim()) return sections;
    const lower = search.toLowerCase();
    return sections
      .map((s) => ({ ...s, data: s.data.filter((i) => i.label.toLowerCase().includes(lower)) }))
      .filter((s) => s.data.length > 0);
  }, [sections, search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items ?? [];
    const lower = search.toLowerCase();
    return (items ?? []).filter((item) => item.label.toLowerCase().includes(lower));
  }, [items, search]);

  const noResults = sections ? (filteredSections?.length === 0) : filtered.length === 0;

  const renderRow = (item: DropdownItem) => {
    const isSelected = multiSelect && selectedValues?.includes(item.value);
    return (
      <Pressable
        key={item.value}
        onPress={() => {
          if (multiSelect && onSelectMultiple && selectedValues !== undefined) {
            const next = isSelected
              ? selectedValues.filter((v) => v !== item.value)
              : [...selectedValues, item.value];
            onSelectMultiple(next);
          } else {
            onSelect(item.value);
            setSearch('');
            onClose();
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
          <Text style={[styles.dropdownRowText, { color: colors.textPrimary }]}>{item.label}</Text>
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
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons color={colors.textSecondary} name="close" size={24} />
            </Pressable>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <MaterialCommunityIcons color={colors.textMuted} name="magnify" size={18} />
            <TextInput
              autoFocus
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
              {/* Custom value row — always shown when allowCustomValue and search has text */}
              {allowCustomValue && search.trim() ? (
                <Pressable
                  onPress={() => { onSelect(search.trim()); setSearch(''); onClose(); }}
                  style={[styles.customValueRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.primary }]}
                >
                  <Ionicons color={colors.primary} name="create-outline" size={16} />
                  <Text style={[styles.customValueText, { color: colors.primary }]}>
                    Usar &quot;{search.trim()}&quot;
                  </Text>
                </Pressable>
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
                  sections={filteredSections ?? sections}
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
                  renderItem={({ item }) => renderRow(item)}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                />
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => renderRow(item)}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                />
              )}
            </>
          )}
        </View>
        {multiSelect ? (
          <Pressable
            onPress={() => { setSearch(''); onClose(); }}
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.doneBtnText}>
              Concluir{selectedValues && selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
            </Text>
          </Pressable>
        ) : null}
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
});
