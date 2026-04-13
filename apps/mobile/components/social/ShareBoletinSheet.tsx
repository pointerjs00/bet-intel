import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import GorhomBottomSheet from '@gorhom/bottom-sheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { FriendshipDetail } from '@betintel/shared';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { SocialAvatar } from './SocialAvatar';
import { useToast } from '../ui/Toast';
import { useFriends, getApiErrorMessage } from '../../services/socialService';
import { shareBoletinRequest } from '../../services/boletinService';
import { useTheme } from '../../theme/useTheme';

interface ShareBoletinSheetProps {
  boletinId: string;
  boletinName?: string | null;
  onShared?: () => void;
  onChange?: (index: number) => void;
  onClose?: () => void;
}

export const ShareBoletinSheet = React.forwardRef<GorhomBottomSheet, ShareBoletinSheetProps>(
  function ShareBoletinSheet({ boletinId, boletinName, onShared, onChange, onClose }, ref) {
    const { colors, tokens } = useTheme();
    const { showToast } = useToast();
    const friendsQuery = useFriends();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const friends = friendsQuery.data ?? [];

    const resetForm = useCallback(() => {
      setSelectedIds(new Set());
      setMessage('');
      setSearchTerm('');
      setSending(false);
    }, []);

    useEffect(() => {
      resetForm();
    }, [boletinId, resetForm]);

    const filteredFriends = useMemo(() => {
      if (!searchTerm.trim()) return friends;
      const q = searchTerm.toLowerCase();
      return friends.filter(
        (f) =>
          f.friend.username.toLowerCase().includes(q) ||
          (f.friend.displayName?.toLowerCase().includes(q) ?? false),
      );
    }, [friends, searchTerm]);

    const toggleFriend = useCallback((userId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    }, []);

    const handleShare = useCallback(async () => {
      if (!boletinId || selectedIds.size === 0) return;

      setSending(true);
      try {
        await shareBoletinRequest(boletinId, {
          userIds: Array.from(selectedIds),
          message: message.trim() || undefined,
        });
        showToast(`Partilhado com ${selectedIds.size} amigo${selectedIds.size > 1 ? 's' : ''}.`, 'success');
        setSelectedIds(new Set());
        setMessage('');
        onShared?.();
        (ref as React.RefObject<GorhomBottomSheet>)?.current?.close();
      } catch (error) {
        showToast(getApiErrorMessage(error), 'error');
      } finally {
        setSending(false);
      }
    }, [boletinId, message, selectedIds, showToast, onShared, ref]);

    const renderFriendItem = useCallback(
      ({ item }: { item: FriendshipDetail }) => {
        const { friend } = item;
        const selected = selectedIds.has(friend.id);
        const displayName = friend.displayName ?? friend.username;

        return (
          <Pressable
            onPress={() => toggleFriend(friend.id)}
            style={[
              sheetStyles.friendRow,
              {
                backgroundColor: selected ? `${colors.primary}14` : 'transparent',
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            <SocialAvatar avatarUrl={friend.avatarUrl} name={displayName} size={40} />
            <View style={sheetStyles.friendInfo}>
              <Text style={[sheetStyles.friendName, { color: colors.textPrimary }]}>{displayName}</Text>
              <Text style={[sheetStyles.friendUsername, { color: colors.textSecondary }]}>@{friend.username}</Text>
            </View>
            <View style={[sheetStyles.checkbox, { borderColor: selected ? colors.primary : colors.textMuted }]}>
              {selected ? <Ionicons color={colors.primary} name="checkmark" size={16} /> : null}
            </View>
          </Pressable>
        );
      },
      [selectedIds, toggleFriend, colors],
    );

    const handleClose = useCallback(() => {
      resetForm();
      onClose?.();
    }, [onClose, resetForm]);

    return (
      <BottomSheet ref={ref} snapPoints={['55%', '85%']} onChange={onChange} onClose={handleClose}>
        <View style={sheetStyles.container}>
          <View style={sheetStyles.header}>
            <MaterialCommunityIcons color={colors.primary} name="share-variant-outline" size={22} />
            <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>Partilhar boletim</Text>
          </View>

          {boletinName ? (
            <Text numberOfLines={1} style={[sheetStyles.subtitle, { color: colors.textSecondary }]}>
              {boletinName}
            </Text>
          ) : null}

          {/* Search */}
          <View style={[sheetStyles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons color={colors.textMuted} name="search" size={18} />
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearchTerm}
              placeholder="Pesquisar amigo..."
              placeholderTextColor={colors.textMuted}
              style={[sheetStyles.searchInput, { color: colors.textPrimary }]}
              value={searchTerm}
            />
          </View>

          {/* Friend list */}
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.friend.id}
            renderItem={renderFriendItem}
            style={sheetStyles.list}
            ListEmptyComponent={
              <Text style={[sheetStyles.emptyText, { color: colors.textMuted }]}>
                {friends.length === 0 ? 'Ainda sem amigos para partilhar.' : 'Nenhum resultado.'}
              </Text>
            }
          />

          {/* Message */}
          {selectedIds.size > 0 ? (
            <View style={[sheetStyles.messageWrap, { borderColor: colors.border }]}>
              <TextInput
                multiline
                numberOfLines={2}
                onChangeText={setMessage}
                placeholder="Mensagem opcional..."
                placeholderTextColor={colors.textMuted}
                style={[sheetStyles.messageInput, { color: colors.textPrimary }]}
                value={message}
              />
            </View>
          ) : null}

          {/* Send button */}
          <Button
            disabled={selectedIds.size === 0}
            loading={sending}
            onPress={handleShare}
            title={selectedIds.size > 0 ? `Enviar (${selectedIds.size})` : 'Enviar'}
            style={sheetStyles.sendBtn}
          />
        </View>
      </BottomSheet>
    );
  },
);

const sheetStyles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  list: { flex: 1, marginBottom: 8 },
  friendRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  friendInfo: { flex: 1, gap: 2 },
  friendName: { fontSize: 14, fontWeight: '700' },
  friendUsername: { fontSize: 12 },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  messageWrap: { borderRadius: 12, borderWidth: 1, marginBottom: 10, padding: 10 },
  messageInput: { fontSize: 14, maxHeight: 60, textAlignVertical: 'top' },
  sendBtn: { marginBottom: 16 },
  emptyText: { fontSize: 13, fontWeight: '600', padding: 20, textAlign: 'center' },
});
