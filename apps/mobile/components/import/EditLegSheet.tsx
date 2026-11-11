import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../ui/Pressable';
import { SearchableDropdown } from '../ui/SearchableDropdown';
import { DatePickerField } from '../ui/DatePickerField';
import { SiteMark } from '../ui/SiteMark';
import { TeamBadge } from '../ui/TeamBadge';
import { useTheme } from '../../theme/useTheme';
import { useCompetitions, useMarkets, useTeams } from '../../services/referenceService';
import { BETTING_SITES } from '../../utils/sportAssets';
import type { ParsedBetclicBoletin, ParsedBetclicItem } from '../../services/importService';

/** A selection; `id` is set when it is already saved (editing a boletim). */
export type Leg = ParsedBetclicItem & { id?: string };
/** Boletim fields that only exist once saved (freebet, cashout, notes, public). */
export interface SavedExtras { isFreebet: boolean; cashout: string; notes: string; isPublic: boolean }
type Result = 'PENDING' | 'WON' | 'LOST' | 'VOID';

const SPORTS: Array<{ value: string; label: string }> = [
  { value: 'FOOTBALL', label: 'Futebol' }, { value: 'TENNIS', label: 'Ténis' }, { value: 'BASKETBALL', label: 'Basquetebol' },
  { value: 'HANDBALL', label: 'Andebol' }, { value: 'VOLLEYBALL', label: 'Voleibol' }, { value: 'HOCKEY', label: 'Hóquei' },
  { value: 'AMERICAN_FOOTBALL', label: 'F. Americano' }, { value: 'OTHER', label: 'Outro' },
];
const RESULTS: Array<{ value: Result; label: string }> = [
  { value: 'PENDING', label: 'Pendente' }, { value: 'WON', label: 'Certa' }, { value: 'LOST', label: 'Falhada' }, { value: 'VOID', label: 'Anulada' },
];
const BOLETIM_STATUS: Array<{ value: string; label: string }> = [
  { value: 'PENDING', label: 'Pendente' }, { value: 'WON', label: 'Ganhou' }, { value: 'LOST', label: 'Perdeu' }, { value: 'VOID', label: 'Anulado' }, { value: 'CASHOUT', label: 'Cashout' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Joins a calendar day and "HH:MM" into an ISO string (local time). */
function joinDateTime(day: Date | null, hhmm: string): string | undefined {
  if (!day) return undefined;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), m ? Number(m[1]) : 0, m ? Number(m[2]) : 0);
  return d.toISOString();
}
const parseNum = (s: string) => Number(s.replace(',', '.'));

interface Props {
  visible: boolean;
  boletin: ParsedBetclicBoletin & { site?: string | null };
  index: number;
  onClose: () => void;
  onSave: (boletin: ParsedBetclicBoletin) => void;
  onRemove: () => void;
  onNavigate: (index: number) => void;
  /** Editing a saved boletim: shows freebet/cashout/notes/public instead of the status (derived). */
  saved?: SavedExtras;
  onSaveExtras?: (extras: SavedExtras) => void;
  /** Adds an empty selection after the current ones (saved boletins). */
  onAdd?: () => void;
  /** The real game behind this selection ("Celtics 123–101 76ers · terminado"). */
  matchLine?: string | null;
  /** Only the selection fields (the boletim fields live on the screen, e.g. Confirmar boletim). */
  legOnly?: boolean;
}

/**
 * Edit everything about one selection (sport, players/teams, competition, market, selection, odd,
 * kickoff, result) and about its boletim (site, stake, bet date and time, status). Fields the
 * reader was unsure about are highlighted.
 */
