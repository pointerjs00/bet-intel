import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SocialUser } from '@betintel/shared';
import { Button } from '../ui/Button';
import { useTheme } from '../../theme/useTheme';
import { formatRelativeTime } from '../../utils/formatters';
import { SocialAvatar } from './SocialAvatar';
import { PressableScale } from '../ui/PressableScale';

interface FriendCardProps {
  user: SocialUser;
  actionLabel?: string;
  secondaryActionLabel?: string;
  caption?: string;
  onPress?: () => void;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  actionLoading?: boolean;
}

/** Generic social user card used for friends and search results. */
export function FriendCard({
  user,
  actionLabel,
  secondaryActionLabel,
  caption,
  onPress,
  onAction,
  onSecondaryAction,
  actionLoading,
}: FriendCardProps) {
  const { colors } = useTheme();
  const displayName = user.displayName ?? user.username;

  return (
    <PressableScale
      disabled={!onPress}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <SocialAvatar avatarUrl={user.avatarUrl} name={displayName} />

      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
        <Text style={[styles.username, { color: colors.textSecondary }]}>@{user.username}</Text>
        <Text numberOfLines={2} style={[styles.bio, { color: colors.textSecondary }]}>
          {caption ?? user.bio ?? 'Sem bio publicada.'}
        </Text>
        {user.lastLoginAt ? (
          <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
            Ativo {formatRelativeTime(user.lastLoginAt)}
          </Text>
        ) : null}
      </View>

      {(actionLabel || secondaryActionLabel) ? (
        <View style={styles.actions}>
          {actionLabel ? (
            <Button loading={actionLoading} onPress={onAction} size="sm" title={actionLabel} />
          ) : null}
          {secondaryActionLabel ? (
            <Button onPress={onSecondaryAction} size="sm" title={secondaryActionLabel} variant="ghost" />
          ) : null}
        </View>
      ) : null}
    </PressableScale>
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
  },
  name: {
    fontSize: 15,
    fontWeight: '900',
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
  },
  bio: {
    fontSize: 12,
    lineHeight: 18,
  },
  lastSeen: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    gap: 8,
    justifyContent: 'center',
    width: 104,
  },
});