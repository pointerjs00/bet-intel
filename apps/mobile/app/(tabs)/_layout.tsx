import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../theme/useTheme';
import { useUnreadNotificationsCount } from '../../services/socialService';

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
            backgroundColor: isDark ? 'rgba(26,26,26,0.92)' : 'rgba(255,255,255,0.95)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        {state.routes.map((route, index) => {
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

          return (
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
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const unreadCount = useUnreadNotificationsCount().data ?? 0;
  const renderTabBar = useCallback((props: BottomTabBarProps) => <FloatingTabBar {...props} />, []);

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Apostas',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'receipt' : 'receipt-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Amigos',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'people' : 'people-outline'} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'person' : 'person-outline'} size={22} />
          ),
        }}
      />
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
    overflow: 'hidden',
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
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
