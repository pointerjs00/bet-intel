import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AgendaItem } from '@betintel/shared';
import { Sport } from '@betintel/shared';
import { EmptyState } from '../../components/ui/EmptyState';
import { PressableScale } from '../../components/ui/PressableScale';
import { CompetitionBadge } from '../../components/ui/CompetitionBadge';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useAgenda } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';

// ─── Sport config ─────────────────────────────────────────────────────────────

const SPORT_META: Record<string, { emoji: string; accent: string }> = {
  [Sport.FOOTBALL]:          { emoji: '⚽', accent: '#22C55E' },
  [Sport.BASKETBALL]:        { emoji: '🏀', accent: '#F97316' },
  [Sport.TENNIS]:            { emoji: '🎾', accent: '#EAB308' },
  [Sport.HANDBALL]:          { emoji: '🤾', accent: '#3B82F6' },
  [Sport.VOLLEYBALL]:        { emoji: '🏐', accent: '#8B5CF6' },
  [Sport.HOCKEY]:            { emoji: '🏒', accent: '#06B6D4' },
  [Sport.RUGBY]:             { emoji: '🏉', accent: '#A16207' },
  [Sport.AMERICAN_FOOTBALL]: { emoji: '🏈', accent: '#DC2626' },
  [Sport.BASEBALL]:          { emoji: '⚾', accent: '#64748B' },
  [Sport.OTHER]:             { emoji: '🏅', accent: '#6B7280' },
};

function getSportMeta(sport: string) {
  return SPORT_META[sport] ?? SPORT_META[Sport.OTHER]!;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatSectionDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(d, yesterday)) return 'Ontem';
  if (isSameDay(d, today)) return 'Hoje';
  if (isSameDay(d, tomorrow)) return 'Amanhã';
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isInPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

const MATCH_DURATION_MINUTES: Record<string, number> = {
  [Sport.FOOTBALL]: 105,
  [Sport.BASKETBALL]: 150,
  [Sport.TENNIS]: 120,
  [Sport.HANDBALL]: 90,
  [Sport.VOLLEYBALL]: 120,
  [Sport.HOCKEY]: 90,
  [Sport.RUGBY]: 100,
  [Sport.AMERICAN_FOOTBALL]: 210,
  [Sport.BASEBALL]: 180,
  [Sport.OTHER]: 120,
};

type KickoffStatus = 'future' | 'live' | 'finished';

