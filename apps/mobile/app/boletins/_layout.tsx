import { Stack } from 'expo-router';
import { useTheme } from '../../theme/useTheme';

export default function BoletinsLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.textPrimary },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[id]" />
      <Stack.Screen name="agenda" options={{ title: 'Os Meus Jogos' }} />
      <Stack.Screen name="create" />
      <Stack.Screen name="journal" />
      <Stack.Screen name="import-review" />
      <Stack.Screen name="scan" />
      <Stack.Screen name="quick-log" options={{ headerShown: false }} />
      <Stack.Screen name="batch-resolve" />
      <Stack.Screen name="fixtures" options={{ title: 'Jogos' }} />
    </Stack>
  );
}