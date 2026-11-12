// Confirmar boletim: the one place a new boletim is finished, whatever started it (Escolher jogo,
// writing a selection by hand, Duplicar). Order: selections → value → site and date → extras.
// Replaces the old "Manual" form (create.tsx) and "Registo rápido" (quick-log.tsx).

import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import { Sport } from '@betintel/shared';
import { EditLegSheet } from '../../components/import/EditLegSheet';
import { AppText } from '../../components/ui/AppText';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { useCardElevation } from '../../components/ui/ListCard';
import { Pressable } from '../../components/ui/Pressable';
import { SiteMark } from '../../components/ui/SiteMark';
import { TeamBadge } from '../../components/ui/TeamBadge';
import { useToast } from '../../components/ui/Toast';
import type { ParsedBetclicBoletin } from '../../services/importService';
import { usePersonalStats } from '../../services/statsService';
import { useBoletinBuilderStore, type BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds, formatPercentage, plural } from '../../utils/formatters';
import { BETTING_SITES } from '../../utils/sportAssets';

const LAST_SITE_KEY = 'betintel:last-site';
const STAKES = [5, 10, 20, 50];
const pad = (n: number) => String(n).padStart(2, '0');
const ddmmyyyy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fromDDMMYYYY = (s: string): Date | null => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};

const blankLeg = (sport: string, competition = '') => ({ homeTeam: '', awayTeam: '', competition, sport, market: '', selection: '', oddValue: 0, result: 'PENDING' as const });

