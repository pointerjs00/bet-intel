import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoletinDetail } from '@betintel/shared';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useBoletins } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_EMOJI: Record<string, string> = {
  WON: '✅',
  LOST: '❌',
  PENDING: '⏳',
  VOID: '🚫',
  PARTIAL: '⚠️',
  CASHOUT: '💵',
};

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens: t } = useTheme();
  const boletinsQuery = useBoletins();

  const journalEntries = useMemo(() => {
    if (!boletinsQuery.data) return [];
    return boletinsQuery.data
      .filter((b) => b.notes && b.notes.trim().length > 0)
      .sort((a, b) => {
        const dateA = new Date(a.betDate ?? a.createdAt).getTime();
        const dateB = new Date(b.betDate ?? b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [boletinsQuery.data]);

  const renderItem = ({ item }: { item: BoletinDetail }) => (
    <Pressable onPress={() => router.push(`/boletins/${item.id}`)}>
      <Card style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <Text style={[styles.entryDate, { color: colors.textSecondary }]}>
            {formatDate(item.betDate ?? item.createdAt)}
          </Text>
          <Text style={styles.statusEmoji}>{STATUS_EMOJI[item.status] ?? '❓'}</Text>
        </View>
        {item.name ? (
          <Text style={[styles.entryName, { color: colors.textPrimary }]}>{item.name}</Text>
        ) : null}
        <Text style={[styles.entryMeta, { color: colors.textSecondary }]}>
          {formatCurrency(parseFloat(item.stake))} × {parseFloat(item.totalOdds).toFixed(2)}
          {item.status !== 'PENDING' && (
            <Text style={{ color: parseFloat(item.actualReturn ?? '0') - parseFloat(item.stake) >= 0 ? colors.primary : colors.danger }}>
              {' → '}{formatCurrency(parseFloat(item.actualReturn ?? item.potentialReturn))}
            </Text>
          )}
        </Text>
        <View style={[styles.notesBorder, { borderLeftColor: colors.primary }]}>
          <Text style={[styles.notesText, { color: colors.textPrimary }]}>{item.notes}</Text>
        </View>
        <Text style={[styles.selectionsPreview, { color: colors.textMuted }]}>
          {item.items.slice(0, 3).map((i) => `${i.homeTeam} vs ${i.awayTeam}`).join(' · ')}
          {item.items.length > 3 ? ` +${item.items.length - 3}` : ''}
        </Text>
      </Card>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Diário de Apostas', headerShown: true }} />
      <FlatList
        data={journalEntries}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: t.spacing.lg,
          gap: 14,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="notebook-outline"
            title="Sem notas"
            message="Adiciona notas aos teus boletins para construir o teu diário de apostas."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  entryCard: { gap: 8 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryDate: { fontSize: 12, fontWeight: '700' },
  statusEmoji: { fontSize: 16 },
  entryName: { fontSize: 16, fontWeight: '900' },
  entryMeta: { fontSize: 13, fontWeight: '600' },
  notesBorder: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4 },
  notesText: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  selectionsPreview: { fontSize: 11, fontWeight: '600' },
});
