import type { FriendActivityPayload, Notification } from '@betintel/shared';
import { getSocketServer, userRoomName } from './index';

/** Emits a new notification to the target user's private room. */
export function emitNotificationNew(userId: string, notification: Notification): void {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  io.to(userRoomName(userId)).emit('notification:new', { notification });
}

/** Emits friend activity payloads to one or more target user rooms. */
export function emitFriendActivity(targetUserIds: string[], payload: FriendActivityPayload): void {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  for (const userId of new Set(targetUserIds)) {
    io.to(userRoomName(userId)).emit('friend:activity', payload);
  }
}