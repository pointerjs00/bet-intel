import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/useTheme';

/** Elevation used by every v2 card: soft shadow, no border (PLANO_MELHORIAS.md §6.2). */
export function useCardElevation(): ViewStyle {
  const { isDark } = useTheme();
  return Platform.select<ViewStyle>({
    ios: isDark
      ? { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }
      : { shadowColor: '#17181A', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: isDark ? 6 : 3 },
  })!;
}

interface ListCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** One card per section with rows separated by hairlines (minimalism rule of the redesign). */
export function ListCard({ children, style }: ListCardProps) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, elevation, { backgroundColor: colors.surface }, style]}>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

interface ListRowProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A row inside a ListCard; pressable when onPress is given. */
export function ListRow({ children, onPress, accessibilityLabel, style }: ListRowProps) {
  const { colors } = useTheme();
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  // Static style on purpose: NativeWind's interop drops function styles on Pressable.
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: colors.surfaceRaised }}
      onPress={onPress}
      style={[styles.row, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: Platform.OS === 'android' ? 'hidden' : 'visible' },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 },
});
