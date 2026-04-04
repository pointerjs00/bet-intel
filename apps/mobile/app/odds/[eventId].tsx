import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useEventOdds, type OddsRow } from '../../services/oddsService';
import { useTheme } from '../../theme/useTheme';
import { SiteLogoChip } from '../../components/odds/SiteLogoChip';
import { OddsCell } from '../../components/odds/OddsCell';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { LiveBadge } from '../../components/odds/LiveBadge';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useRouter } from 'expo-router';
import { useToast } from '../../components/ui/Toast';
import { formatLiveClock } from '../../utils/formatters';

interface MarketRow {
  site: OddsRow['site'];
  odds: OddsRow[];
}

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const eventQuery = useEventOdds(eventId);
  const addBuilderItem = useBoletinBuilderStore((state) => state.addItem);
  const builderItemsCount = useBoletinBuilderStore((state) => state.items.length);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);

  const event = eventQuery.data;

  const markets = useMemo(() => {
    if (!event) return [];
    return Array.from(new Set(event.odds.map((odd) => odd.market)));
  }, [event]);

  const activeMarket = selectedMarket ?? markets[0] ?? '1X2';

  const marketRows = useMemo(() => {
    if (!event) return [];
    const rows = new Map<string, MarketRow>();
    event.odds
      .filter((odd) => odd.market === activeMarket)
      .forEach((odd) => {
        const row = rows.get(odd.site.id) ?? { site: odd.site, odds: [] };
        row.odds.push(odd);
        rows.set(odd.site.id, row);
      });

    return Array.from(rows.values()).map((row) => ({
      ...row,
      odds: row.odds.sort((a, b) => a.selection.localeCompare(b.selection)),
    }));
  }, [activeMarket, event]);

  if (eventQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg }]}> 
        <Card style={{ gap: 16, marginTop: 8 }}>
          <Skeleton height={16} width={120} />
          <Skeleton height={56} width="100%" />
          <Skeleton height={40} width="100%" />
        </Card>
        <Card style={{ marginTop: 14, gap: 14 }}>
          <Skeleton height={18} width={120} />
          <Skeleton height={70} width="100%" />
        </Card>
        <Card style={{ marginTop: 14, gap: 14 }}>
          <Skeleton height={18} width={160} />
          <Skeleton height={64} width="100%" />
        </Card>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}> 
        <EmptyState
          icon="alert-circle-outline"
          title="Evento não encontrado"
          message="O evento pode ter sido removido ou os dados ainda não foram carregados."
        />
      </View>
    );
  }

  const resolvedLiveClock = event.status === 'LIVE' ? formatLiveClock(event.liveClock, event.eventDate) : null;

  const sportEmoji = getSportEmoji(event.sport);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <Stack.Screen options={{ title: `${event.homeTeam} vs ${event.awayTeam}` }} />
      <FlatList
        contentContainerStyle={{
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: insets.top + tokens.spacing.lg,
        }}
        data={marketRows}
        keyExtractor={(item) => item.site.id}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* Hero banner */}
            <Animated.View entering={FadeInUp.duration(400).springify()}>
              <Card style={styles.heroBanner}>
                {/* Sport + league badge */}
                <View style={styles.heroBadgeRow}>
                  <View style={[styles.sportTag, { backgroundColor: colors.background }]}>
                    <Text style={styles.sportEmoji}>{sportEmoji}</Text>
                    <Text style={[styles.leagueLabel, { color: colors.textSecondary }]}>{event.league}</Text>
                  </View>
                  {event.status === 'LIVE' && new Date(event.eventDate) <= new Date() ? <LiveBadge /> : null}
                </View>

                {/* Teams + score */}
                <View style={styles.heroMatchRow}>
                  <View style={styles.heroTeam}>
                    <View style={[styles.teamInitialCircle, { backgroundColor: colors.background }]}>
                      <Text style={[styles.teamInitial, { color: colors.textPrimary }]}>
                        {event.homeTeam.charAt(0)}
                      </Text>
                    </View>
                    <Text style={[styles.heroTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {event.homeTeam}
                    </Text>
                  </View>

                  <View style={styles.heroCenter}>
                    <Text style={[styles.heroScore, { color: colors.textPrimary }]}>
                      {event.homeScore != null ? event.homeScore : '–'}
                    </Text>
                    <Text style={[styles.heroDash, { color: colors.textMuted }]}>–</Text>
                    <Text style={[styles.heroScore, { color: colors.textPrimary }]}>
                      {event.awayScore != null ? event.awayScore : '–'}
                    </Text>
                    {event.status === 'LIVE' ? (
                      <Text style={[styles.liveClockText, { color: colors.primary }]}>
                        {resolvedLiveClock ?? 'Ao vivo'}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.heroTeam}>
                    <View style={[styles.teamInitialCircle, { backgroundColor: colors.background }]}>
                      <Text style={[styles.teamInitial, { color: colors.textPrimary }]}>
                        {event.awayTeam.charAt(0)}
                      </Text>
                    </View>
                    <Text style={[styles.heroTeamName, { color: colors.textPrimary }]} numberOfLines={2}>
                      {event.awayTeam}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.heroDate, { color: colors.textSecondary }]}>
                  {formatEventDate(event.eventDate)}
                </Text>
              </Card>
            </Animated.View>

            {/* Market chips */}
            <Animated.View entering={FadeInDown.delay(100).duration(400).springify()}>
              <View style={styles.marketHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mercados</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.countText, { color: colors.textSecondary }]}>{markets.length}</Text>
                </View>
              </View>
              <View style={styles.marketChips}>
                {markets.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    selected={item === activeMarket}
                    onPress={() => setSelectedMarket(item)}
                  />
                ))}
              </View>
            </Animated.View>

            {/* Odds history sparkline */}
            <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
              <Card style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <MaterialCommunityIcons color={colors.info} name="chart-line" size={18} />
                  <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>Histórico de Odds</Text>
                </View>
                <View style={styles.historySparkline}>
                  {[0.60, 0.72, 0.55, 0.88, 0.65, 0.78, 0.92, 0.70, 0.85].map((height, index) => (
                    <View
                      key={index}
                      style={[
                        styles.historyBar,
                        {
                          backgroundColor: colors.primary,
                          height: 24 + height * 46,
                          opacity: 0.35 + (index / 8) * 0.65,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.historyNote, { color: colors.textMuted }]}>
                  Últimas oscilações da seleção atualmente destacada.
                </Text>
              </Card>
            </Animated.View>

            {/* Section title for sites */}
            <Animated.View entering={FadeInDown.delay(300).duration(400).springify()}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Odds por casa</Text>
            </Animated.View>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(350 + index * 60).duration(400).springify()}>
            <Card style={styles.siteCard}>
              <View style={styles.siteCardHeader}>
                <SiteLogoChip logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
                <View style={[styles.marketTag, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.marketTagText, { color: colors.textSecondary }]}>{activeMarket}</Text>
                </View>
              </View>
              <View style={styles.siteOddsRow}>
                {item.odds.map((odd) => (
                  <OddsCell
                    key={odd.id}
                    eventId={event.id}
                    market={odd.market}
                    onPress={() => {
                      addBuilderItem({
                        id: `${event.id}:${odd.site.id}:${odd.market}:${odd.selection}`,
                        eventId: event.id,
                        siteId: odd.site.id,
                        market: odd.market,
                        selection: odd.selection,
                        oddValue: Number(odd.value),
                        event: {
                          awayTeam: event.awayTeam,
                          eventDate: event.eventDate,
                          homeTeam: event.homeTeam,
                          league: event.league,
                        },
                        site: {
                          id: odd.site.id,
                          slug: odd.site.slug,
                          name: odd.site.name,
                          logoUrl: odd.site.logoUrl,
                        },
                      });
                      showToast('Seleção adicionada ao boletin.', 'success');
                    }}
                    oddSelection={odd.selection}
                    selection={odd.selection}
                    siteId={odd.site.id}
                    value={odd.value}
                  />
                ))}
              </View>
            </Card>
          </Animated.View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        ListFooterComponent={
          <Animated.View entering={FadeInDown.delay(500).duration(400).springify()} style={{ paddingTop: tokens.spacing.xl }}>
            <Button
              leftSlot={<MaterialCommunityIcons color="#FFFFFF" name="plus" size={18} />}
              onPress={() => {
                if (builderItemsCount === 0) {
                  showToast('Escolhe primeiro uma odd para adicionar.', 'info');
                  return;
                }
                router.push('/boletins/create');
              }}
              title={builderItemsCount > 0 ? `Abrir boletin (${builderItemsCount})` : 'Adicionar ao Boletim'}
            />
          </Animated.View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
 }

function getSportEmoji(sport: string): string {
  switch (sport) {
    case 'FOOTBALL': return '⚽';
    case 'BASKETBALL': return '🏀';
    case 'TENNIS': return '🎾';
    case 'VOLLEYBALL': return '🏐';
    case 'HANDBALL': return '🤾';
    case 'HOCKEY': return '🏒';
    case 'RUGBY': return '🏉';
    case 'AMERICAN_FOOTBALL': return '🏈';
    case 'BASEBALL': return '⚾';
    default: return '🏅';
  }
}

function formatEventDate(date: string) {
  const parsed = new Date(date);
  return parsed.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
}
 
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWrap: {
    gap: 18,
    marginBottom: 14,
  },

  /* Hero banner */
  heroBanner: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  heroBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sportTag: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sportEmoji: {
    fontSize: 13,
  },
  leagueLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroMatchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: '100%',
  },
  heroTeam: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  teamInitialCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  teamInitial: {
    fontSize: 20,
    fontWeight: '900',
  },
  heroTeamName: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  heroScore: {
    fontSize: 36,
    fontWeight: '900',
  },
  heroDash: {
    fontSize: 24,
    fontWeight: '300',
  },
  heroDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  liveClockText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },

  /* Market section */
  marketHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    fontWeight: '800',
  },
  marketChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  /* History */
  historyCard: {
    gap: 12,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  historySparkline: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    height: 80,
  },
  historyBar: {
    borderRadius: 6,
    flex: 1,
  },
  historyNote: {
    fontSize: 11,
    lineHeight: 16,
  },

  /* Site odds rows */
  siteCard: {
    gap: 14,
  },
  siteCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marketTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marketTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  siteOddsRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
