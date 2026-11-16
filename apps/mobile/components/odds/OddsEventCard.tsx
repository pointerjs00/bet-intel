import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '../ui/AppText';
import { Pressable } from '../ui/Pressable';
import { TeamBadge } from '../ui/TeamBadge';
import { useTheme } from '../../theme/useTheme';
import { lisbonTime, mainCaption, orderMain } from '../../utils/odds/list';
import type { OddsEventListItem } from '../../utils/odds/types';
import { CompetitionLabel } from './CompetitionLabel';
import { OddButton } from './OddButton';

/** One game of the Odds list: competition, teams, time and the main-market buttons. */
export function OddsEventCard({ item }: { item: OddsEventListItem }) {
  const { colors, tokens } = useTheme();
  const router = useRouter();
  const { event } = item;
  const variant = item.sport === 'TENNIS' ? 'player' : 'team';
  const open = () => router.push({ pathname: '/odds/[key]', params: { key: item.eventKey } } as never);
  return (
    <Pressable
      accessibilityLabel={`${event.home} contra ${event.away}`}
      accessibilityRole="button"
      onPress={open}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: tokens.radius.lg }]}
    >
      <View style={styles.head}>
        <CompetitionLabel countryCode={event.countryCode} name={event.competition} />
        <AppText tone="muted" variant="label">{item.houseCount === 1 ? '1 casa' : `${item.houseCount} casas`}</AppText>
      </View>
      <View style={styles.teams}>
        <AppText numberOfLines={2} style={[styles.flex, styles.right]} variant="bodyStrong">{event.home}</AppText>
        <TeamBadge name={event.canonical?.home ?? event.home} size={24} variant={variant} />
        {event.live ? (
          <AppText style={[styles.time, { color: colors.live }]} variant="label">AO VIVO</AppText>
        ) : (
          <AppText style={styles.time} variant="bodyStrong">{lisbonTime(event.startsAt)}</AppText>
        )}
        <TeamBadge name={event.canonical?.away ?? event.away} size={24} variant={variant} />
        <AppText numberOfLines={2} style={styles.flex} variant="bodyStrong">{event.away}</AppText>
      </View>
      <View style={styles.buttons}>
        {orderMain(item.main).map((row) => (
          <OddButton caption={mainCaption(item, row)} key={row.key ?? row.label} row={row} view={item} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  flex: { flex: 1 },
  right: { textAlign: 'right' },
  head: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  teams: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  time: { minWidth: 52, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
});
