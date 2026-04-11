import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { hapticSelection } from '../../utils/haptics';
import { PressableScale } from './PressableScale';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, onPress, icon, style }: ChipProps) {
  const { colors, tokens } = useTheme();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        hapticSelection();
        onPress?.();
      }}
      scaleDown={0.95}
      style={[
        styles.base,
        {
          backgroundColor: selected ? colors.primary : colors.surfaceRaised,
          borderColor: selected ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        style={[
          styles.label,
          {
            color: selected ? '#FFFFFF' : colors.textSecondary,
            fontSize: tokens.font.sizes.sm,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontWeight: '600',
  },
});
