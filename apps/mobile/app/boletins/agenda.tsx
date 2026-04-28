import React, { useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AgendaItem } from '@betintel/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAgenda } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';
import { getSportIcon } from '../../utils/sportAssets';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function formatSectionDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) return 'Hoje';
  if (isSameDay(d, tomorrow)) return 'Amanhã';

  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Row component ────────────────────────────────────────────────────────────

function AgendaRow({ item, colors, onPress }: { item: AgendaItem; colors: Record<string, string>; onPress: () => void }) {
  const sportIcon = getSportIcon(item.sport);
  const time = formatKickoff(item.kickoffAt);

  return (
    <PressableScale onPress={onPress} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={[styles.timeText, { color: colors.primary }]}>{time}</Text>
        <Text style={[styles.sportIcon]}>{sportIcon}</Text>
      </View>

      {/* Match info */}
      <View style={styles.matchCol}>
        <Text style={[styles.matchup, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.homeTeam} vs {item.awayTeam}
        </Text>
        <Text style={[styles.competition, { color: colors.textMuted }]} numberOfLines={1}>
          {item.competition}
        </Text>
        <View style={styles.betRow}>
          <Text style={[styles.betLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.market} · {item.selection}
          </Text>
          <Text style={[styles.odd, { color: colors.warning ?? '#FF9500', backgroundColor: (colors.warning ?? '#FF9500') + '18' }]}>
            {parseFloat(item.oddValue).toFixed(2)}
          </Text>
        </View>
        {item.boletinName ? (
          <Text style={[styles.boletinName, { color: colors.textMuted }]} numberOfLines={1}>
            {item.boletinName}
          </Text>
        ) : null}
      </View>

      <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
    </PressableScale>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Section {
  title: string;
  data: AgendaItem[];
}

export default function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens: t } = useTheme();
  const query = useAgenda();

  const sections = useMemo<Section[]>(() => {
    const items = query.data ?? [];
    const byDay = new Map<string, AgendaItem[]>();
    for (const item of items) {
      const key = toDateKey(item.kickoffAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }
    return Array.from(byDay.entries()).map(([, dayItems]) => ({
      title: formatSectionDate(dayItems[0]!.kickoffAt),
      data: dayItems,
    }));
  }, [query.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Os Meus Jogos',
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { color: colors.textPrimary },
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.itemId}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: t.spacing.lg,
          gap: 0,
          flexGrow: 1,
        }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AgendaRow
            item={item}
            colors={colors}
            onPress={() => router.push(`/boletins/${item.boletinId}`)}
          />
        )}
        SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          query.isLoading ? null : (
            <EmptyState
              icon="calendar-outline"
              title="Sem jogos agendados"
              message="Quando criares boletins com data de jogo, os teus próximos jogos aparecem aqui."
            />
          )
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  sectionHeader: {
    paddingBottom: 6,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  row: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timeCol: {
    alignItems: 'center',
    gap: 2,
    width: 44,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sportIcon: {
    fontSize: 16,
  },
  matchCol: {
    flex: 1,
    gap: 2,
  },
  matchup: {
    fontSize: 14,
    fontWeight: '700',
  },
  competition: {
    fontSize: 12,
  },
  betRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  betLabel: {
    flex: 1,
    fontSize: 12,
  },
  odd: {
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boletinName: {
    fontSize: 11,
    marginTop: 1,
  },
});
