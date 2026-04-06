import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BoletinStatus } from '@betintel/shared';
import { useTheme } from '../../theme/useTheme';

interface StatusBadgeProps {
  status: BoletinStatus;
}

/** Small status badge used across boletin list and detail screens. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { colors } = useTheme();
  const palette = getPalette(status, colors);

  return (
    <View style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]}>{getLabel(status)}</Text>
    </View>
  );
}

function getLabel(status: BoletinStatus): string {
  switch (status) {
    case BoletinStatus.WON:
      return 'Ganhou';
    case BoletinStatus.LOST:
      return 'Perdeu';
    case BoletinStatus.VOID:
      return 'Void';
    case BoletinStatus.PARTIAL:
      return 'Parcial';
    case BoletinStatus.CASHOUT:
      return 'Cashout';
    case BoletinStatus.PENDING:
    default:
      return 'Pendente';
  }
}

function getPalette(status: BoletinStatus, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case BoletinStatus.WON:
      return {
        background: 'rgba(0, 200, 81, 0.12)',
        border: 'rgba(0, 200, 81, 0.24)',
        text: colors.primary,
      };
    case BoletinStatus.LOST:
      return {
        background: 'rgba(255, 59, 48, 0.12)',
        border: 'rgba(255, 59, 48, 0.24)',
        text: colors.danger,
      };
    case BoletinStatus.VOID:
      return {
        background: 'rgba(0, 122, 255, 0.12)',
        border: 'rgba(0, 122, 255, 0.24)',
        text: colors.info,
      };
    case BoletinStatus.PARTIAL:
      return {
        background: 'rgba(255, 149, 0, 0.14)',
        border: 'rgba(255, 149, 0, 0.24)',
        text: colors.warning,
      };
    case BoletinStatus.CASHOUT:
      return {
        background: 'rgba(255, 215, 0, 0.14)',
        border: 'rgba(255, 215, 0, 0.32)',
        text: colors.gold,
      };
    case BoletinStatus.PENDING:
    default:
      return {
        background: 'rgba(255, 149, 0, 0.12)',
        border: 'rgba(255, 149, 0, 0.2)',
        text: colors.warning,
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
  },
});