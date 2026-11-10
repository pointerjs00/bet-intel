// Team search: followed teams (football, NBA) and names from the user's own bets (tennis players,
// other leagues). Opens the team history.
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useTeamSearch } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';

export default function TeamSearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const search = useTeamSearch(q);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Pesquisar equipa' }} />
      <View style={[styles.input, { backgroundColor: colors.surface }]}>
        <Ionicons color={colors.textMuted} name="search" size={20} />
        <TextInput
          accessibilityLabel="Nome da equipa ou jogador"
          autoFocus
          onChangeText={setText}
          placeholder="Equipa, seleção ou jogador"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={[styles.field, { color: colors.textPrimary }]}
          value={text}
        />
        {text ? (
          <Pressable accessibilityLabel="Limpar" hitSlop={8} onPress={() => setText('')}>
            <Ionicons color={colors.textMuted} name="close-circle" size={18} />
          </Pressable>
        ) : null}
      </View>

      {q.length < 2 ? (
        <AppText style={styles.hint} variant="caption">Escreve pelo menos 2 letras. Vês todos os jogos desde 2020 e as tuas apostas em cada um.</AppText>
      ) : search.isLoading ? (
        <View style={styles.list}>{[0, 1, 2].map((i) => <Skeleton height={56} key={i} width="100%" />)}</View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={search.data ?? []}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(h) => `${h.kind}-${h.sport}-${h.id ?? h.name}`}
          ListEmptyComponent={<AppText style={styles.hint} variant="caption">Nenhuma equipa encontrada.</AppText>}
          renderItem={({ item: h }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/equipa', params: { sport: h.sport, ...(h.id ? { id: h.id } : {}), name: h.name } })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceRaised : colors.surface }]}
            >
              <TeamBadge imageUrl={h.logo} name={h.name} size={36} variant={h.sport === 'TENNIS' ? 'player' : 'team'} />
              <View style={styles.flex}>
                <AppText numberOfLines={1} variant="bodyStrong">{h.name}</AppText>
                <AppText numberOfLines={1} variant="caption">
                  {h.sport === 'BASKETBALL' ? 'Basquetebol' : h.sport === 'TENNIS' ? 'Ténis' : 'Futebol'}
                  {h.leagues.length ? ` · ${h.leagues.slice(0, 2).join(', ')}` : ''}
                </AppText>
              </View>
              {h.bets > 0 ? (
                <View style={[styles.badge, { backgroundColor: `${colors.primary}24` }]}>
                  <AppText style={{ color: colors.primary, fontWeight: '700' }} variant="label">{h.bets} aposta{h.bets === 1 ? '' : 's'}</AppText>
                </View>
              ) : null}
              <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  input: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 10, margin: 16, minHeight: 48, paddingHorizontal: 14 },
  field: { flex: 1, fontSize: 16 },
  hint: { paddingHorizontal: 20, textAlign: 'center' },
  list: { gap: 8, paddingBottom: 40, paddingHorizontal: 16 },
  row: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, padding: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
