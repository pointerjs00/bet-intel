import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ActivityFeedItem } from '../../components/social/ActivityFeedItem';
import { FriendCard } from '../../components/social/FriendCard';
import { FriendRequestCard } from '../../components/social/FriendRequestCard';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import {
  getApiErrorMessage,
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useFriendFeed,
  useFriendRequests,
  useFriends,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUserSearch,
} from '../../services/socialService';
import { useTheme } from '../../theme/useTheme';

type FriendsTab = 'feed' | 'friends' | 'requests';

const TAB_LABELS: Array<{ key: FriendsTab; label: string }> = [
  { key: 'feed', label: 'Feed' },
  { key: 'friends', label: 'Amigos' },
  { key: 'requests', label: 'Pedidos' },
];

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FriendsTab>('feed');
  const [search, setSearch] = useState('');

  const feedQuery = useFriendFeed();
  const friendsQuery = useFriends();
  const requestsQuery = useFriendRequests();
  const searchQuery = useUserSearch(search);

  const sendRequestMutation = useSendFriendRequestMutation();
  const acceptRequestMutation = useAcceptFriendRequestMutation();
  const declineRequestMutation = useDeclineFriendRequestMutation();
  const removeFriendMutation = useRemoveFriendMutation();

  const requestCount = requestsQuery.data?.received.length ?? 0;
  const searchResults = useMemo(() => (search.trim().length >= 2 ? searchQuery.data ?? [] : []), [search, searchQuery.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Amigos' }} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: tokens.spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching || friendsQuery.isRefetching || requestsQuery.isRefetching}
            onRefresh={() => {
              void feedQuery.refetch();
              void friendsQuery.refetch();
              void requestsQuery.refetch();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(160).springify()} style={styles.headerWrap}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Social</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Segue atividade pública, gere amizades e responde a pedidos.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(30).duration(160).springify()}>
          <Card noPadding style={styles.tabBar}>
            {TAB_LABELS.map((tab) => {
              const active = tab.key === activeTab;
              const badgeValue = tab.key === 'requests' ? requestCount : 0;

              return (
                <Chip
                  key={tab.key}
                  label={badgeValue > 0 ? `${tab.label} (${badgeValue})` : tab.label}
                  selected={active}
                  onPress={() => setActiveTab(tab.key)}
                  style={styles.tabChip}
                />
              );
            })}
          </Card>
        </Animated.View>

        {activeTab === 'feed' ? (
          <View style={styles.sectionStack}>
            {feedQuery.isLoading ? (
              <View style={styles.loadingStack}>
                <Skeleton height={108} width="100%" />
                <Skeleton height={108} width="100%" />
              </View>
            ) : feedQuery.data && feedQuery.data.length > 0 ? (
              feedQuery.data.map((item, index) => (
                <Animated.View key={item.id} entering={FadeInDown.delay(index * 25).duration(160).springify()}>
                  <ActivityFeedItem item={item} onPress={() => router.push(`/boletins/${item.boletin.id}`)} />
                </Animated.View>
              ))
            ) : (
              <EmptyState icon="newspaper-variant-outline" title="Feed vazio" message="Quando os teus amigos publicarem boletins, eles aparecem aqui." />
            )}
          </View>
        ) : null}

        {activeTab === 'friends' ? (
          <View style={styles.sectionStack}>
            <Input
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Pesquisar por username"
              value={search}
            />

            {search.trim().length >= 2 ? (
              <View style={styles.sectionStack}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Resultados</Text>
                {searchQuery.isLoading ? (
                  <Skeleton height={96} width="100%" />
                ) : searchResults.length > 0 ? (
                  searchResults.map((user, index) => (
                    <Animated.View key={user.id} entering={FadeInDown.delay(index * 25).duration(160).springify()}>
                    <FriendCard
                      actionLabel={user.isFriend ? undefined : user.hasPendingRequest ? undefined : 'Adicionar'}
                      actionLoading={sendRequestMutation.isPending}
                      caption={
                        user.isFriend
                          ? 'Já fazem parte da mesma rede.'
                          : user.pendingRequestDirection === 'sent'
                            ? 'Pedido enviado.'
                            : user.pendingRequestDirection === 'received'
                              ? 'Este utilizador já te enviou um pedido.'
                              : user.bio ?? undefined
                      }
                      onPress={() => router.push(`/user/${user.username}`)}
                      onAction={async () => {
                        try {
                          await sendRequestMutation.mutateAsync(user.id);
                          showToast('Pedido enviado.', 'success');
                        } catch (error) {
                          showToast(getApiErrorMessage(error), 'error');
                        }
                      }}
                      user={user}
                    />
                    </Animated.View>
                  ))
                ) : (
                  <EmptyState icon="magnify" title="Sem resultados" message="Tenta outro username ou nome." />
                )}
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lista de amigos</Text>
            {friendsQuery.isLoading ? (
              <View style={styles.loadingStack}>
                <Skeleton height={96} width="100%" />
                <Skeleton height={96} width="100%" />
              </View>
            ) : friendsQuery.data && friendsQuery.data.length > 0 ? (
              friendsQuery.data.map((friendship, index) => (
                <Animated.View key={friendship.id} entering={FadeInDown.delay(index * 25).duration(160).springify()}>
                  <FriendCard
                    actionLabel="Remover"
                    actionLoading={removeFriendMutation.isPending}
                    onPress={() => router.push(`/user/${friendship.friend.username}`)}
                    onAction={async () => {
                      try {
                        await removeFriendMutation.mutateAsync(friendship.friend.id);
                        showToast('Amigo removido.', 'success');
                      } catch (error) {
                        showToast(getApiErrorMessage(error), 'error');
                      }
                    }}
                    user={friendship.friend}
                  />
                </Animated.View>
              ))
            ) : (
              <EmptyState icon="account-group-outline" title="Ainda sem amigos" message="Usa a pesquisa para começares a construir a tua rede." />
            )}
          </View>
        ) : null}

        {activeTab === 'requests' ? (
          <View style={styles.sectionStack}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recebidos</Text>
            {requestsQuery.isLoading ? (
              <Skeleton height={96} width="100%" />
            ) : requestsQuery.data && requestsQuery.data.received.length > 0 ? (
              requestsQuery.data.received.map((request, index) => (
                <Animated.View key={request.id} entering={FadeInDown.delay(index * 25).duration(160).springify()}>
                  <FriendRequestCard
                    loading={acceptRequestMutation.isPending}
                    onAccept={async () => {
                      try {
                        await acceptRequestMutation.mutateAsync(request.id);
                        showToast('Pedido aceite.', 'success');
                      } catch (error) {
                        showToast(getApiErrorMessage(error), 'error');
                      }
                    }}
                    onDecline={async () => {
                      try {
                        await declineRequestMutation.mutateAsync(request.id);
                        showToast('Pedido recusado.', 'info');
                      } catch (error) {
                        showToast(getApiErrorMessage(error), 'error');
                      }
                    }}
                    request={request}
                    variant="received"
                  />
                </Animated.View>
              ))
            ) : (
              <EmptyState icon="email-outline" title="Sem pedidos recebidos" message="Os novos pedidos recebidos aparecem aqui." />
            )}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Enviados</Text>
            {requestsQuery.data && requestsQuery.data.sent.length > 0 ? (
              requestsQuery.data.sent.map((request, index) => (
                <Animated.View key={request.id} entering={FadeInDown.delay(index * 25).duration(160).springify()}>
                  <FriendRequestCard request={request} variant="sent" />
                </Animated.View>
              ))
            ) : (
              <EmptyState icon="send-outline" title="Sem pedidos enviados" message="Quando enviares pedidos, vais acompanhar o estado nesta lista." />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 8, marginBottom: 18 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  tabBar: { borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 20, padding: 8 },
  tabChip: { flex: 1 },
  sectionStack: { gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  loadingStack: { gap: 12 },
});