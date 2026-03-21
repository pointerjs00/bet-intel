import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityFeedItem } from '../../components/social/ActivityFeedItem';
import { FriendCard } from '../../components/social/FriendCard';
import { FriendRequestCard } from '../../components/social/FriendRequestCard';
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
          paddingBottom: insets.bottom + tokens.spacing.xxl,
          paddingHorizontal: tokens.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerWrap}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Social</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Segue atividade pública, gere amizades e responde a pedidos.</Text>
        </View>

        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          {TAB_LABELS.map((tab) => {
            const active = tab.key === activeTab;
            const badgeValue = tab.key === 'requests' ? requestCount : 0;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor: active ? colors.primary : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.tabLabel, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{tab.label}</Text>
                {badgeValue > 0 ? (
                  <View style={[styles.badge, { backgroundColor: active ? '#FFFFFF22' : colors.primary }]}>
                    <Text style={styles.badgeText}>{badgeValue}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'feed' ? (
          <View style={styles.sectionStack}>
            {feedQuery.isLoading ? (
              <View style={styles.loadingStack}>
                <Skeleton height={108} width="100%" />
                <Skeleton height={108} width="100%" />
              </View>
            ) : feedQuery.data && feedQuery.data.length > 0 ? (
              feedQuery.data.map((item) => <ActivityFeedItem item={item} key={item.id} />)
            ) : (
              <EmptyPanel description="Quando os teus amigos publicarem boletins, eles aparecem aqui." title="Feed vazio" />
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
                  searchResults.map((user) => (
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
                      key={user.id}
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
                  ))
                ) : (
                  <EmptyPanel description="Tenta outro username ou nome." title="Sem resultados" />
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
              friendsQuery.data.map((friendship) => (
                <FriendCard
                  actionLabel="Remover"
                  actionLoading={removeFriendMutation.isPending}
                  key={friendship.id}
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
              ))
            ) : (
              <EmptyPanel description="Usa a pesquisa para começares a construir a tua rede." title="Ainda sem amigos" />
            )}
          </View>
        ) : null}

        {activeTab === 'requests' ? (
          <View style={styles.sectionStack}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recebidos</Text>
            {requestsQuery.isLoading ? (
              <Skeleton height={96} width="100%" />
            ) : requestsQuery.data && requestsQuery.data.received.length > 0 ? (
              requestsQuery.data.received.map((request) => (
                <FriendRequestCard
                  key={request.id}
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
              ))
            ) : (
              <EmptyPanel description="Os novos pedidos recebidos aparecem aqui." title="Sem pedidos recebidos" />
            )}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Enviados</Text>
            {requestsQuery.data && requestsQuery.data.sent.length > 0 ? (
              requestsQuery.data.sent.map((request) => (
                <FriendRequestCard key={request.id} request={request} variant="sent" />
              ))
            ) : (
              <EmptyPanel description="Quando enviares pedidos, vais acompanhar o estado nesta lista." title="Sem pedidos enviados" />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerWrap: { gap: 8, marginBottom: 18 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '900', lineHeight: 36 },
  tabBar: { borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 20, padding: 8 },
  tabButton: { alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  tabLabel: { fontSize: 13, fontWeight: '800' },
  badge: { borderRadius: 999, minWidth: 20, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  sectionStack: { gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  loadingStack: { gap: 12 },
  emptyCard: { borderRadius: 22, borderWidth: 1, gap: 10, padding: 18 },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  emptyText: { fontSize: 14, lineHeight: 22 },
});