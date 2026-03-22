import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  transparent?: boolean;
}

export function Header({
  title,
  showBack = false,
  rightSlot,
  style,
  transparent = false,
}: HeaderProps) {
  const { colors, tokens } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          backgroundColor: transparent ? 'transparent' : colors.background,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: colors.surfaceRaised,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}

        <Text
          style={[
            styles.title,
            {
              color: colors.textPrimary,
              fontSize: tokens.font.sizes.xl,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {rightSlot ? (
          <View style={styles.rightSlot}>{rightSlot}</View>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  title: {
    flex: 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  spacer: {
    width: 36,
  },
  rightSlot: {
    alignItems: 'flex-end',
    minWidth: 36,
  },
});
