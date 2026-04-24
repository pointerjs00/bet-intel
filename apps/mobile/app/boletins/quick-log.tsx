import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import type { ItemResult, Sport } from '@betintel/shared';

import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { NumericInput } from '../../components/ui/NumericInput';
import { useToast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { tokens } from '../../theme/tokens';
import { createBoletinRequest, updateBoletinItemsRequest, boletinQueryKeys } from '../../services/boletinService';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

/* ─── Quick-select options ─── */

const SPORT_OPTIONS: Array<{ value: Sport; label: string; icon: string }> = [
  { value: 'FOOTBALL', label: 'Futebol', icon: '⚽' },
  { value: 'BASKETBALL', label: 'Basquete', icon: '🏀' },
  { value: 'TENNIS', label: 'Ténis', icon: '🎾' },
  { value: 'HANDBALL', label: 'Andebol', icon: '🤾' },
  { value: 'VOLLEYBALL', label: 'Voleibol', icon: '🏐' },
  { value: 'HOCKEY', label: 'Hóquei', icon: '🏒' },
];

interface MarketOption {
  market: string;
  selections: string[];
}

const MARKET_OPTIONS: MarketOption[] = [
  { market: '1X2', selections: ['1', 'X', '2'] },
  { market: 'Dupla Hipótese', selections: ['1X', '12', 'X2'] },
  { market: 'Mais/Menos 2.5', selections: ['Mais', 'Menos'] },
  { market: 'Ambas Marcam', selections: ['Sim', 'Não'] },
  { market: 'Handicap', selections: ['1', '2'] },
  { market: 'Resultado Exato', selections: [] },
];

const RESULT_OPTIONS: Array<{ value: ItemResult | 'PENDING'; label: string; icon: string; color: string }> = [
  { value: 'PENDING', label: 'Pendente', icon: 'time-outline', color: 'warning' },
  { value: 'WON', label: 'Ganhou', icon: 'checkmark-circle', color: 'primary' },
  { value: 'LOST', label: 'Perdeu', icon: 'close-circle', color: 'danger' },
  { value: 'VOID', label: 'Cancelado', icon: 'ban', color: 'textMuted' },
];

export default function QuickLogScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const homeRef = useRef<TextInput>(null);
  const awayRef = useRef<TextInput>(null);

  const selectionRef = useRef<TextInput>(null);

  /* ─── Form state ─── */
  const [sport, setSport] = useState<Sport>('FOOTBALL');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<MarketOption>(MARKET_OPTIONS[0]!);
  const [customMarket, setCustomMarket] = useState('');
  const [selection, setSelection] = useState('1');
  const [oddValue, setOddValue] = useState('');
  const [stake, setStake] = useState('');
  const [result, setResult] = useState<ItemResult | 'PENDING'>('PENDING');
  const [saving, setSaving] = useState(false);
  const [logCount, setLogCount] = useState(0);

  const isCustomMarket = selectedMarket.selections.length === 0;
  const resolvedMarket = isCustomMarket ? customMarket.trim() : selectedMarket.market;

  const parsedOdd = useMemo(() => {
    const v = parseFloat(oddValue.replace(',', '.'));
    return !isNaN(v) && v >= 1.01 ? v : 0;
  }, [oddValue]);

  const parsedStake = useMemo(() => {
    const v = parseFloat(stake.replace(',', '.'));
    return !isNaN(v) && v > 0 ? v : 0;
  }, [stake]);

  const potentialReturn = parsedOdd > 0 && parsedStake > 0 ? parsedOdd * parsedStake : 0;

  const canSave = homeTeam.trim().length > 0 && awayTeam.trim().length > 0 && resolvedMarket.length > 0 && selection.trim().length > 0 && parsedOdd > 0 && parsedStake > 0;

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!canSave || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      const created = await createBoletinRequest({
        stake: parsedStake,
        items: [{
          homeTeam: homeTeam.trim(),
          awayTeam: awayTeam.trim(),
          sport,
          market: resolvedMarket,
          selection: selection.trim(),
          oddValue: parsedOdd,
        }],
        betDate: new Date().toISOString(),
        isPublic: false,
        isFreebet: false,
      });

      // If user chose a result other than PENDING, resolve immediately
      if (result !== 'PENDING' && created.items.length > 0) {
        await updateBoletinItemsRequest(created.id, created.items.map(item => ({
          id: item.id,
          result: result as ItemResult,
        })));
      }

      await queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      hapticSuccess();
      setLogCount(prev => prev + 1);

      // Clear form but keep sport
      setHomeTeam('');
      setAwayTeam('');
      setOddValue('');
      setStake('');
      setSelection(selectedMarket.selections[0] ?? '');
      setCustomMarket('');
      setResult('PENDING');

      showToast('Boletim registado!', 'success');
      homeRef.current?.focus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao guardar';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, parsedStake, homeTeam, awayTeam, sport, resolvedMarket, selection, parsedOdd, result, queryClient, showToast, selectedMarket.selections]);

  const handleMarketSelect = useCallback((m: MarketOption) => {
    hapticLight();
    setSelectedMarket(m);
    setSelection(m.selections[0] ?? '');
    setCustomMarket('');
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>⚡ Registo Rápido</Text>
          {logCount > 0 && (
            <Animated.View entering={FadeInUp.duration(200)} style={[styles.counterBadge, { backgroundColor: `${colors.primary}20` }]}>
              <Text style={[styles.counterText, { color: colors.primary }]}>{logCount} registado{logCount !== 1 ? 's' : ''}</Text>
            </Animated.View>
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Sport pills */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Desporto</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {SPORT_OPTIONS.map(s => {
                const active = sport === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => { hapticLight(); setSport(s.value); }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active ? `${colors.primary}20` : colors.surfaceRaised,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.pillIcon}>{s.icon}</Text>
                    <Text style={[styles.pillLabel, { color: active ? colors.primary : colors.textPrimary }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Teams */}
          <Card style={styles.teamsCard}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Equipas</Text>
            <View style={styles.teamsRow}>
              <TextInput
                ref={homeRef}
                style={[styles.teamInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Casa"
                placeholderTextColor={colors.textMuted}
                value={homeTeam}
                onChangeText={setHomeTeam}
                returnKeyType="next"
                onSubmitEditing={() => awayRef.current?.focus()}
                autoCapitalize="words"
              />
              <Text style={[styles.vsText, { color: colors.textMuted }]}>vs</Text>
              <TextInput
                ref={awayRef}
                style={[styles.teamInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Fora"
                placeholderTextColor={colors.textMuted}
                value={awayTeam}
                onChangeText={setAwayTeam}
                returnKeyType="done"
                autoCapitalize="words"
              />
            </View>
          </Card>

          {/* Market pills */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Mercado</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {MARKET_OPTIONS.map(m => {
                const active = selectedMarket.market === m.market;
                return (
                  <Pressable
                    key={m.market}
                    onPress={() => handleMarketSelect(m)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active ? `${colors.primary}20` : colors.surfaceRaised,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.pillLabel, { color: active ? colors.primary : colors.textPrimary }]}>{m.market}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Custom market input */}
          {isCustomMarket && (
            <Animated.View entering={FadeInDown.duration(200)}>
              <TextInput
                style={[styles.customMarketInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Nome do mercado (ex: Exato 2-1)"
                placeholderTextColor={colors.textMuted}
                value={customMarket}
                onChangeText={setCustomMarket}
                autoCapitalize="sentences"
              />
            </Animated.View>
          )}

          {/* Selection pills */}
          {selectedMarket.selections.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Seleção</Text>
              <View style={styles.selectionRow}>
                {selectedMarket.selections.map(s => {
                  const active = selection === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => { hapticLight(); setSelection(s); }}
                      style={[
                        styles.selectionPill,
                        {
                          backgroundColor: active ? colors.primary : colors.surfaceRaised,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.selectionPillText, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Custom selection input for Resultado Exato */}
          {isCustomMarket && (
            <Animated.View entering={FadeInDown.duration(200)}>
              <TextInput
                ref={selectionRef}
                style={[styles.customMarketInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Seleção (ex: 2-1)"
                placeholderTextColor={colors.textMuted}
                value={selection}
                onChangeText={setSelection}
              />
            </Animated.View>
          )}

          {/* Odds + Stake row */}
          <Card style={styles.numbersCard}>
            <View style={styles.numbersRow}>
              <View style={styles.numberField}>
                <NumericInput
                  allowDecimal
                  label="Odd"
                  maxLength={6}
                  onChangeText={setOddValue}
                  placeholder="1.85"
                  value={oddValue}
                />
              </View>
              <View style={styles.numberField}>
                <NumericInput
                  allowDecimal
                  label="Stake"
                  maxLength={8}
                  onChangeText={setStake}
                  placeholder="5.00"
                  suffix="€"
                  value={stake}
                />
              </View>
            </View>
            {potentialReturn > 0 && (
              <Animated.View entering={FadeInDown.duration(200)} style={[styles.returnRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.returnLabel, { color: colors.textSecondary }]}>Retorno potencial</Text>
                <Text style={[styles.returnValue, { color: colors.primary }]}>€{potentialReturn.toFixed(2)}</Text>
              </Animated.View>
            )}
          </Card>

          {/* Result pills (optional) */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Resultado (opcional)</Text>
            <View style={styles.resultRow}>
              {RESULT_OPTIONS.map(r => {
                const active = result === r.value;
                const c = colors[r.color as keyof typeof colors] ?? colors.textMuted;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => { hapticLight(); setResult(r.value); }}
                    style={[
                      styles.resultPill,
                      {
                        backgroundColor: active ? `${c}20` : colors.surfaceRaised,
                        borderColor: active ? c : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name={r.icon as any} size={16} color={active ? c : colors.textMuted} />
                    <Text style={[styles.resultPillText, { color: active ? c : colors.textSecondary }]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Save button */}
          <Button
            title={saving ? 'A guardar...' : 'Guardar e continuar'}
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            leftSlot={<Ionicons name="flash" size={18} color="#FFFFFF" />}
            style={styles.saveBtn}
          />

          {logCount > 0 && (
            <Animated.View entering={FadeInUp.duration(300)}>
              <Button
                title="Ver boletins"
                variant="ghost"
                onPress={() => router.back()}
                style={styles.viewBtn}
              />
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerCenter: { alignItems: 'center', flex: 1, gap: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  counterBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  counterText: { fontSize: 12, fontWeight: '700' },
  content: { gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pillRow: { gap: 8 },
  pill: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillIcon: { fontSize: 16 },
  pillLabel: { fontSize: 13, fontWeight: '600' },
  teamsCard: { gap: 10 },
  teamsRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  teamInput: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  vsText: { fontSize: 13, fontWeight: '800' },
  selectionRow: { flexDirection: 'row', gap: 8 },
  selectionPill: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  selectionPillText: { fontSize: 14, fontWeight: '700' },
  customMarketInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  numbersCard: { gap: 10 },
  numbersRow: { flexDirection: 'row', gap: 12 },
  numberField: { flex: 1, gap: 6 },
  numberInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  returnRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  returnLabel: { fontSize: 13, fontWeight: '600' },
  returnValue: { fontSize: 18, fontWeight: '900' },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultPill: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resultPillText: { fontSize: 12, fontWeight: '700' },
  saveBtn: { marginTop: 4 },
  viewBtn: { marginTop: 0 },
});