function getKickoffStatus(iso: string, sport?: string): KickoffStatus {
  const kickoffMs = new Date(iso).getTime();
  const now = Date.now();
  if (kickoffMs > now) return 'future';
  const durationMs = (MATCH_DURATION_MINUTES[sport ?? Sport.OTHER] ?? 120) * 60 * 1000;
  return kickoffMs + durationMs < now ? 'finished' : 'live';
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Multi-boletin sheet ──────────────────────────────────────────────────────

function BoletinPickerSheet({
  item,
  colors,
  onClose,
  onPick,
}: {
  item: AgendaItem;
  colors: Record<string, string>;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 120 || vy > 0.8) {
          Animated.timing(translateY, {
            toValue: 600,
            duration: 250,
            useNativeDriver: true,
          }).start(onClose);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle — entire handle area is the pan target */}
        <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
          {item.homeTeam} vs {item.awayTeam}
        </Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
          Este jogo está em {item.boletinIds.length} boletins
        </Text>

        {item.boletinIds.map((id, idx) => (
          <PressableScale
            key={id}
            onPress={() => { onClose(); onPick(id); }}
            style={[styles.sheetRow, { borderColor: colors.border }]}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={[styles.sheetRowText, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.boletinNames[idx] || `Boletim ${idx + 1}`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </PressableScale>
        ))}
      </Animated.View>
    </Modal>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AgendaRow({
  item,
  colors,
  onPress,
}: {
  item: AgendaItem;
  colors: Record<string, string>;
  onPress: () => void;
}) {
  const { emoji, accent } = getSportMeta(item.sport);
  const time = formatKickoff(item.kickoffAt);
  const status = getKickoffStatus(item.kickoffAt, item.sport);
  const timeColor = status === 'future' ? accent : '#EF4444';
  const count = item.boletinIds.length;

  return (
    <PressableScale onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Coloured left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.cardInner}>
        {/* Header: competition + time */}
        <View style={styles.headerRow}>
          <View style={styles.competitionRow}>
            <CompetitionBadge name={item.competition} size={14} />
            <Text style={[styles.competitionText, { color: colors.textMuted }]} numberOfLines={1}>
              {item.competition}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* N boletins badge */}
            {count > 1 && (
              <View style={[styles.countBadge, { backgroundColor: accent }]}>
                <Text style={styles.countText}>{count} boletins</Text>
              </View>
            )}
            <View style={[styles.timeBadge, { backgroundColor: timeColor + '18' }]}>
              {status === 'live' ? (
                <>
                  <View style={[styles.liveDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.liveLabel, { color: '#EF4444' }]}>AO VIVO</Text>
                </>
              ) : status === 'finished' ? (
                <>
                  <Ionicons name="checkmark-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.liveLabel, { color: colors.textMuted }]}>FIM</Text>
                </>
              ) : (
                <>
                  <Text style={styles.sportEmoji}>{emoji}</Text>
                  <Text style={[styles.timeLabel, { color: timeColor }]}>{time}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Teams */}
        <View style={styles.teamsRow}>
          <View style={styles.teamBlock}>
            <TeamBadge name={item.homeTeam} size={36} variant="team" />
            <Text style={[styles.teamName, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.homeTeam}
            </Text>
          </View>
          <View style={styles.vsBlock}>
            <Text style={[styles.vsText, { color: colors.textMuted }]}>VS</Text>
          </View>
          <View style={styles.teamBlock}>
            <TeamBadge name={item.awayTeam} size={36} variant="team" />
            <Text style={[styles.teamName, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.awayTeam}
            </Text>
          </View>
        </View>

        {/* Bet chips */}
        <View style={[styles.betChipRow, { borderTopColor: colors.border }]}>
          <View style={[styles.marketChip, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.marketChipText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.market}
            </Text>
          </View>
          <View style={[styles.selectionChip, { backgroundColor: accent + '20' }]}>
            <Text style={[styles.selectionChipText, { color: accent }]} numberOfLines={1}>
              {item.selection}
            </Text>
          </View>
          <View style={[styles.oddBadge, { backgroundColor: accent }]}>
            <Text style={styles.oddText}>{parseFloat(item.oddValue).toFixed(2)}</Text>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={14} style={{ marginLeft: 'auto' }} />
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Section {
  title: string;
  isPast: boolean;
  data: AgendaItem[];
}

export default function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, tokens: t } = useTheme();
  const query = useAgenda();
  const [sheetItem, setSheetItem] = useState<AgendaItem | null>(null);

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
      isPast: isInPast(dayItems[dayItems.length - 1]!.kickoffAt),
      data: dayItems,
    }));
  }, [query.data]);

  function handleRowPress(item: AgendaItem) {
    if (item.boletinIds.length > 1) {
      setSheetItem(item);
    } else {
      router.push(`/boletins/${item.boletinId}`);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Os Meus Jogos',
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { color: colors.textPrimary, fontWeight: '800' },
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
          flexGrow: 1,
        }}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <View style={[styles.sectionPill, { backgroundColor: section.isPast ? colors.surfaceRaised : colors.primary + '18' }]}>
              <Text style={[styles.sectionTitle, { color: section.isPast ? colors.textMuted : colors.primary }]}>
                {section.title.toUpperCase()}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <AgendaRow item={item} colors={colors} onPress={() => handleRowPress(item)} />
        )}
        SectionSeparatorComponent={() => <View style={{ height: 6 }} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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

      {sheetItem && (
        <BoletinPickerSheet
          item={sheetItem}
          colors={colors}
          onClose={() => setSheetItem(null)}
          onPick={(id) => router.push(`/boletins/${id}`)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  sectionHeader: { paddingBottom: 10, paddingTop: 6 },
  sectionPill: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

  card: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  accentBar: { width: 4 },
  cardInner: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },

  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  competitionRow: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 6 },
  competitionText: { flex: 1, fontSize: 12, fontWeight: '600' },

  countBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  timeBadge: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 4 },
  sportEmoji: { fontSize: 13 },
  timeLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  liveDot: { borderRadius: 4, height: 7, width: 7 },
  liveLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  teamsRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  teamBlock: { alignItems: 'center', flex: 1, gap: 6 },
  teamName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  vsBlock: { alignItems: 'center', width: 32 },
  vsText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  betChipRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 10 },
  marketChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  marketChipText: { fontSize: 11, fontWeight: '600' },
  selectionChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  selectionChipText: { fontSize: 11, fontWeight: '700' },
  oddBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  oddText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  sheetHandleArea: {
    alignItems: 'center',
    marginBottom: 4,
    marginHorizontal: -20, // extend tap area to card edges
    paddingVertical: 8,
  },
  sheetHandle: { borderRadius: 3, height: 4, width: 36 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetSubtitle: { fontSize: 13, marginTop: -4 },
  sheetRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sheetRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
});