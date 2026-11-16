import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '../ui/AppText';
import { Pressable } from '../ui/Pressable';
import { useCardElevation } from '../ui/ListCard';
import { useTheme } from '../../theme/useTheme';
import { useOddsEvent } from '../../services/oddsService';
import { mainCaption, orderMain } from '../../utils/odds/list';
import { isTop } from '../../utils/odds/marketTabs';
import { OddButton } from './OddButton';

/** "Odds" card of the football match screen: best 1X2 odds plus a link to the full odds screen. Renders nothing without odds. */
export function MatchOddsCard({ espnId }: { espnId: string }) {
  const { colors } = useTheme();
  const elevation = useCardElevation();
  const router = useRouter();
  const key = `espn:FOOTBALL:${espnId}`;
  const query = useOddsEvent(key);
  const view = query.data;
  if (!view) return null;

  const rows = orderMain(view.rows.filter((r) => isTop(r, 'FOOTBALL') && r.key?.startsWith('FT.1X2.')));
  if (rows.length === 0) return null;
  const n = view.houses.length;

  return (
    <View style={[styles.card, elevation, { backgroundColor: colors.surface }]}>
      <AppText variant="heading">Odds</AppText>
      <View style={styles.buttons}>
        {rows.map((row) => (
          <OddButton caption={mainCaption(view, row)} key={row.key ?? row.label} row={row} view={view} />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/odds/[key]', params: { key } } as never)}
        style={styles.link}
      >
        <AppText style={{ color: colors.primary }} variant="bodyStrong">
          {`Ver todas as odds (${n === 1 ? '1 casa' : `${n} casas`})`}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, gap: 12, padding: 16 },
  buttons: { flexDirection: 'row', gap: 8 },
  link: { alignItems: 'center', paddingVertical: 6 },
});
