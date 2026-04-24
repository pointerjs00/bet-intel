import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus, ItemResult } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';
import { formatCurrency, formatOdds } from '../../utils/formatters';
import { Button } from '../ui/Button';

// Lazy-require to handle builds where the native module is not yet linked.
type ViewShotType = React.ComponentType<{
  ref?: React.Ref<{ capture: () => Promise<string> }>;
  style?: object;
  children?: React.ReactNode;
}>;
let ViewShot: ViewShotType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ViewShot = (require('react-native-view-shot') as { default: ViewShotType }).default;
} catch {
  // Native module not linked in this build — share as text only.
}

interface ShareCardProps {
  boletin: BoletinDetail;
  onClose?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; emoji: string; bg: string }> = {
  WON: { label: 'GANHOU!', emoji: '🎉', bg: '#00C851' },
  LOST: { label: 'PERDEU', emoji: '💸', bg: '#FF3B30' },
  PENDING: { label: 'PENDENTE', emoji: '⏳', bg: '#FF9500' },
  VOID: { label: 'CANCELADO', emoji: '🚫', bg: '#8E8E93' },
  PARTIAL: { label: 'PARCIAL', emoji: '⚖️', bg: '#FF9500' },
  CASHOUT: { label: 'CASHOUT', emoji: '💰', bg: '#007AFF' },
};

const RESULT_ICON: Record<string, string> = {
  WON: '✓',
  LOST: '✗',
  PENDING: '⏳',
  VOID: '—',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

export function ShareCard({ boletin, onClose }: ShareCardProps) {
  const viewShotRef = useRef<{ capture: () => Promise<string> }>(null);
  const { colors } = useTheme();
  const [sharing, setSharing] = useState(false);

  const statusCfg = STATUS_CONFIG[boletin.status] ?? STATUS_CONFIG.PENDING;

  const stake = parseFloat(boletin.stake);
  const totalOdds = parseFloat(boletin.totalOdds);
  const actualReturn = boletin.actualReturn ? parseFloat(boletin.actualReturn) : null;
  const potentialReturn = parseFloat(boletin.potentialReturn);
  const profitLoss = actualReturn !== null ? actualReturn - stake : null;

  const handleShare = useCallback(async () => {
    if (!viewShotRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partilhar boletim' });
      }
    } finally {
      setSharing(false);
    }
  }, []);

  return (
    <View style={styles.wrapper}>
      {ViewShot ? (
        <ViewShot ref={viewShotRef} style={styles.shotContainer}>
          <View style={styles.card}>
          {/* Status banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusCfg.bg }]}>
            <Text style={styles.statusEmoji}>{statusCfg.emoji}</Text>
            <Text style={styles.statusLabel}>{statusCfg.label}</Text>
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.brandText}>BetIntel</Text>
            <Text style={styles.dateText}>{formatDate(boletin.betDate ?? boletin.createdAt)}</Text>
          </View>

          {boletin.name && <Text style={styles.boletinName}>{boletin.name}</Text>}

          {/* Selections */}
          <View style={styles.selectionsContainer}>
            {boletin.items.slice(0, 6).map((item) => (
              <View key={item.id} style={styles.selectionRow}>
                <Text style={[styles.resultIcon, { color: item.result === ItemResult.WON ? '#00C851' : item.result === ItemResult.LOST ? '#FF3B30' : '#888' }]}>
                  {RESULT_ICON[item.result] ?? '⏳'}
                </Text>
                <View style={styles.selectionInfo}>
                  <Text numberOfLines={1} style={styles.matchText}>
                    {item.homeTeam} vs {item.awayTeam}
                  </Text>
                  <Text numberOfLines={1} style={styles.marketText}>
                    {item.market}: {item.selection}
                  </Text>
                </View>
                <Text style={styles.oddText}>{formatOdds(parseFloat(item.oddValue))}</Text>
              </View>
            ))}
            {boletin.items.length > 6 && (
              <Text style={styles.moreText}>+ {boletin.items.length - 6} mais</Text>
            )}
          </View>

          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Stake</Text>
              <Text style={styles.summaryValue}>{formatCurrency(stake)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Odds</Text>
              <Text style={styles.summaryValue}>{formatOdds(totalOdds)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{actualReturn !== null ? 'Retorno' : 'Possível'}</Text>
              <Text style={[styles.summaryValue, { color: profitLoss !== null ? (profitLoss >= 0 ? '#00C851' : '#FF3B30') : '#fff' }]}>
                {formatCurrency(actualReturn ?? potentialReturn)}
              </Text>
            </View>
          </View>

          {profitLoss !== null && (
            <View style={styles.profitRow}>
              <Text style={[styles.profitLabel, { color: profitLoss >= 0 ? '#00C851' : '#FF3B30' }]}>
                {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)}
              </Text>
            </View>
          )}

          {/* Watermark */}
          <Text style={styles.watermark}>betintel.app</Text>
        </View>
        </ViewShot>
      ) : (
        <View style={[styles.shotContainer, styles.card]}>
          <Text style={[styles.watermark, { color: colors.textSecondary }]}>
            Partilha de imagem não disponível nesta versão.
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Button
          title={sharing ? 'A partilhar…' : 'Partilhar imagem'}
          onPress={handleShare}
          disabled={sharing}
        />
        {onClose && (
          <Button title="Fechar" variant="ghost" onPress={onClose} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 16, alignItems: 'center' },
  shotContainer: { borderRadius: 16, overflow: 'hidden' },
  card: {
    width: 340,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    overflow: 'hidden',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  statusEmoji: { fontSize: 22 },
  statusLabel: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  brandText: { fontSize: 16, fontWeight: '900', color: '#00C851' },
  dateText: { fontSize: 12, fontWeight: '600', color: '#888' },
  boletinName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ddd',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  selectionsContainer: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  selectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultIcon: { fontSize: 14, fontWeight: '900', width: 18, textAlign: 'center' },
  selectionInfo: { flex: 1, gap: 1 },
  matchText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  marketText: { fontSize: 10, fontWeight: '600', color: '#888' },
  oddText: { fontSize: 13, fontWeight: '900', color: '#FFD700' },
  moreText: { fontSize: 11, fontWeight: '600', color: '#666', textAlign: 'center', marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#2E2E2E',
    marginTop: 12,
  },
  summaryItem: { alignItems: 'center', gap: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
  summaryValue: { fontSize: 16, fontWeight: '900', color: '#fff' },
  profitRow: { alignItems: 'center', paddingBottom: 8 },
  profitLabel: { fontSize: 18, fontWeight: '900' },
  watermark: { fontSize: 10, fontWeight: '600', color: '#444', textAlign: 'center', paddingBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 12 },
});