export function EditLegSheet({ visible, boletin, index, onClose, onSave, onRemove, onNavigate, saved, onSaveExtras, onAdd, matchLine, legOnly }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const total = boletin.items.length;
  const src = boletin.items[index];

  const [leg, setLeg] = useState<Leg | null>(src ?? null);
  const [odd, setOdd] = useState('');
  const [kickDay, setKickDay] = useState<Date | null>(null);
  const [kickTime, setKickTime] = useState('');
  const [site, setSite] = useState<string | null>(null);
  const [stake, setStake] = useState('');
  const [betDay, setBetDay] = useState<Date | null>(null);
  const [betTime, setBetTime] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [picker, setPicker] = useState<null | 'home' | 'away' | 'competition' | 'market'>(null);
  const [extras, setExtras] = useState<SavedExtras>({ isFreebet: false, cashout: '', notes: '', isPublic: false });

  useEffect(() => {
    if (!visible || !src) return;
    setLeg({ ...src });
    setOdd(src.oddValue > 0 ? String(src.oddValue).replace('.', ',') : '');
    const k = src.eventDate ? new Date(src.eventDate) : null;
    setKickDay(k && !isNaN(k.getTime()) ? k : null);
    setKickTime(k && !isNaN(k.getTime()) ? toHHMM(k) : '');
    setSite(boletin.site ?? null);
    setStake(boletin.stake > 0 ? String(boletin.stake).replace('.', ',') : '');
    const b = new Date(boletin.betDate);
    setBetDay(isNaN(b.getTime()) ? null : b);
    setBetTime(isNaN(b.getTime()) ? '' : toHHMM(b));
    setStatus(boletin.status || 'PENDING');
    if (saved) setExtras(saved);
  }, [visible, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const sport = leg?.sport ?? 'FOOTBALL';
  const teams = useTeams({ sport, ...(leg?.competition && sport !== 'TENNIS' ? { competition: leg.competition } : {}) }, { enabled: visible });
  const comps = useCompetitions(sport);
  const markets = useMarkets(sport);
  const teamItems = useMemo(() => (teams.data ?? []).map((t) => ({ label: t.displayName ?? t.name, value: t.displayName ?? t.name, imageUrl: t.imageUrl ?? null })), [teams.data]);
  const compItems = useMemo(() => (comps.data ?? []).map((c) => ({ label: c.name, value: c.name, subtitle: c.country })), [comps.data]);
  const marketItems = useMemo(() => [...new Set((markets.data ?? []).map((m) => m.name))].map((n) => ({ label: n, value: n })), [markets.data]);

  if (!leg) return null;
  const unsure = new Set(leg.uncertain ?? []);
  const set = (patch: Partial<Leg>, field?: string) => setLeg((l) => (l ? { ...l, ...patch, uncertain: (l.uncertain ?? []).filter((f) => f !== field) } : l));

  const save = (thenGo?: number) => {
    const o = parseNum(odd);
    const items = boletin.items.map((it, i) => (i === index ? { ...leg, oddValue: Number.isFinite(o) ? o : 0, eventDate: joinDateTime(kickDay, kickTime) ?? leg.eventDate } : it));
    const s = parseNum(stake);
    const totalOdds = items.reduce((a, it) => a * (it.oddValue > 1 ? it.oddValue : 1), 1);
    onSave({
      ...boletin, site, items, status,
      stake: Number.isFinite(s) ? s : boletin.stake,
      totalOdds: items.length > 1 || boletin.totalOdds <= 0 ? Math.round(totalOdds * 100) / 100 : boletin.totalOdds,
      betDate: joinDateTime(betDay, betTime) ?? boletin.betDate,
    } as ParsedBetclicBoletin);
    if (saved && onSaveExtras) onSaveExtras(extras);
    if (thenGo !== undefined) onNavigate(thenGo); else onClose();
  };

  const field = (label: string, flagged: boolean, child: React.ReactNode, onPress?: () => void) => (
    <Pressable
      disabled={!onPress}
      feedback={onPress ? 'press' : 'none'}
      onPress={onPress}
      style={[styles.field, { backgroundColor: flagged ? `${colors.warning}14` : colors.background, borderColor: flagged ? `${colors.warning}88` : 'transparent' }]}
    >
      <Text style={[styles.label, { color: flagged ? colors.warning : colors.textMuted }]}>{label}{flagged ? ' · CONFIRMA' : ''}</Text>
      {child}
    </Pressable>
  );
  const fieldN = (label: string, flagged: boolean, child: React.ReactNode) => (
    <View style={[styles.field, styles.narrow, { backgroundColor: flagged ? `${colors.warning}14` : colors.background, borderColor: flagged ? `${colors.warning}88` : 'transparent' }]}>
      <Text style={[styles.label, { color: flagged ? colors.warning : colors.textMuted }]}>{label}</Text>
      {child}
    </View>
  );
  const chips = <T extends string>(opts: Array<{ value: T; label: string }>, value: string, onPick: (v: T) => void, flagged = false) => (
    <View style={styles.chips}>
      {opts.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onPick(o.value)} style={[styles.chip, { backgroundColor: active ? `${colors.primary}22` : colors.background, borderColor: active ? colors.primary : flagged ? `${colors.warning}66` : colors.border }]}>
            <Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const pickValue = (text: string, placeholder: string) => (
    <View style={styles.pickRow}>
      <Text numberOfLines={1} style={[styles.value, { color: text ? colors.textPrimary : colors.textMuted }]}>{text || placeholder}</Text>
      <Ionicons color={colors.textMuted} name="chevron-down" size={16} />
    </View>
  );
  const input = (value: string, onChange: (v: string) => void, opts: { placeholder?: string; keyboard?: 'decimal-pad' | 'numbers-and-punctuation'; color?: string } = {}) => (
    <TextInput
      keyboardType={opts.keyboard ?? 'default'}
      onChangeText={onChange}
      placeholder={opts.placeholder}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.primary}
      style={[styles.input, { color: opts.color ?? colors.textPrimary }]}
      value={value}
    />
  );
  const tennis = sport === 'TENNIS';
  const sideOptions = [
    { value: leg.homeTeam, label: leg.homeTeam },
    ...(tennis ? [] : [{ value: 'Empate', label: 'Empate' }]),
    { value: leg.awayTeam, label: leg.awayTeam },
  ];

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable feedback="none" onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Animated.View entering={SlideInDown.springify().damping(20)} style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.head}>
              <Pressable accessibilityLabel="Seleção anterior" disabled={index === 0} hitSlop={8} onPress={() => save(index - 1)} style={{ opacity: index === 0 ? 0.3 : 1 }}>
                <Ionicons color={colors.textPrimary} name="chevron-back" size={22} />
              </Pressable>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Seleção {index + 1} de {total}</Text>
              <Pressable accessibilityLabel="Seleção seguinte" disabled={index >= total - 1} hitSlop={8} onPress={() => save(index + 1)} style={{ opacity: index >= total - 1 ? 0.3 : 1 }}>
                <Ionicons color={colors.textPrimary} name="chevron-forward" size={22} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.body} style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.section, { color: colors.textMuted }]}>SELEÇÃO</Text>
              {chips(SPORTS, sport, (v) => set({ sport: v }))}
              <View style={styles.row2}>
                {field(tennis ? 'JOGADOR 1' : 'CASA', unsure.has('homeTeam'), (
                  <View style={styles.pickRow}><TeamBadge name={leg.homeTeam} size={18} variant={tennis ? 'player' : 'team'} /><Text numberOfLines={1} style={[styles.value, { color: colors.textPrimary }]}>{leg.homeTeam}</Text></View>
                ), () => setPicker('home'))}
                {field(tennis ? 'JOGADOR 2' : 'FORA', unsure.has('awayTeam'), (
                  <View style={styles.pickRow}><TeamBadge name={leg.awayTeam} size={18} variant={tennis ? 'player' : 'team'} /><Text numberOfLines={1} style={[styles.value, { color: colors.textPrimary }]}>{leg.awayTeam}</Text></View>
                ), () => setPicker('away'))}
              </View>
              {field(tennis ? 'TORNEIO' : 'COMPETIÇÃO', unsure.has('competition'), pickValue(leg.competition, 'Escolher'), () => setPicker('competition'))}
              {field('MERCADO', unsure.has('market'), pickValue(leg.market, 'Escolher mercado'), () => setPicker('market'))}
              {field('SELEÇÃO', unsure.has('selection'), (
                <>
                  {input(leg.selection, (v) => set({ selection: v }, 'selection'), { placeholder: 'Ex.: FC Porto, Mais de 2,5' })}
                  {chips(sideOptions, leg.selection, (v) => set({ selection: v }, 'selection'))}
                </>
              ))}
              <View style={styles.row3}>
                {fieldN('ODD', unsure.has('oddValue'), input(odd, (v) => { setOdd(v); set({}, 'oddValue'); }, { keyboard: 'decimal-pad', placeholder: '1,50', color: colors.gold }))}
                <View style={styles.flex2}>
                  <DatePickerField label="DATA DO JOGO" onChange={(d) => { setKickDay(d); set({}, 'eventDate'); }} onClear={() => setKickDay(null)} placeholder="Dia" value={kickDay} />
                </View>
                {fieldN('HORA', unsure.has('eventDate'), input(kickTime, (v) => { setKickTime(v); set({}, 'eventDate'); }, { keyboard: 'numbers-and-punctuation', placeholder: '20:45' }))}
              </View>
              {legOnly ? null : <Text style={[styles.sub, { color: unsure.has('result') ? colors.warning : colors.textMuted }]}>Resultado desta seleção</Text>}
              {legOnly ? null : chips(RESULTS, leg.result ?? 'PENDING', (v) => set({ result: v }, 'result'), unsure.has('result'))}
              {matchLine ? <Text style={[styles.sub, { color: colors.textSecondary }]}>Jogo real: {matchLine}</Text> : null}
              {onAdd ? (
                <Pressable onPress={() => { save(); onAdd(); }} style={[styles.addBtn, { borderColor: colors.border }]}>
                  <Ionicons color={colors.primary} name="add" size={18} />
                  <Text style={[styles.chipText, { color: colors.primary }]}>Adicionar seleção</Text>
                </Pressable>
              ) : null}

              {legOnly ? null : (<>
              <Text style={[styles.section, { color: colors.textMuted }]}>BOLETIM</Text>
              <Text style={[styles.sub, { color: colors.textMuted }]}>Casa de apostas</Text>
              <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
                {BETTING_SITES.map((s) => {
                  const active = s.slug === site;
                  return (
                    <Pressable key={s.slug} onPress={() => setSite(s.slug)} style={[styles.chip, styles.siteChip, { backgroundColor: active ? `${colors.primary}22` : colors.background, borderColor: active ? colors.primary : colors.border }]}>
                      <SiteMark size={16} slug={s.slug} textStyle={{ color: active ? colors.primary : colors.textSecondary, fontSize: 13 }} />
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.row3}>
                {fieldN('VALOR', false, input(stake, setStake, { keyboard: 'decimal-pad', placeholder: '10,00' }))}
                <View style={styles.flex2}>
                  <DatePickerField label="DATA DA APOSTA" onChange={setBetDay} onClear={() => setBetDay(null)} placeholder="Dia" value={betDay} />
                </View>
                {fieldN('HORA', false, input(betTime, setBetTime, { keyboard: 'numbers-and-punctuation', placeholder: '10:18' }))}
              </View>
              {saved ? (
                <>
                  <View style={[styles.switchRow, { backgroundColor: colors.background }]}>
                    <Text style={[styles.value, { color: colors.textPrimary }]}>Aposta gratuita (freebet)</Text>
                    <Switch onValueChange={(v) => setExtras((e) => ({ ...e, isFreebet: v }))} thumbColor="#FFFFFF" trackColor={{ false: colors.border, true: colors.primary }} value={extras.isFreebet} />
                  </View>
                  {field('CASHOUT RECEBIDO (VAZIO = SEM CASHOUT)', false, input(extras.cashout, (v) => setExtras((e) => ({ ...e, cashout: v })), { keyboard: 'decimal-pad', placeholder: '0,00' }))}
                  {field('NOTAS', false, input(extras.notes, (v) => setExtras((e) => ({ ...e, notes: v })), { placeholder: 'Porque fizeste esta aposta' }))}
                  <View style={[styles.switchRow, { backgroundColor: colors.background }]}>
                    <Text style={[styles.value, { color: colors.textPrimary }]}>Visível para amigos</Text>
                    <Switch onValueChange={(v) => setExtras((e) => ({ ...e, isPublic: v }))} thumbColor="#FFFFFF" trackColor={{ false: colors.border, true: colors.primary }} value={extras.isPublic} />
                  </View>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>O estado do boletim vem dos resultados das seleções.</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>Estado do boletim</Text>
                  {chips(BOLETIM_STATUS, status, setStatus)}
                </>
              )}
              </>)}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={onRemove} style={[styles.remove, { backgroundColor: `${colors.negative}1F` }]}>
                <Ionicons color={colors.negative} name="trash-outline" size={18} />
              </Pressable>
              <Pressable onPress={() => save()} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.saveText}>Guardar</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>

      <SearchableDropdown
        allowCustomValue
        isLoading={teams.isLoading}
        items={teamItems}
        onClose={() => setPicker(null)}
        onSelect={(v) => { set(picker === 'home' ? { homeTeam: v } : { awayTeam: v }, picker === 'home' ? 'homeTeam' : 'awayTeam'); setPicker(null); }}
        renderItemLeft={(it) => <TeamBadge imageUrl={it.imageUrl} name={it.value} size={22} variant={tennis ? 'player' : 'team'} />}
        title={tennis ? 'Jogador' : 'Equipa'}
        visible={picker === 'home' || picker === 'away'}
      />
      <SearchableDropdown allowCustomValue isLoading={comps.isLoading} items={compItems} onClose={() => setPicker(null)} onSelect={(v) => { set({ competition: v }, 'competition'); setPicker(null); }} title={tennis ? 'Torneio' : 'Competição'} visible={picker === 'competition'} />
      <SearchableDropdown allowCustomValue isLoading={markets.isLoading} items={marketItems} onClose={() => setPicker(null)} onSelect={(v) => { set({ market: v }, 'market'); setPicker(null); }} title="Mercado" visible={picker === 'market'} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  kav: { maxHeight: '92%' },
  scroll: { flexShrink: 1 },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, flexShrink: 1, paddingHorizontal: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', borderRadius: 2, height: 4, marginBottom: 8, width: 40 },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  body: { gap: 10, paddingBottom: 12 },
  section: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, marginTop: 8 },
  sub: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  row3: { alignItems: 'flex-end', flexDirection: 'row', gap: 8 },
  flex2: { flex: 1, minWidth: 150 },
  narrow: { flex: 0, width: 82 },
  field: { borderRadius: 12, borderWidth: 1, flex: 1, gap: 4, paddingHorizontal: 11, paddingVertical: 9 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.4 },
  value: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  input: { fontFamily: 'Inter_600SemiBold', fontSize: 15, padding: 0 },
  pickRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 11 },
  siteChip: { marginRight: 6 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  remove: { alignItems: 'center', borderRadius: 14, height: 50, justifyContent: 'center', width: 54 },
  saveBtn: { alignItems: 'center', borderRadius: 14, flex: 1, height: 50, justifyContent: 'center' },
  addBtn: { alignItems: 'center', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 42 },
  switchRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, minHeight: 48, paddingHorizontal: 12 },
  saveText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 15 },
});
