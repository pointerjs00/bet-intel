// "Por jogo" (plan #58): pick a match from the free ESPN feed, choose a market and the odd,
// and the selection goes into the boletim builder. Replaces the old API-Football picker.
// Market names are the ones the settlement engine (marketResolutionEngine) already parses.
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Sport } from '@betintel/shared';
import { AppText } from '../../components/ui/AppText';
import { Appear, LiveDot } from '../../components/ui/Appear';
import { Button } from '../../components/ui/Button';
import { ListCard, ListRow, useGlow } from '../../components/ui/ListCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import { SPORT_OPTIONS, useBasketballDay, useFootballDay, useTennisDay, type FootballMatch, type SimpleMatch, type SportKey } from '../../services/sportsService';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

const DAY_MS = 24 * 60 * 60 * 1000;
const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A market the sheet offers. `{home}`/`{away}` in labels and values are replaced by the names.
 * `line`: the market needs a number typed by the user — 'total' builds "Mais de 220.5",
 * 'handicap' builds "Boston Celtics -5.5" (strings the settlement engines parse).
 */
interface MarketDef { chip: string; market: string; selections: Array<{ label: string; value: string }>; line?: 'total' | 'handicap' }
type MarketGroups = Array<{ category: string; items: MarketDef[] }>;

const OVER_UNDER = [{ label: 'Mais de', value: 'Mais de' }, { label: 'Menos de', value: 'Menos de' }];
const SIDES = [{ label: '{home}', value: '{home}' }, { label: '{away}', value: '{away}' }];

const BASKETBALL_MARKETS: MarketGroups = [
  {
    category: 'Resultado',
    items: [
      { chip: 'Vencedor', market: 'Vencedor do jogo', selections: SIDES },
      { chip: 'Handicap', market: 'Handicap', selections: SIDES, line: 'handicap' },
      { chip: '1X2 (tempo reg.)', market: '1X2 (Tempo Regulamentar)', selections: [SIDES[0]!, { label: 'Empate', value: 'Empate' }, SIDES[1]!] },
    ],
  },
  { category: 'Pontos', items: [{ chip: 'Total de pontos', market: 'Total de pontos', selections: OVER_UNDER, line: 'total' }] },
];

const TENNIS_MARKETS: MarketGroups = [
  {
    category: 'Resultado',
    items: [
      { chip: 'Vencedor', market: 'Vencedor do encontro', selections: SIDES },
      { chip: '1.º set', market: '1.º Set - Vencedor', selections: SIDES },
      {
        chip: 'Resultado em sets',
        market: 'Resultado em sets',
        selections: ['2-0', '2-1'].flatMap((r) => [{ label: `{home} ${r}`, value: `{home} vence ${r}` }, { label: `{away} ${r}`, value: `{away} vence ${r}` }]),
      },
    ],
  },
  { category: 'Jogos', items: [{ chip: 'Total de jogos', market: 'Total de jogos', selections: OVER_UNDER, line: 'total' }] },
];

/** Football markets, grouped. */
const MARKETS: MarketGroups = [
  {
    category: 'Resultado',
    items: [
      { chip: '1X2', market: 'Resultado Final (1X2)', selections: [{ label: '{home}', value: '1' }, { label: 'Empate', value: 'X' }, { label: '{away}', value: '2' }] },
      { chip: 'Dupla hipótese', market: 'Dupla Chance', selections: [{ label: '{home} ou empate', value: '1X' }, { label: '{home} ou {away}', value: '12' }, { label: 'Empate ou {away}', value: 'X2' }] },
      { chip: 'Intervalo', market: 'Resultado ao Intervalo', selections: [{ label: '{home}', value: '1' }, { label: 'Empate', value: 'X' }, { label: '{away}', value: '2' }] },
    ],
  },
  {
    category: 'Golos',
    items: [
      ...['1.5', '2.5', '3.5'].map((l) => ({
        chip: `Golos ${l}`,
        market: `Golos - Mais de ${l}`,
        selections: [{ label: `Mais de ${l}`, value: `Over ${l}` }, { label: `Menos de ${l}`, value: `Under ${l}` }],
      })),
      { chip: 'Ambas marcam', market: 'Ambas as Equipas Marcam', selections: [{ label: 'Sim', value: 'Sim' }, { label: 'Não', value: 'Não' }] },
    ],
  },
  {
    category: 'Cantos e cartões',
    items: [
      { chip: 'Cantos 9.5', market: 'Cantos - Mais de 9.5', selections: [{ label: 'Mais de 9.5', value: 'Over 9.5' }, { label: 'Menos de 9.5', value: 'Under 9.5' }] },
      { chip: 'Cartões 3.5', market: 'Cartões - Mais de 3.5', selections: [{ label: 'Mais de 3.5', value: 'Over 3.5' }, { label: 'Menos de 3.5', value: 'Under 3.5' }] },
    ],
  },
];

