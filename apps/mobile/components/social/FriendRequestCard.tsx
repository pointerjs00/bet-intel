import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FriendRequestDetail } from '@betintel/shared';
import { Button } from '../ui/Button';
import { useTheme } from '../../theme/useTheme';
import { formatRelativeTime } from '../../utils/formatters';
import { SocialAvatar } from './SocialAvatar';

interface FriendRequestCardProps {
  request: FriendRequestDetail;
  variant: 'received' | 'sent';
  onAccept?: () => void;
  onDecline?: () => void;
  loading?: boolean;
}

/** Card for pending friend requests in both received and sent states. */
export function FriendRequestCard({
  request,
  variant,
  onAccept,
  onDecline,
  loading,
}: FriendRequestCardProps) {
  const { colors } = useTheme();
  const counterparty = variant === 'received' ? request.sender : request.receiver;
  const displayName = counterparty.displayName ?? counterparty.username;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <SocialAvatar avatarUrl={counterparty.avatarUrl} name={displayName} />

      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
        <Text style={[styles.username, { color: colors.textSecondary }]}>@{counterparty.username}</Text>
        <Text numberOfLines={2} style={[styles.meta, { color: colors.textSecondary }]}> 
          {variant === 'received' ? 'Recebido' : 'Enviado'} {formatRelativeTime(request.createdAt)}
        </Text>
      </View>

      {variant === 'received' ? (
        <View style={styles.actions}>
          <Button loading={loading} onPress={onAccept} size="sm" title="Aceitar" />
          <Button onPress={onDecline} size="sm" title="Recusar" variant="ghost" />
        </View>
      ) : (
        <View style={styles.sentBadgeWrap}>
          <Text style={[styles.sentBadge, { backgroundColor: colors.surfaceRaised, color: colors.textPrimary }]}>Pendente</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  content: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '900',
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: 8,
    justifyContent: 'center',
    width: 104,
  },
  sentBadgeWrap: {
    justifyContent: 'center',
  },
  sentBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
});