// Novo boletim — single entry point for every way of logging a bet (redesign D9).
// Opened by the central "+" of the tab bar; each mode leads to its existing flow.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { ListCard, ListRow } from '../../components/ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

type Mode = {
  title: string;
  description: string;
  route: Href;
  icon: (color: string) => React.ReactNode;
};

const MODES: Mode[] = [
  {
    title: 'Por jogo',
    description: 'Escolhe o jogo e os mercados; a liquidação fica automática.',
    route: '/boletins/por-jogo',
    icon: (c) => <Ionicons color={c} name="football-outline" size={22} />,
  },
  {
    title: 'Screenshot',
    description: 'Importa o talão da casa de apostas com IA.',
    route: '/boletins/scan',
    icon: (c) => <MaterialCommunityIcons color={c} name="cellphone-screenshot" size={22} />,
  },
  {
    title: 'Registo rápido',
    description: 'Simples de um jogo em poucos toques.',
    route: '/boletins/quick-log',
    icon: (c) => <Ionicons color={c} name="flash-outline" size={22} />,
  },
  {
    title: 'Manual',
    description: 'Preenche todas as seleções à mão.',
    route: '/boletins/create',
    icon: (c) => <Ionicons color={c} name="create-outline" size={22} />,
  },
];

export default function NovoBoletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Fechar"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={[styles.close, { backgroundColor: colors.surface }]}
        >
          <Ionicons color={colors.textPrimary} name="close" size={20} />
        </Pressable>
      </View>
      <AppText accessibilityRole="header" variant="title">Novo boletim</AppText>
      <AppText variant="caption">Como queres registar a aposta?</AppText>
      <ListCard style={styles.list}>
        {MODES.map((mode, i) => {
          // One colour per way of registering, so the four options read apart at a glance.
          const tint = [colors.primary, colors.accentText, colors.warning, colors.info][i] ?? colors.primary;
          return (
          <ListRow
            accessibilityLabel={mode.title}
            key={mode.title}
            onPress={() => { hapticLight(); router.replace(mode.route); }}
            style={styles.row}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${tint}22` }]}>{mode.icon(tint)}</View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{mode.title}</AppText>
              <AppText variant="caption">{mode.description}</AppText>
            </View>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
          </ListRow>
          );
        })}
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 6, paddingHorizontal: 20 },
  header: { alignItems: 'flex-start', marginBottom: 12 },
  close: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  list: { marginTop: 18 },
  row: { minHeight: 76 },
  iconWrap: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  flex: { flex: 1, gap: 2 },
});
