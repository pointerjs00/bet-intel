import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEventOdds, type OddsRow } from '../../services/oddsService';
import { useTheme } from '../../theme/useTheme';
import { SiteLogoChip } from '../../components/odds/SiteLogoChip';
import { OddsCell } from '../../components/odds/OddsCell';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { LiveBadge } from '../../components/odds/LiveBadge';
import { useBoletinBuilderStore } from '../../stores/boletinBuilderStore';
import { useRouter } from 'expo-router';
import { useToast } from '../../components/ui/Toast';

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
        <Skeleton height={22} width={180} />
        <Skeleton height={34} width="85%" style={{ marginTop: 14 }} />
        <Skeleton height={120} width="100%" style={{ marginTop: 18 }} />
        <Skeleton height={240} width="100%" style={{ marginTop: 18 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}> 
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Evento não encontrado</Text>
      </View>
    );
  }

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
            <Text style={[styles.league, { color: colors.textSecondary }]}>{event.league}</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{event.homeTeam} vs {event.awayTeam}</Text>
            <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <View style={styles.bannerTeams}>
                <Text style={[styles.teamName, { color: colors.textPrimary }]}>{event.homeTeam}</Text>
                <View style={styles.scoreWrap}>
                  {event.status === 'LIVE' ? <LiveBadge /> : null}
                  <Text style={[styles.score, { color: colors.textPrimary }]}>
                    {event.homeScore ?? 0} - {event.awayScore ?? 0}
                  </Text>
                  <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{formatEventDate(event.eventDate)}</Text>
                </View>
                <Text style={[styles.teamName, { color: colors.textPrimary }]}>{event.awayTeam}</Text>
              </View>
            </View>

            <FlatList
              contentContainerStyle={styles.marketTabs}
              data={markets}
              horizontal
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedMarket(item)}
                  style={[
                    styles.marketTab,
                    {
                      backgroundColor: item === activeMarket ? colors.primary : colors.surfaceRaised,
                      borderColor: item === activeMarket ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.marketTabText, { color: item === activeMarket ? '#FFFFFF' : colors.textPrimary }]}>{item}</Text>
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
            />

            <View style={[styles.historyCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}> 
              <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>Odds History</Text>
              <View style={styles.historySparkline}>
                {[0.92, 0.8, 0.75, 0.88, 0.7, 0.65, 0.82].map((height, index) => (
                  <View
                    key={index}
                    style={[
                      styles.historyBar,
                      {
                        backgroundColor: colors.info,
                        height: 40 + height * 28,
                        opacity: 0.5 + index * 0.07,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.historyNote, { color: colors.textSecondary }]}>Últimas oscilações da seleção atualmente destacada.</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={styles.rowHeader}>
              <SiteLogoChip logoUrl={item.site.logoUrl} name={item.site.name} slug={item.site.slug} />
              <Text style={[styles.rowMarket, { color: colors.textSecondary }]}>{activeMarket}</Text>
            </View>

            <FlatList
              contentContainerStyle={styles.oddsList}
              data={item.odds}
              horizontal
              keyExtractor={(odd) => odd.id}
              renderItem={({ item: odd }) => (
                <OddsCell
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
              )}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
        ListFooterComponent={
          <View style={{ paddingTop: tokens.spacing.xl }}>
            <Button
              leftSlot={<Ionicons color="#FFFFFF" name="add" size={18} />}
              onPress={() => {
                if (builderItemsCount === 0) {
                  showToast('Escolhe primeiro uma odd para adicionar.', 'info');
                  return;
                }

                router.push('/boletins/create');
              }}
              title={builderItemsCount > 0 ? `Abrir boletin (${builderItemsCount})` : 'Adicionar ao Boletim'}
            />
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
 }

function formatEventDate(date: string) {
  const parsed = new Date(date);
  return parsed.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
    marginBottom: 18,
  },
  league: {
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  banner: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  bannerTeams: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  teamName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  scoreWrap: {
    alignItems: 'center',
    gap: 8,
    minWidth: 120,
  },
  score: {
    fontSize: 26,
    fontWeight: '900',
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '500',
  },
  marketTabs: {
    gap: 8,
  },
  marketTab: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  marketTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  historySparkline: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 90,
  },
  historyBar: {
    borderRadius: 999,
    width: 18,
  },
  historyNote: {
    fontSize: 12,
    lineHeight: 18,
  },
  rowCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowMarket: {
    fontSize: 13,
    fontWeight: '700',
  },
  oddsList: {
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
 });
