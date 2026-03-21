import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { ItemResult } from '@betintel/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { BoletinItem as BoletinSelectionRow } from '../../components/boletins/BoletinItem';
import { OddsCalculator } from '../../components/boletins/OddsCalculator';
import { StakeInput } from '../../components/boletins/StakeInput';
import { boletinQueryKeys } from '../../services/boletinService';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';

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
  const totalOdds = useBoletinBuilderStore((state) => state.totalOdds);
  const potentialReturn = useBoletinBuilderStore((state) => state.potentialReturn);
  const removeItem = useBoletinBuilderStore((state) => state.removeItem);
  const setStake = useBoletinBuilderStore((state) => state.setStake);
  const setName = useBoletinBuilderStore((state) => state.setName);
  const setNotes = useBoletinBuilderStore((state) => state.setNotes);
  const setPublic = useBoletinBuilderStore((state) => state.setPublic);
  const reset = useBoletinBuilderStore((state) => state.reset);
  const save = useBoletinBuilderStore((state) => state.save);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ title: 'Novo boletin' }} />
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
            <View style={styles.topRow}>
              <View style={styles.titleBlock}>
                <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Construtor</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Fecha o boletin com stake, notas e visibilidade.</Text>
              </View>

              <Pressable hitSlop={10} onPress={reset}>
                <Ionicons color={colors.danger} name="refresh-outline" size={22} />
              </Pressable>
            </View>

            <OddsCalculator potentialReturn={potentialReturn} stake={stake} totalOdds={totalOdds} />

            <StakeInput onChange={setStake} value={stake} />

            <Input label="Nome" onChangeText={setName} placeholder="Liga Portugal Domingo" value={name} />
            <Input label="Notas" multiline onChangeText={setNotes} placeholder="Notas opcionais" value={notes} />

            <View style={[styles.publicRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.publicTextWrap}>
                <Text style={[styles.publicTitle, { color: colors.textPrimary }]}>Tornar boletin público</Text>
                <Text style={[styles.publicSubtitle, { color: colors.textSecondary }]}>Permite mostrar este boletin no teu perfil e em futuras partilhas.</Text>
              </View>
              <Switch onValueChange={setPublic} value={isPublic} />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seleções</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>O boletin está vazio</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Abre o detalhe de um evento e toca numa odd para adicionares seleções.</Text>
            <Button onPress={() => router.push('/(tabs)')} title="Explorar odds" />
          </View>
        }
        renderItem={({ item }) => (
          <BoletinSelectionRow
            item={{
              event: item.event,
              market: item.market,
              oddValue: String(item.oddValue),
              result: ItemResult.PENDING,
              selection: item.selection,
              site: item.site,
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
              showToast('Boletin criado com sucesso.', 'success');
              router.replace(`/boletins/${created.id}`);
            } catch (error) {
              showToast(getErrorMessage(error), 'error');
            } finally {
              setIsSaving(false);
            }
          }}
          title="Guardar boletin"
        />
      </View>
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

  return 'Não foi possível guardar o boletin.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 18, marginBottom: 18 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  titleBlock: { flex: 1, gap: 6, paddingRight: 12 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
  publicRow: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 16 },
  publicTextWrap: { flex: 1, gap: 4 },
  publicTitle: { fontSize: 15, fontWeight: '800' },
  publicSubtitle: { fontSize: 13, lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  emptyCard: { borderRadius: 22, borderWidth: 1, gap: 14, padding: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '900' },
  emptyText: { fontSize: 14, lineHeight: 22 },
  footerBar: { bottom: 0, left: 0, position: 'absolute', right: 0 },
});