function dayLabel(d: Date, offset: number) {
  if (offset === 0) return { top: 'Hoje', day: String(d.getDate()) };
  if (offset === 1) return { top: 'Amanhã', day: String(d.getDate()) };
  // Hermes returns the full name ("Segunda"); 3 letters fit the day pill.
  return { top: d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '').slice(0, 3), day: String(d.getDate()) };
}

export default function PorJogoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const accentGlow = useGlow(colors.primary);
  const items = useBoletinBuilderStore((s) => s.items);
  const [sport, setSport] = useState<SportKey>('football');
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<{ match: FootballMatch | SimpleMatch; league: string; slug: string } | null>(null);

  const date = useMemo(() => new Date(Date.now() + offset * DAY_MS), [offset]);
  const iso = toIsoDate(date);
  const footballQuery = useFootballDay(iso, sport === 'football');
  const basketballQuery = useBasketballDay(iso, sport === 'basketball');
  const tennisQuery = useTennisDay(iso, sport === 'tennis');
  const dayQuery = sport === 'football' ? footballQuery : sport === 'basketball' ? basketballQuery : tennisQuery;
  const variant = sport === 'tennis' ? 'player' : 'team';
  // Only matches that can still be bet on (not finished/cancelled).
  const groups = useMemo(
    () => ((dayQuery.data?.groups ?? []) as Array<{ league: string; slug: string; matches: Array<FootballMatch | SimpleMatch> }>)
      .map((g) => ({ ...g, matches: g.matches.filter((m) => m.status === 'SCHEDULED' || m.status === 'LIVE' || m.status === 'HALFTIME') }))
      .filter((g) => g.matches.length > 0),
    [dayQuery.data],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Por jogo', headerShown: true }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <SegmentedControl onChange={setSport} options={SPORT_OPTIONS} value={sport} />
        <ScrollView contentContainerStyle={styles.days} horizontal showsHorizontalScrollIndicator={false}>
          {Array.from({ length: 8 }, (_, i) => i).map((o) => {
            const d = new Date(Date.now() + o * DAY_MS);
            const label = dayLabel(d, o);
            const active = o === offset;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={o}
                onPress={() => { hapticLight(); setOffset(o); }}
                style={[styles.day, { backgroundColor: active ? colors.primary : colors.surface }, active ? accentGlow : null]}
              >
                <AppText style={[styles.cap, active && styles.white]} tone={active ? undefined : 'secondary'} variant="label">{label.top}</AppText>
                <AppText style={active ? styles.white : undefined} variant="number">{label.day}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {dayQuery.isLoading ? (
          <ListCard>{[0, 1, 2].map((i) => <ListRow key={i}><Skeleton height={40} width="100%" /></ListRow>)}</ListCard>
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons color={colors.textMuted} name="calendar-outline" size={40} />
            <AppText variant="heading">Sem jogos por começar neste dia</AppText>
            <AppText style={styles.center} variant="caption">Para jogos de outras ligas ou desportos, usa o registo manual.</AppText>
            <Button onPress={() => router.replace('/boletins/create')} title="Registo manual" variant="secondary" />
          </View>
        ) : (
          groups.map((g, gi) => (
            <Appear index={gi} key={g.slug} style={styles.group}>
              <AppText variant="bodyStrong">{g.league}</AppText>
              <ListCard>
                {g.matches.map((m) => {
                  const live = m.status === 'LIVE' || m.status === 'HALFTIME';
                  const time = new Date(m.kickoffAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <ListRow
                      accessibilityLabel={`${m.home.name} contra ${m.away.name}, ${live ? 'ao vivo' : time}`}
                      key={m.providerMatchId}
                      onPress={() => { hapticLight(); setPicked({ match: m, league: g.league, slug: g.slug }); }}
                    >
                      <View style={styles.time}>
                        {live ? <LiveDot color={colors.live} size={7} /> : null}
                        <AppText style={live ? { color: colors.live } : undefined} variant="label">{live ? (sport === 'tennis' ? 'Ao vivo' : m.statusDetail) : time}</AppText>
                      </View>
                      <View style={[styles.flex, styles.teams]}>
                        <View style={styles.team}><TeamBadge name={m.home.name} size={22} variant={variant} /><AppText numberOfLines={1} style={styles.flex}>{m.home.name}</AppText></View>
                        <View style={styles.team}><TeamBadge name={m.away.name} size={22} variant={variant} /><AppText numberOfLines={1} style={styles.flex}>{m.away.name}</AppText></View>
                      </View>
                      <Ionicons color={colors.primary} name="add-circle" size={26} />
                    </ListRow>
                  );
                })}
              </ListCard>
            </Appear>
          ))
        )}
      </ScrollView>

      {/* Builder bar: what's already in the boletim, and the way to stake and save */}
      {items.length > 0 ? (
        <View style={[styles.bar, { bottom: insets.bottom + 12 }]}>
          <Button
            onPress={() => router.push('/boletins/create')}
            title={`Rever boletim · ${items.length} ${items.length === 1 ? 'seleção' : 'seleções'}`}
          />
        </View>
      ) : null}

      {picked ? (
        <MarketSheet
          league={picked.league}
          match={picked.match}
          onClose={() => setPicked(null)}
          // The preview (form, head-to-head, table) exists for football only.
          onPreview={sport === 'football' ? () => {
            const target = picked;
            setPicked(null);
            router.push({ pathname: '/jogo/[id]', params: { id: target.match.providerMatchId, league: target.slug } });
          } : undefined}
          sport={sport}
        />
      ) : null}
    </View>
  );
}

function MarketSheet({ match, league, onClose, onPreview, sport }: {
  match: FootballMatch | SimpleMatch; league: string; onClose: () => void; onPreview?: () => void; sport: SportKey;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const addItem = useBoletinBuilderStore((s) => s.addItem);
  const markets = sport === 'basketball' ? BASKETBALL_MARKETS : sport === 'tennis' ? TENNIS_MARKETS : MARKETS;
  const variant = sport === 'tennis' ? 'player' : 'team';
  const [market, setMarket] = useState<MarketDef>(markets[0]!.items[0]!);
  const [selection, setSelection] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [odd, setOdd] = useState('');
  const parsedOdd = parseFloat(odd.replace(',', '.'));
  const parsedLine = parseFloat(line.replace(',', '.'));
  const lineOk = !market.line || Number.isFinite(parsedLine);
  const canAdd = selection !== null && parsedOdd >= 1.01 && lineOk;
  const fill = (s: string) => s.replace('{home}', match.home.name).replace('{away}', match.away.name);

  /** Selection text as stored on the boletim (and read by the settlement engines). */
  const finalSelection = (): string | null => {
    if (!selection) return null;
    const base = fill(selection);
    if (market.line === 'total') return `${base} ${parsedLine}`;
    if (market.line === 'handicap') return `${base} ${parsedLine > 0 ? '+' : ''}${parsedLine}`;
    return base;
  };

  const add = () => {
    const sel = finalSelection();
    if (!canAdd || !sel) return;
    addItem({
      id: `${match.providerMatchId}-${market.market}-${sel}-${Date.now()}`,
      homeTeam: match.home.name,
      awayTeam: match.away.name,
      competition: league,
      sport: sport === 'basketball' ? Sport.BASKETBALL : sport === 'tennis' ? Sport.TENNIS : Sport.FOOTBALL,
      market: market.market,
      selection: sel,
      oddValue: parsedOdd,
      eventDate: match.kickoffAt,
    });
    hapticSuccess();
    showToast('Seleção adicionada ao boletim.', 'success');
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <Pressable feedback="none" accessibilityLabel="Fechar" onPress={onClose} style={styles.backdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.matchHead}>
            <TeamBadge name={match.home.name} size={40} variant={variant} />
            <View style={styles.flex}>
              <AppText numberOfLines={1} style={styles.center} variant="heading">{match.home.name} vs {match.away.name}</AppText>
              <AppText style={styles.center} variant="caption">{league}</AppText>
            </View>
            <TeamBadge name={match.away.name} size={40} variant={variant} />
          </View>
          {onPreview ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onPreview} style={styles.previewLink}>
              <Ionicons color={colors.primary} name="analytics-outline" size={16} />
              <AppText tone="accent" variant="bodyStrong">Ver antevisão (forma, confrontos, classificação)</AppText>
            </Pressable>
          ) : null}

          <ScrollView style={styles.sheetScroll}>
            {markets.map((cat) => (
              <View key={cat.category} style={styles.cat}>
                <AppText variant="label">{cat.category}</AppText>
                <View style={styles.chips}>
                  {cat.items.map((m) => {
                    const on = m.market === market.market;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        key={m.market}
                        onPress={() => { hapticLight(); setMarket(m); setSelection(null); setLine(''); }}
                        style={[styles.chip, { backgroundColor: on ? `${colors.primary}26` : colors.surface }]}
                      >
                        <AppText style={{ color: on ? colors.primary : colors.textSecondary, fontWeight: on ? '700' : '500' }} variant="label">{m.chip}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <AppText style={styles.cat} variant="label">Seleção</AppText>
            <View style={[styles.selRow, market.selections.length > 3 && styles.selWrap]}>
              {market.selections.map((s) => {
                const on = s.value === selection;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    key={s.value}
                    onPress={() => { hapticLight(); setSelection(s.value); }}
                    style={[styles.sel, market.selections.length > 3 && styles.selHalf, { backgroundColor: on ? colors.primary : colors.surface }]}
                  >
                    <AppText numberOfLines={2} style={[styles.center, on && styles.white]} variant="bodyStrong">{fill(s.label)}</AppText>
                  </Pressable>
                );
              })}
            </View>

            {market.line ? (
              <>
                <AppText style={styles.cat} variant="label">{market.line === 'handicap' ? 'Linha do handicap (ex.: -5,5 ou +3)' : 'Linha (ex.: 220,5)'}</AppText>
                <TextInput
                  accessibilityLabel="Linha"
                  keyboardType="numbers-and-punctuation"
                  onChangeText={setLine}
                  placeholder={market.line === 'handicap' ? '-5,5' : '220,5'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.oddInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
                  value={line}
                />
              </>
            ) : null}

            <AppText style={styles.cat} variant="label">Odd</AppText>
            <TextInput
              accessibilityLabel="Odd"
              keyboardType="decimal-pad"
              onChangeText={setOdd}
              placeholder="ex.: 1,85"
              placeholderTextColor={colors.textMuted}
              style={[styles.oddInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
              value={odd}
            />
          </ScrollView>

          <Button disabled={!canAdd} onPress={add} title="Adicionar ao boletim" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 20 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  cap: { textTransform: 'capitalize' },
  white: { color: '#04140C' },
  days: { gap: 8, paddingVertical: 2 },
  day: { alignItems: 'center', borderRadius: 14, gap: 2, justifyContent: 'center', minHeight: 60, width: 56 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  group: { gap: 8 },
  time: { alignItems: 'center', gap: 4, width: 44 },
  teams: { gap: 6 },
  team: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  bar: { left: 20, position: 'absolute', right: 20 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 14, maxHeight: '88%', paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', borderRadius: 3, height: 5, width: 40 },
  matchHead: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  sheetScroll: { flexGrow: 0 },
  previewLink: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 6 },
  cat: { gap: 8, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, justifyContent: 'center', minHeight: 36, paddingHorizontal: 14 },
  selRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  sel: { alignItems: 'center', borderRadius: 14, flex: 1, justifyContent: 'center', minHeight: 56, padding: 8 },
  selWrap: { flexWrap: 'wrap' },
  selHalf: { flexBasis: '47%', flexGrow: 1 },
  oddInput: { borderRadius: 14, fontSize: 20, fontWeight: '700', marginTop: 8, minHeight: 52, paddingHorizontal: 16 },
});
