import type { Notification } from '@betintel/shared';

export function getNotificationTarget(notification: Pick<Notification, 'type' | 'data'>): string | null {
  const data = (notification.data as Record<string, unknown> | null) ?? null;

  if (notification.type === 'FRIEND_REQUEST' || notification.type === 'FRIEND_ACCEPTED') {
    return '/(tabs)/friends';
  }

  const boletinId = typeof data?.boletinId === 'string' ? data.boletinId : null;
  if ((notification.type === 'BOLETIN_SHARED' || notification.type === 'BOLETIN_RESULT') && boletinId) {
    return `/boletins/${boletinId}`;
  }

  return null;
}

export function isNotificationNavigateTap(
  tapX: number,
  rowWidth: number,
  hasNavigateTarget: boolean,
  trailingHitWidth = 52,
): boolean {
  if (!hasNavigateTarget || rowWidth <= 0) {
    return false;
  }

  return tapX >= Math.max(0, rowWidth - trailingHitWidth);
}