export default function ConfirmarBoletimScreen() {
  const { manual } = useLocalSearchParams<{ manual?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const { showToast } = useToast();
  const b = useBoletinBuilderStore();
  const stats = usePersonalStats('all', [], undefined, undefined, true).data;

  const [stakeText, setStakeText] = useState(b.stake > 0 ? String(b.stake).replace('.', ',') : '');
  const [more, setMore] = useState(Boolean(b.name || b.notes));
  const [saving, setSaving] = useState(false);
  // Sheet editing: index into the builder items, or "new" for a blank selection.
  const [sheet, setSheet] = useState<{ draft: ParsedBetclicBoletin; index: number } | null>(null);

  // Last site used, by default (almost always the same house).
  useEffect(() => {
    if (b.siteSlug) return;
    AsyncStorage.getItem(LAST_SITE_KEY).then((v) => { if (v) b.setSiteSlug(v); }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openSheet = (index: number | 'new') => {
    const items = b.items.map((it) => ({ homeTeam: it.homeTeam, awayTeam: it.awayTeam, competition: it.competition, sport: it.sport, market: it.market, selection: it.selection, oddValue: it.oddValue, eventDate: it.eventDate ?? undefined }));
    const last = b.items[b.items.length - 1];
    const all = index === 'new' ? [...items, blankLeg(last?.sport ?? Sport.FOOTBALL, last?.competition ?? '')] : items;
    setSheet({
      draft: { reference: 'novo', betDate: new Date().toISOString(), stake: b.stake, totalOdds: b.totalOdds, potentialReturn: b.potentialReturn, status: 'PENDING', parseError: false, items: all },
      index: index === 'new' ? all.length - 1 : index,
    });
  };

  // "Escrever" from Escolher jogo / the hub opens a blank selection straight away.
  useEffect(() => { if (manual === '1') openSheet('new'); }, [manual]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Writes the sheet's selections back into the builder (replacing them, keeping order). */
  const applyDraft = (draft: ParsedBetclicBoletin) => {
    const keep = draft.items.filter((it) => it.homeTeam && it.awayTeam && it.market && it.selection && it.oddValue > 1);
    for (const it of [...b.items]) b.removeItem(it.id);
    keep.forEach((it, i) => b.addItem({
      id: b.items[i]?.id ?? `leg-${Date.now()}-${i}`,
      homeTeam: it.homeTeam, awayTeam: it.awayTeam, competition: it.competition || 'Outra', sport: it.sport as Sport,
      market: it.market, selection: it.selection, oddValue: it.oddValue, eventDate: it.eventDate ?? null,
    } as BoletinBuilderItem));
  };

  const stake = Number(stakeText.replace(',', '.'));
  const legCount = b.items.length;
  const projection = useMemo(() => {
    if (!stats || legCount === 0) return null;
    const row = stats.byLegCount.find((r) => r.legCount === legCount);
    if (!row || row.totalBets < 5) return null;
    return `${legCount === 1 ? 'Simples' : `Múltiplas de ${legCount}`}: o teu retorno é ${formatPercentage(row.roi, 1, true)} (${plural(row.totalBets, 'boletim', 'boletins')}).`;
  }, [stats, legCount]);

  const save = async () => {
    if (!legCount) { showToast('Adiciona pelo menos uma seleção.', 'error'); return; }
    if (!(stake > 0)) { showToast('Indica o valor apostado.', 'error'); return; }
    setSaving(true);
    try {
      b.setStake(stake);
      if (b.siteSlug) await AsyncStorage.setItem(LAST_SITE_KEY, b.siteSlug).catch(() => undefined);
      const created = await useBoletinBuilderStore.getState().save();
      showToast('Boletim guardado.', 'success');
      router.replace({ pathname: '/boletins/[id]', params: { id: created.id } });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const card = [styles.card, elevation, { backgroundColor: colors.surface }];
  const betDay = fromDDMMYYYY(b.betDate) ?? new Date();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Confirmar boletim' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
          <AppText variant="label" tone="secondary">{legCount ? `Seleções · odd ${formatOdds(b.totalOdds)}` : 'Seleções'}</AppText>
          <View style={card}>
            {b.items.map((it, i) => (
              <Animated.View entering={FadeIn.duration(200)} key={it.id} layout={Layout.springify()}>
                <Pressable onPress={() => openSheet(i)} style={[styles.leg, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <TeamBadge name={it.homeTeam} size={22} variant={it.sport === Sport.TENNIS ? 'player' : 'team'} />
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.legSel, { color: colors.textPrimary }]}>{it.selection}</Text>
                    <Text numberOfLines={1} style={[styles.legSub, { color: colors.textMuted }]}>{it.homeTeam} vs {it.awayTeam} · {it.market}</Text>
                  </View>
                  <Text style={[styles.odd, { color: colors.gold }]}>{formatOdds(it.oddValue)}</Text>
                  <Pressable accessibilityLabel="Retirar seleção" hitSlop={8} onPress={() => b.removeItem(it.id)}>
                    <Ionicons color={colors.textMuted} name="close" size={18} />
                  </Pressable>
                </Pressable>
              </Animated.View>
            ))}
            <View style={[styles.addRow, legCount > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Pressable onPress={() => router.push('/boletins/por-jogo')} style={styles.addBtn}>
                <Ionicons color={colors.primary} name="football-outline" size={16} />
                <Text style={[styles.addText, { color: colors.primary }]}>Escolher jogo</Text>
              </Pressable>
              <Pressable onPress={() => openSheet('new')} style={styles.addBtn}>
                <Ionicons color={colors.primary} name="create-outline" size={16} />
                <Text style={[styles.addText, { color: colors.primary }]}>Escrever</Text>
              </Pressable>
            </View>
          </View>

          <AppText variant="label" tone="secondary">Valor</AppText>
          <View style={card}>
            <View style={styles.stakeRow}>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={(t) => { setStakeText(t); const n = Number(t.replace(',', '.')); if (n > 0) b.setStake(n); }}
                placeholder="0,00"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                style={[styles.stakeInput, { color: colors.textPrimary }]}
                value={stakeText}
              />
              <Text style={[styles.euro, { color: colors.textMuted }]}>€</Text>
              <View style={styles.flex} />
              {stake > 0 && legCount ? <Text style={[styles.ret, { color: colors.textSecondary }]}>podes receber <Text style={{ color: colors.positive }}>{formatCurrency(stake * b.totalOdds)}</Text></Text> : null}
            </View>
            <View style={styles.chips}>
              {STAKES.map((v) => (
                <Pressable key={v} onPress={() => { setStakeText(String(v)); b.setStake(v); }} style={[styles.chip, { backgroundColor: stake === v ? `${colors.primary}22` : colors.background }]}>
                  <Text style={[styles.chipText, { color: stake === v ? colors.primary : colors.textSecondary }]}>{v} €</Text>
                </Pressable>
              ))}
            </View>
            {projection ? <Text style={[styles.hint, { color: colors.textMuted }]}>{projection}</Text> : null}
          </View>

          <AppText variant="label" tone="secondary">Casa e data</AppText>
          <View style={card}>
            <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
              {BETTING_SITES.map((s) => {
                const on = s.slug === b.siteSlug;
                return (
                  <Pressable key={s.slug} onPress={() => b.setSiteSlug(on ? '' : s.slug)} style={[styles.chip, styles.siteChip, { backgroundColor: on ? `${colors.primary}22` : colors.background }]}>
                    <SiteMark size={16} slug={s.slug} textStyle={{ color: on ? colors.primary : colors.textSecondary, fontSize: 13 }} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <DatePickerField label="Data da aposta" onChange={(d) => b.setBetDate(ddmmyyyy(d))} onClear={() => b.setBetDate(ddmmyyyy(new Date()))} value={betDay} />
            <View style={styles.switchRow}>
              <Text style={[styles.flex, styles.switchText, { color: colors.textPrimary }]}>Aposta gratuita (freebet)</Text>
              <Switch onValueChange={b.setFreebet} thumbColor="#FFFFFF" trackColor={{ false: colors.border, true: colors.primary }} value={b.isFreebet} />
            </View>
          </View>

          <Pressable onPress={() => setMore((v) => !v)} style={[styles.moreRow, { backgroundColor: colors.surface }]}>
            <Text style={[styles.flex, styles.switchText, { color: colors.textPrimary }]}>Nome, notas e visibilidade</Text>
            <Ionicons color={colors.textMuted} name={more ? 'chevron-up' : 'chevron-down'} size={18} />
          </Pressable>
          {more ? (
            <View style={card}>
              <TextInput onChangeText={b.setName} placeholder="Nome (opcional)" placeholderTextColor={colors.textMuted} style={[styles.textField, { backgroundColor: colors.background, color: colors.textPrimary }]} value={b.name} />
              <TextInput multiline onChangeText={b.setNotes} placeholder="Notas: porque fizeste esta aposta" placeholderTextColor={colors.textMuted} style={[styles.textField, styles.notes, { backgroundColor: colors.background, color: colors.textPrimary }]} value={b.notes} />
              <View style={styles.switchRow}>
                <Text style={[styles.flex, styles.switchText, { color: colors.textPrimary }]}>Visível para amigos</Text>
                <Switch onValueChange={b.setPublic} thumbColor="#FFFFFF" trackColor={{ false: colors.border, true: colors.primary }} value={b.isPublic} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
          <Pressable disabled={saving} onPress={save} style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
            <Text style={styles.saveText}>{saving ? 'A guardar…' : legCount ? `Guardar boletim · ${plural(legCount, 'seleção', 'seleções')}` : 'Guardar boletim'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {sheet ? (
        <EditLegSheet
          boletin={sheet.draft}
          index={sheet.index}
          legOnly
          onClose={() => setSheet(null)}
          onNavigate={(i) => setSheet((s) => (s ? { ...s, index: i } : s))}
          onRemove={() => {
            const items = sheet.draft.items.filter((_, i) => i !== sheet.index);
            applyDraft({ ...sheet.draft, items });
            setSheet(null);
          }}
          onSave={(d) => { applyDraft(d); setSheet((s) => (s ? { ...s, draft: d } : s)); }}
          visible
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { gap: 10, padding: 16 },
  card: { borderRadius: 18, gap: 12, padding: 14 },
  leg: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 8 },
  legSel: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  legSub: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  odd: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  addRow: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  addBtn: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 40 },
  addText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  stakeRow: { alignItems: 'baseline', flexDirection: 'row', gap: 6 },
  stakeInput: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, minWidth: 90, padding: 0 },
  euro: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22 },
  ret: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 36, paddingHorizontal: 14 },
  siteChip: { marginRight: 6 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  switchRow: { alignItems: 'center', flexDirection: 'row', minHeight: 40 },
  switchText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  moreRow: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', minHeight: 50, paddingHorizontal: 14 },
  textField: { borderRadius: 12, fontFamily: 'Inter_500Medium', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  footer: { bottom: 0, left: 0, paddingHorizontal: 16, paddingTop: 8, position: 'absolute', right: 0 },
  saveBtn: { alignItems: 'center', borderRadius: 16, height: 54, justifyContent: 'center' },
  saveText: { color: '#06110B', fontFamily: 'Inter_700Bold', fontSize: 16 },
});
