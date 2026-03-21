import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { useUnreadNotificationsCount } from '../../services/socialService';

export default function TabsLayout() {
  const { colors } = useTheme();
  const unreadCount = useUnreadNotificationsCount().data ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="flash-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="slips"
        options={{
          title: 'Boletins',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="reader-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="stats-chart-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Amigos',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="people-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="person-outline" size={size} />,
        }}
      />
    </Tabs>
  );
}
