import React, { useCallback } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/useTheme';
import { useGlow } from '../../components/ui/ListCard';
import { hapticLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TAB_BAR_HEIGHT = 64;
const TAB_BAR_MARGIN = 16;

function TabItemButton({
  onPress,
  icon,
  label,
  focused,
  tintColor,
  badge,
  dangerColor,
}: {
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  focused: boolean;
  tintColor: string;
  badge: string | number | undefined;
  dangerColor: string;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.tabItem, animatedStyle]}
      onPressIn={() => {
        scale.value = withTiming(0.85, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <View style={styles.iconWrap}>
        {icon}
        {badge != null && Number(badge) > 0 ? (
          <View style={[styles.badge, { backgroundColor: dangerColor }]}>
            <Text style={styles.badgeText}>
              {Number(badge) > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.tabLabel,
          { color: tintColor, fontWeight: focused ? '700' : '500' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Tabs shown in the bar, in order; other routes (amigos, perfil) stay navigable but hidden. */
const VISIBLE_TABS = ['index', 'boletins', 'fixtures', 'stats'];

function CenterNewButton() {
  const router = useRouter();
  const { colors } = useTheme();
  const glow = useGlow();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={styles.centerSlot}>
      <AnimatedPressable
        accessibilityLabel="Novo boletim"
        accessibilityRole="button"
        onPress={() => { hapticLight(); router.push('/boletins/novo'); }}
        onPressIn={() => { scale.value = withTiming(0.9, { duration: 90 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 300 }); }}
        style={[styles.centerButton, { backgroundColor: colors.primary }, glow, style]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryGradientEnd]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
        />
        <Ionicons color={colors.onPrimary} name="add" size={28} />
      </AnimatedPressable>
    </View>
  );
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Hide when the active screen requests it via tabBarStyle: { display: 'none' }
  const activeDescriptor = descriptors[state.routes[state.index].key];
  const tabBarStyle = activeDescriptor?.options?.tabBarStyle as Record<string, unknown> | undefined;
  if (tabBarStyle?.display === 'none') return null;
  return (
    <View
      style={[
        styles.floatingContainer,
        { bottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: isDark ? 'rgba(17,21,34,0.96)' : 'rgba(255,255,255,0.97)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
          },
        ]}
      >
        {VISIBLE_TABS.flatMap((name, slot) => {
          const index = state.routes.findIndex((r) => r.name === name);
          const route = state.routes[index];
          if (!route) return [];
          const descriptor = descriptors[route.key];
          const focused = state.index === index;
          const tintColor = focused ? colors.primary : colors.textSecondary;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented && !focused) {
              navigation.navigate(route.name);
            }
          };

          const icon = descriptor.options.tabBarIcon?.({ color: tintColor, size: 22, focused });
          const badge = descriptor.options.tabBarBadge;

          const button = (
            <TabItemButton
              key={route.key}
              onPress={onPress}
              icon={icon}
              label={descriptor.options.title ?? route.name}
              focused={focused}
              tintColor={tintColor}
              badge={badge}
              dangerColor={colors.danger}
            />
          );
          return slot === 1 ? [button, <CenterNewButton key="new" />] : [button];
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const renderTabBar = useCallback((props: BottomTabBarProps) => <FloatingTabBar {...props} />, []);

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        // Hidden tabs keep their state but stop re-rendering until shown again.
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'home' : 'home-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="boletins"
        options={{
          title: 'Boletins',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'receipt' : 'receipt-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="fixtures"
        options={{
          title: 'Jogos',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'football' : 'football-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Análise',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} />
          ),
        }}
      />
      {/* Reachable from Início (avatar) and Perfil; not in the bar. */}
      <Tabs.Screen name="friends" options={{ title: 'Amigos', href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: TAB_BAR_MARGIN,
    right: TAB_BAR_MARGIN,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: 1,
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  iconWrap: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  centerSlot: { alignItems: 'center', justifyContent: 'center', width: 64 },
  centerButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
