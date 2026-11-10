// Personal limits and alerts (plan #34). Values live on the device (limitsStore);
// the Início dashboard shows a warning when a limit is close or loss-chasing is detected.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { AppText } from '../components/ui/AppText';
import { ListCard, ListRow } from '../components/ui/ListCard';
import { useBoletins } from '../services/boletinService';
import { useLimitsStore } from '../stores/limitsStore';
import { useTheme } from '../theme/useTheme';
import { computeLimitStatus } from '../utils/bettingLimits';
import { formatCurrency } from '../utils/formatters';

function parseAmount(text: string): number | null {
  const n = Number(text.replace(/[^\d,.]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export default function LimitsScreen() {
  const { colors } = useTheme();
  const { weeklyLossLimit, monthlyStakeLimit, chaseAlert, setWeeklyLossLimit, setMonthlyStakeLimit, setChaseAlert } = useLimitsStore();
  const [weekText, setWeekText] = useState(weeklyLossLimit ? String(weeklyLossLimit).replace('.', ',') : '');
  const [monthText, setMonthText] = useState(monthlyStakeLimit ? String(monthlyStakeLimit).replace('.', ',') : '');
  const boletins = useBoletins().data;

  const status = useMemo(
    () => computeLimitStatus(boletins ?? [], { weeklyLossLimit, monthlyStakeLimit }),
    [boletins, weeklyLossLimit, monthlyStakeLimit],
  );

  const inputStyle = [styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Limites e alertas',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }}>
        <AppText variant="caption">
          Define até onde queres ir. Quando estiveres perto de um limite, o Início avisa-te. Os valores ficam só neste telemóvel.
        </AppText>

        <ListCard>
          <ListRow>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Perda máxima por semana</AppText>
              <AppText variant="caption">
                Esta semana: {status.weekLoss > 0 ? `−${formatCurrency(status.weekLoss)}` : 'sem perdas'}
              </AppText>
            </View>
            <TextInput
              accessibilityLabel="Perda máxima por semana, em euros"
              keyboardType="decimal-pad"
              onChangeText={setWeekText}
              onEndEditing={() => setWeeklyLossLimit(parseAmount(weekText))}
              placeholder="Sem limite"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
              value={weekText}
            />
          </ListRow>
          {status.weekLossRatio !== null ? <Progress ratio={status.weekLossRatio} /> : null}

          <ListRow>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Apostado por mês</AppText>
              <AppText variant="caption">Este mês: {formatCurrency(status.monthStaked)}</AppText>
            </View>
            <TextInput
              accessibilityLabel="Valor máximo apostado por mês, em euros"
              keyboardType="decimal-pad"
              onChangeText={setMonthText}
              onEndEditing={() => setMonthlyStakeLimit(parseAmount(monthText))}
              placeholder="Sem limite"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
              value={monthText}
            />
          </ListRow>
          {status.monthStakeRatio !== null ? <Progress ratio={status.monthStakeRatio} /> : null}

          <ListRow>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Alerta de perseguição de perdas</AppText>
              <AppText variant="caption">
                Avisa quando apostas pelo menos o dobro do habitual ({formatCurrency(status.usualStake)}) até 24 h depois de perder.
              </AppText>
            </View>
            <Switch
              accessibilityLabel="Alerta de perseguição de perdas"
              onValueChange={setChaseAlert}
              thumbColor={chaseAlert ? colors.primary : colors.textMuted}
              trackColor={{ false: colors.border, true: `${colors.primary}66` }}
              value={chaseAlert}
            />
          </ListRow>
        </ListCard>
      </ScrollView>
    </>
  );
}

function Progress({ ratio }: { ratio: number }) {
  const { colors } = useTheme();
  const color = ratio >= 1 ? colors.danger : ratio >= 0.8 ? colors.warning : colors.primary;
  return (
    <View style={styles.progressWrap}>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={{ backgroundColor: color, borderRadius: 3, height: 6, width: `${Math.min(100, ratio * 100)}%` }} />
      </View>
      <AppText style={{ color }} variant="label">{Math.round(ratio * 100)}%</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 48 },
  flex: { flex: 1, gap: 2 },
  input: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, minHeight: 44, minWidth: 104, paddingHorizontal: 12, textAlign: 'right' },
  progressWrap: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 16 },
  track: { borderRadius: 3, flex: 1, height: 6, overflow: 'hidden' },
});
