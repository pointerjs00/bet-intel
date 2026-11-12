// Novo boletim — entry point of the central "+". The screenshot import is the main way of logging a
// bet, so it leads, with the latest gallery images one tap away. Then "Escolher jogo" (real games,
// or writing the selection by hand when the game isn't there) and "Registo rápido".
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText } from '../../components/ui/AppText';
import { ListCard, ListRow, useCardElevation } from '../../components/ui/ListCard';
import { Pressable } from '../../components/ui/Pressable';
import { PressableScale } from '../../components/ui/PressableScale';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useTheme } from '../../theme/useTheme';
import { hapticLight } from '../../utils/haptics';

export default function NovoBoletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const elevation = useCardElevation();
  const [recent, setRecent] = useState<string[]>([]);

  // Latest images (screenshots are usually the newest); only if access was already given.
  useEffect(() => {
    (async () => {
      try {
        const perm = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!perm.granted && perm.accessPrivileges !== 'limited') return;
        const page = await MediaLibrary.getAssetsAsync({ first: 6, mediaType: MediaLibrary.MediaType.photo, sortBy: [MediaLibrary.SortBy.creationTime] });
        setRecent(page.assets.map((a) => a.uri));
      } catch {
        // Gallery unavailable: the import screen still lets you pick files.
      }
    })();
  }, []);

  const go = (path: Parameters<typeof router.replace>[0]) => { hapticLight(); router.replace(path); };
  const startManual = () => {
    useBoletinBuilderStore.getState().reset();
    go({ pathname: '/boletins/confirmar', params: { manual: '1' } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Fechar" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={[styles.close, { backgroundColor: colors.surface }]}>
          <Ionicons color={colors.textPrimary} name="close" size={20} />
        </Pressable>
      </View>
      <AppText accessibilityRole="header" variant="title">Novo boletim</AppText>

      <PressableScale onPress={() => go('/boletins/scan')} scaleDown={0.98} style={[styles.heroWrap, elevation]}>
        <LinearGradient colors={isDark ? ['#123628', colors.surface] : ['#E7F8EF', colors.surface]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons color="#06110B" name="cellphone-screenshot" size={22} />
          </View>
          <AppText variant="heading">Importar screenshot</AppText>
          <AppText variant="caption">A casa, as seleções, as odds e o resultado são lidos sozinhos. Também podes partilhar o print a partir da app da casa de apostas.</AppText>
          {recent.length ? (
            <ScrollView contentContainerStyle={styles.thumbs} horizontal showsHorizontalScrollIndicator={false}>
              {recent.map((uri) => (
                <Pressable accessibilityLabel="Ler esta imagem" key={uri} onPress={() => go({ pathname: '/boletins/scan', params: { sharedImageUri: uri } })} style={[styles.thumb, { borderColor: colors.border }]}>
                  <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri }} style={StyleSheet.absoluteFill} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {recent.length ? <AppText variant="caption">Toca num print para começar a ler.</AppText> : null}
        </LinearGradient>
      </PressableScale>

      <ListCard style={styles.list}>
        <ListRow accessibilityLabel="Escolher jogo" onPress={() => { useBoletinBuilderStore.getState().reset(); go('/boletins/por-jogo'); }} style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}22` }]}><Ionicons color={colors.primary} name="football-outline" size={22} /></View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Escolher jogo</AppText>
            <AppText variant="caption">Jogos reais; a aposta resolve-se sozinha. Se o jogo não estiver lá, escreves à mão.</AppText>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
        </ListRow>
        <ListRow accessibilityLabel="Escrever à mão" onPress={startManual} style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.warning}22` }]}><Ionicons color={colors.warning} name="create-outline" size={22} /></View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Escrever à mão</AppText>
            <AppText variant="caption">Equipas, mercado, odd e valor.</AppText>
          </View>
          <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
        </ListRow>
      </ListCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 10, paddingHorizontal: 20 },
  header: { alignItems: 'flex-start', marginBottom: 6 },
  close: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  heroWrap: { borderRadius: 22, marginTop: 8 },
  hero: { borderRadius: 22, gap: 8, padding: 18 },
  heroIcon: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  thumbs: { gap: 8, paddingTop: 4 },
  thumb: { borderRadius: 10, borderWidth: 1, height: 96, overflow: 'hidden', width: 60 },
  list: { marginTop: 8 },
  row: { minHeight: 76 },
  iconWrap: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  flex: { flex: 1, gap: 2 },
});
