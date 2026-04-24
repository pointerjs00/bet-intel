import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '../theme/useTheme';
import { hapticLight } from '../utils/haptics';

export const ONBOARDING_DONE_KEY = 'betintel_onboarding_done';

interface OnboardingSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  body: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    icon: 'trending-up-outline',
    title: 'Bem-vindo ao BetIntel',
    body: 'O teu assistente pessoal de apostas desportivas. Regista os teus boletins, acompanha a evolução do teu ROI e descobre onde tens realmente vantagem.',
  },
  {
    id: 'boletin',
    icon: 'create-outline',
    title: 'Cria o teu primeiro boletim',
    body: 'Toca em "+" no separador Boletins para registar uma aposta. Adiciona o evento, a odd, a stake e joga!\n\nUsa o Registo Rápido para apostas simples em segundos.',
  },
  {
    id: 'stats',
    icon: 'bar-chart-outline',
    title: 'Descobre as tuas estatísticas',
    body: 'O separador Estatísticas mostra o teu ROI, taxa de vitória, sequências e muito mais.\n\nQuanto mais registos fizeres, mais precisas e úteis serão as tuas estatísticas.',
  },
];

export default function OnboardingScreen() {
  const { colors, tokens } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const currentIndexRef = useRef(0);

  const updateCurrentIndex = (index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (screenWidth <= 0) {
      return;
    }

    const index = Math.max(
      0,
      Math.min(SLIDES.length - 1, Math.round(e.nativeEvent.contentOffset.x / screenWidth)),
    );
    updateCurrentIndex(index);
  };

  const handleNext = () => {
    if (currentIndexRef.current < SLIDES.length - 1) {
      const nextIndex = currentIndexRef.current + 1;
      hapticLight();
      updateCurrentIndex(nextIndex);
      flatListRef.current?.scrollToOffset({ offset: nextIndex * screenWidth, animated: true });
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    hapticLight();
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    router.replace('/(tabs)');
  };

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        bounces={false}
        extraData={screenWidth}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        horizontal
        initialNumToRender={SLIDES.length}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[styles.slide, { width: screenWidth }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}22` }]}>
              <Ionicons
                color={item.iconColor ?? colors.primary}
                name={item.icon}
                size={64}
              />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
          </Animated.View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === currentIndex ? colors.primary : colors.border,
                width: i === currentIndex ? 20 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={[styles.footer, { paddingBottom: tokens.spacing.xl + 24 }]}>
        {!isLast && (
          <Pressable
            accessibilityLabel="Saltar introdução"
            onPress={handleFinish}
            style={styles.skipBtn}
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Saltar</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={isLast ? 'Começar a usar o BetIntel' : 'Próximo passo'}
          onPress={handleNext}
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.nextText}>{isLast ? 'Começar' : 'Seguinte'}</Text>
          <Ionicons color="#fff" name={isLast ? 'checkmark' : 'arrow-forward'} size={18} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
    paddingTop: 60,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
