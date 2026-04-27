import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';

const STORAGE_KEY = 'contextual-banner-v1';

interface StoredState {
  date: string;
  dismissed: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Message {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  colorKey: 'primary' | 'danger' | 'warning' | 'info';
}

function deriveMessage(boletins: BoletinDetail[], pendingCount: number): Message | null {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // Sorted by date descending for streak calc
  const settled = [...boletins]
    .filter((b) => b.status !== BoletinStatus.PENDING && b.status !== BoletinStatus.VOID)
    .sort((a, b) => new Date(b.betDate ?? b.createdAt).getTime() - new Date(a.betDate ?? a.createdAt).getTime());

  // Win / loss streak
  let winStreak = 0;
  let lossStreak = 0;
  for (const b of settled) {
    if (b.status === BoletinStatus.WON || b.status === BoletinStatus.CASHOUT) {
      if (lossStreak > 0) break;
      winStreak++;
    } else if (b.status === BoletinStatus.LOST) {
      if (winStreak > 0) break;
      lossStreak++;
    } else {
      break;
    }
  }

  // Recent (7 days) P&L among settled
  const recentSettled = settled.filter(
    (b) => new Date(b.betDate ?? b.createdAt).getTime() >= now - weekMs,
  );
  const recentPL = recentSettled.reduce(
    (sum, b) => sum + Number(b.actualReturn ?? 0) - (b.isFreebet ? 0 : Number(b.stake)),
    0,
  );

  // Days since last bet (any status)
  const allSorted = [...boletins].sort(
    (a, b) => new Date(b.betDate ?? b.createdAt).getTime() - new Date(a.betDate ?? a.createdAt).getTime(),
  );
  const lastBetMs = allSorted.length > 0
    ? new Date(allSorted[0].betDate ?? allSorted[0].createdAt).getTime()
    : null;
  const daysSinceLast = lastBetMs != null
    ? Math.floor((now - lastBetMs) / (24 * 60 * 60 * 1000))
    : null;

  // Priority rules
  if (lossStreak >= 3) {
    return {
      icon: 'warning-outline',
      text: `${lossStreak} derrotas seguidas. Analisa os teus padrões antes de continuar.`,
      colorKey: 'danger',
    };
  }
  if (pendingCount >= 5) {
    return {
      icon: 'time-outline',
      text: `Tens ${pendingCount} apostas pendentes a aguardar resultado.`,
      colorKey: 'warning',
    };
  }
  if (winStreak >= 3) {
    return {
      icon: 'flame-outline',
      text: `${winStreak} vitórias seguidas! Mantém a disciplina e não aumentes o risco.`,
      colorKey: 'primary',
    };
  }
  if (recentSettled.length >= 3 && recentPL > 5) {
    return {
      icon: 'trending-up',
      text: `Boa semana! +€${recentPL.toFixed(2)} de lucro nos últimos 7 dias.`,
      colorKey: 'primary',
    };
  }
  if (recentSettled.length >= 3 && recentPL < -15) {
    return {
      icon: 'trending-down',
      text: `Esta semana perdeste €${Math.abs(recentPL).toFixed(2)}. Vai com mais calma.`,
      colorKey: 'danger',
    };
  }
  if (daysSinceLast !== null && daysSinceLast >= 7 && boletins.length > 0) {
    return {
      icon: 'journal-outline',
      text: `Última aposta há ${daysSinceLast} dias. Lembra-te de registar as tuas apostas.`,
      colorKey: 'info',
    };
  }

  return null;
}

interface Props {
  boletins: BoletinDetail[];
  pendingCount: number;
}

export function ContextualInsightBanner({ boletins, pendingCount }: Props) {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(true); // hidden until AsyncStorage resolves

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const state = JSON.parse(raw) as StoredState;
          if (state.date === today() && state.dismissed) return;
        }
        setDismissed(false);
      })
      .catch(() => setDismissed(false));
  }, []);

  const message = useMemo(
    () => (dismissed ? null : deriveMessage(boletins, pendingCount)),
    [boletins, pendingCount, dismissed],
  );

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today(), dismissed: true })).catch(() => {});
  }, []);

  if (dismissed || !message) return null;

  const accentColor =
    message.colorKey === 'primary' ? colors.primary
    : message.colorKey === 'danger' ? colors.danger
    : message.colorKey === 'warning' ? colors.warning
    : colors.info;

  return (
    <Animated.View
      entering={FadeInDown.delay(20).duration(200).springify()}
      exiting={FadeOut.duration(150)}
      style={[styles.banner, { backgroundColor: accentColor + '16', borderColor: accentColor + '45' }]}
    >
      <Ionicons name={message.icon} size={16} color={accentColor} style={styles.icon} />
      <Text style={[styles.text, { color: colors.textPrimary }]}>{message.text}</Text>
      <Pressable hitSlop={10} onPress={dismiss}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: { flexShrink: 0 },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
