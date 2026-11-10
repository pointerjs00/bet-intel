// Team search with as-you-type suggestions: followed teams (football, NBA) and names from the
// user's own bets (tennis players, other leagues). Empty field → recent searches + the teams the
// user bets on most. Opens the team history.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../components/ui/AppText';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useTeamSearch, type TeamSearchHit } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';

const RECENT_KEY = 'teamSearch:recent';
const SPORT_LABEL: Record<string, string> = { BASKETBALL: 'Basquetebol', TENNIS: 'Ténis', FOOTBALL: 'Futebol' };

/** League names without raw provider codes ("ita.2", "den.1"). */
const readableLeagues = (ls: string[]) => ls.filter((l) => !/^[a-z]{3}\.\d+$/i.test(l));

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The name with the typed part in bold, so suggestions read like autocomplete. */
function Highlighted({ name, q, color, strong }: { name: string; q: string; color: string; strong: string }) {
  const at = q ? fold(name).indexOf(fold(q)) : -1;
  if (at < 0) return <AppText numberOfLines={1} style={[styles.name, { color: strong }]}>{name}</AppText>;
  return (
    <AppText numberOfLines={1} style={[styles.name, { color }]}>
      {name.slice(0, at)}
      <AppText style={[styles.name, styles.match, { color: strong }]}>{name.slice(at, at + q.length)}</AppText>
      {name.slice(at + q.length)}
    </AppText>
  );
}

export default function TeamSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<TeamSearchHit[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 140);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => { if (v) setRecent(JSON.parse(v) as TeamSearchHit[]); })
      .catch(() => undefined);
  }, []);

  const search = useTeamSearch(q);
  const typing = text.trim().length > 0;
  const hits = search.data ?? [];
  const keyOf = (h: TeamSearchHit) => `${h.kind}-${h.sport}-${h.id ?? h.name}`;

  const open = (h: TeamSearchHit) => {
    const next = [h, ...recent.filter((r) => keyOf(r) !== keyOf(h))].slice(0, 8);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
    router.push({ pathname: '/equipa', params: { sport: h.sport, ...(h.id ? { id: h.id } : {}), name: h.name } });
  };
  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
  };

  const header = useMemo(() => {
    if (typing || (!recent.length && !hits.length)) return null;
    return (
      <View style={styles.headerBlock}>
        {recent.length ? (
          <>
            <View style={styles.sectionRow}>
              <AppText style={[styles.section, { color: colors.textMuted }]}>RECENTES</AppText>
              <Pressable hitSlop={8} onPress={clearRecent}>
                <AppText style={[styles.sectionAction, { color: colors.primary }]}>Limpar</AppText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
              {recent.map((h) => (
                <Pressable
                  key={keyOf(h)}
                  onPress={() => open(h)}
                  style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? colors.surfaceRaised : colors.surface }]}
                >
                  <TeamBadge imageUrl={h.logo} name={h.name} size={22} variant={h.sport === 'TENNIS' ? 'player' : 'team'} />
                  <AppText numberOfLines={1} style={[styles.chipText, { color: colors.textPrimary }]}>{h.name}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
        {hits.length ? <AppText style={[styles.section, styles.sectionPad, { color: colors.textMuted }]}>AS TUAS EQUIPAS</AppText> : null}
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, recent, hits.length, colors]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* In-screen header: back + search field on one line */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="Voltar" hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <Ionicons color={colors.textPrimary} name="arrow-back" size={24} />
        </Pressable>
        <View style={[styles.input, { backgroundColor: colors.surface, borderColor: typing ? `${colors.primary}66` : 'transparent' }]}>
          <Ionicons color={typing ? colors.primary : colors.textMuted} name="search" size={19} />
          <TextInput
            accessibilityLabel="Nome da equipa ou jogador"
            autoCorrect={false}
            autoFocus
            onChangeText={setText}
            onSubmitEditing={() => { if (hits[0]) open(hits[0]); }}
            placeholder="Equipa, seleção ou jogador"
            placeholderTextColor={colors.textMuted}
            ref={inputRef}
            returnKeyType="search"
            selectionColor={colors.primary}
            style={[styles.field, { color: colors.textPrimary }]}
            value={text}
          />
          {text ? (
            <Pressable accessibilityLabel="Limpar" hitSlop={8} onPress={() => { setText(''); inputRef.current?.focus(); }}>
              <Ionicons color={colors.textMuted} name="close-circle" size={18} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {search.isLoading && !search.data ? (
        <View style={styles.list}>{[0, 1, 2, 3].map((i) => <Skeleton height={56} key={i} width="100%" />)}</View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={hits}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={keyOf}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(160)} style={styles.empty}>
              <Ionicons color={colors.textMuted} name={typing ? 'search-outline' : 'football-outline'} size={36} />
              <AppText style={styles.hint} variant="caption">
                {typing ? `Sem resultados para "${text.trim()}".` : 'Escreve o nome de uma equipa ou jogador. Vês todos os jogos desde 2020 e as tuas apostas em cada um.'}
              </AppText>
            </Animated.View>
          }
          ListHeaderComponent={header}
          renderItem={({ item: h, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 18).duration(180)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => open(h)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceRaised : 'transparent' }]}
              >
                <TeamBadge imageUrl={h.logo} name={h.name} size={34} variant={h.sport === 'TENNIS' ? 'player' : 'team'} />
                <View style={styles.flex}>
                  <Highlighted color={colors.textSecondary} name={h.name} q={typing ? text.trim() : ''} strong={colors.textPrimary} />
                  <AppText numberOfLines={1} style={[styles.sub, { color: colors.textMuted }]}>
                    {SPORT_LABEL[h.sport] ?? 'Futebol'}
                    {readableLeagues(h.leagues).length ? ` · ${readableLeagues(h.leagues).slice(0, 2).join(', ')}` : ''}
                  </AppText>
                </View>
                {h.bets > 0 ? (
                  <View style={[styles.badge, { backgroundColor: `${colors.primary}1F` }]}>
                    <Ionicons color={colors.primary} name="receipt-outline" size={12} />
                    <AppText style={[styles.badgeText, { color: colors.primary }]}>{h.bets}</AppText>
                  </View>
                ) : null}
                {typing ? (
                  <Pressable
                    accessibilityLabel={`Completar com ${h.name}`}
                    hitSlop={8}
                    onPress={() => { setText(h.name); inputRef.current?.focus(); }}
                  >
                    <Ionicons color={colors.textMuted} name="arrow-up-outline" size={18} style={styles.fill} />
                  </Pressable>
                ) : (
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
                )}
              </Pressable>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, gap: 1 },
  top: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 10, paddingHorizontal: 12 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 36 },
  input: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 10, height: 46, paddingHorizontal: 14 },
  field: { flex: 1, fontSize: 16, paddingVertical: 0 },
  headerBlock: { gap: 8, paddingBottom: 4 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  section: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.8 },
  sectionPad: { paddingHorizontal: 4, paddingTop: 6 },
  sectionAction: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, maxWidth: 180, paddingLeft: 6, paddingRight: 12, paddingVertical: 6 },
  chipText: { flexShrink: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  list: { gap: 2, paddingBottom: 40, paddingHorizontal: 12 },
  row: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 12, paddingHorizontal: 8, paddingVertical: 10 },
  name: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  match: { fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 12 },
  badge: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  fill: { transform: [{ rotate: '-45deg' }] },
  empty: { alignItems: 'center', gap: 10, paddingTop: 48 },
  hint: { paddingHorizontal: 24, textAlign: 'center' },
});
