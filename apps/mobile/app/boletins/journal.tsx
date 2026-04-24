import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoletinDetail } from '@betintel/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { useBoletins } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency } from '../../utils/formatters';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type StatusKey = 'WON' | 'LOST' | 'PENDING' | 'VOID' | 'PARTIAL' | 'CASHOUT';

const STATUS_CONFIG: Record<StatusKey, { label: string; icon: string; colorKey: 'primary' | 'danger' | 'warning' | 'textMuted' }> = {
  WON:     { label: 'Ganhou',   icon: 'checkmark-circle', colorKey: 'primary' },
  LOST:    { label: 'Perdeu',   icon: 'close-circle',     colorKey: 'danger' },
  PENDING: { label: 'Pendente', icon: 'time',             colorKey: 'warning' },
  VOID:    { label: 'Cancelado', icon: 'ban',              colorKey: 'textMuted' },
  PARTIAL: { label: 'Parcial',  icon: 'alert-circle',     colorKey: 'warning' },
  CASHOUT: { label: 'Cashout',  icon: 'cash',             colorKey: 'primary' },
};

function StatusChip({ status, colors }: { status: string; colors: Record<string, string> }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? { label: status, icon: 'help-circle', colorKey: 'textMuted' };
  const color = colors[cfg.colorKey];
  return (
    <View style={[styles.statusChip, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Ionicons name={cfg.icon as never} size={12} color={color} />
      <Text style={[styles.statusLabel, { color }]}>{cfg.label}</Text>
    </View>
  );
}

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

  const renderItem = ({ item }: { item: BoletinDetail }) => {
    const stake = parseFloat(item.stake);
    const odds = parseFloat(item.totalOdds);
    const returnVal = parseFloat(item.actualReturn ?? item.potentialReturn);
    const profit = returnVal - stake;
    const isPending = item.status === 'PENDING';
    const isWon = profit >= 0 && !isPending;

    return (
      <Pressable
        onPress={() => router.push(`/boletins/${item.id}`)}
        style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Top row: date + status */}
          <View style={styles.topRow}>
            <Text style={[styles.entryDate, { color: colors.textMuted }]}>
              {formatDate(item.betDate ?? item.createdAt)}
            </Text>
            <StatusChip status={item.status} colors={colors} />
          </View>

          {/* Name */}
          {item.name ? (
            <Text style={[styles.entryName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
          ) : null}

          {/* Stake / odds / return */}
          <View style={styles.metaRow}>
            <Text style={[styles.metaStake, { color: colors.textSecondary }]}>
              {formatCurrency(stake)}
            </Text>
            <Text style={[styles.metaOdds, { color: colors.textMuted }]}>× {odds.toFixed(2)}</Text>
            {!isPending && (
              <>
                <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                <Text style={[styles.metaReturn, { color: isWon ? colors.primary : colors.danger }]}>
                  {formatCurrency(returnVal)}
                </Text>
              </>
            )}
          </View>

          {/* Notes */}
          <View style={[styles.notesBorder, { borderLeftColor: colors.primary }]}>
            <Text style={[styles.notesText, { color: colors.textSecondary }]} numberOfLines={3}>
              {item.notes}
            </Text>
          </View>

          {/* Selections preview */}
          {item.items.length > 0 && (
            <Text style={[styles.selectionsPreview, { color: colors.textMuted }]} numberOfLines={2}>
              {item.items.slice(0, 3).map((i) => `${i.homeTeam} vs ${i.awayTeam}`).join(' · ')}
              {item.items.length > 3 ? ` +${item.items.length - 3}` : ''}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Diário de Apostas', headerShown: true, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary, headerTitleStyle: { color: colors.textPrimary } }} />
      <FlatList
        data={journalEntries}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: t.spacing.lg,
          gap: 12,
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
  pressable: {},
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryDate: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statusChip: {
    alignItems: 'center',
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  entryName: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  metaStake: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaOdds: {
    fontSize: 13,
    fontWeight: '500',
  },
  metaReturn: {
    fontSize: 13,
    fontWeight: '700',
  },
  notesBorder: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  selectionsPreview: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
});
