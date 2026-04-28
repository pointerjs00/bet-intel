import * as admin from 'firebase-admin';
import { NotificationType, Prisma } from '@prisma/client';
import type {
  Notification as SharedNotification,
  NotificationType as SharedNotificationType,
  NotificationsPageMeta,
  PaginationInput,
} from '@betintel/shared';
import { prisma } from '../../prisma';
import { emitNotificationNew } from '../../sockets/notificationSocket';
import { logger } from '../../utils/logger';

// FCM token prefix used to distinguish direct-FCM tokens from Expo push tokens.
const FCM_PREFIX = 'fcm:';

type NotificationRow = Prisma.NotificationGetPayload<Record<string, never>>;

interface NotificationDelivery {
  userId: string;
  notification: SharedNotification;
}

interface DispatchStoredNotificationsOptions {
  emitNotification?: (userId: string, notification: SharedNotification) => void;
  sendPushNotifications?: (deliveries: NotificationDelivery[]) => Promise<void>;
}

/** Creates a single notification row. */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}): Promise<SharedNotification> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: toPrismaJson(input.data),
    },
  });

  const [notification] = await dispatchStoredNotifications([row]);
  return notification!;
}

/** Creates multiple notifications in a transaction-friendly bulk operation. */
export async function createNotifications(inputs: Array<{
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
}>): Promise<SharedNotification[]> {
  if (inputs.length === 0) {
    return [];
  }

  const rows = await Promise.all(
    inputs.map((input) =>
      prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: toPrismaJson(input.data),
        },
      }),
    ),
  );

  return dispatchStoredNotifications(rows);
}

/** Emits socket notifications and sends Expo pushes for already-created notification rows. */
export async function dispatchStoredNotifications(
  rows: NotificationRow[],
  options: DispatchStoredNotificationsOptions = {},
): Promise<SharedNotification[]> {
  if (rows.length === 0) {
    return [];
  }

  const notifications = rows.map(serializeNotification);
  const emit = options.emitNotification ?? emitNotificationNew;
  const sendPush = options.sendPushNotifications ?? sendExpoPushNotifications;

  rows.forEach((row, index) => {
    emit(row.userId, notifications[index]!);
  });

  await sendPush(
    rows.map((row, index) => ({
      userId: row.userId,
      notification: notifications[index]!,
    })),
  );

  return notifications;
}

/** Returns paginated notifications for the authenticated user. */
export async function listNotifications(
  userId: string,
  pagination: PaginationInput,
): Promise<{ items: SharedNotification[]; meta: NotificationsPageMeta }> {
  const page = pagination.page;
  const limit = pagination.limit;
  const skip = (page - 1) * limit;

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    items: rows.map(serializeNotification),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      unreadCount,
    },
  };
}

/** Marks a single notification as read for the authenticated user. */
export async function markNotificationRead(userId: string, notificationId: string): Promise<SharedNotification> {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!existing) {
    throw Object.assign(new Error('Notificação não encontrada'), { statusCode: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return serializeNotification(updated);
}

/** Marks every unread notification as read for the authenticated user. */
export async function markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { updatedCount: result.count };
}

export function toSharedNotification(row: NotificationRow): SharedNotification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as unknown as SharedNotificationType,
    title: row.title,
    body: row.body,
    data: (row.data as Record<string, unknown> | null) ?? null,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeNotification(row: NotificationRow): SharedNotification {
  return toSharedNotification(row);
}

function toPrismaJson(value?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (value == null) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

// ─── Push routing ─────────────────────────────────────────────────────────────

async function sendExpoPushNotifications(deliveries: NotificationDelivery[]): Promise<void> {
  if (deliveries.length === 0) return;

  const userIds = [...new Set(deliveries.map((d) => d.userId))];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, expoPushToken: { not: null } },
    select: { id: true, expoPushToken: true },
  });

  logger.info('[Push] Preparing push notifications', {
    deliveries: deliveries.length,
    targetUsers: userIds.length,
    usersWithToken: users.length,
    userIdsWithoutToken: userIds.filter((id) => !users.find((u) => u.id === id)),
  });

  const tokenByUserId = new Map(
    users.filter((u) => Boolean(u.expoPushToken)).map((u) => [u.id, u.expoPushToken as string]),
  );

  if (tokenByUserId.size === 0) {
    logger.info('[Push] No push tokens found — skipping');
    return;
  }

  // Split deliveries by token type: raw FCM (Android) vs Expo gateway (iOS / legacy)
  const fcmDeliveries: NotificationDelivery[] = [];
  const expoDeliveries: NotificationDelivery[] = [];

  for (const delivery of deliveries) {
    const token = tokenByUserId.get(delivery.userId);
    if (!token) continue;
    if (token.startsWith(FCM_PREFIX)) {
      fcmDeliveries.push(delivery);
    } else {
      expoDeliveries.push(delivery);
    }
  }

  await Promise.all([
    fcmDeliveries.length > 0 ? sendViaFirebaseAdmin(fcmDeliveries, tokenByUserId) : Promise.resolve(),
    expoDeliveries.length > 0 ? sendViaExpoPush(expoDeliveries, tokenByUserId) : Promise.resolve(),
  ]);
}

// ─── Firebase Admin (Android / FCM V1) ───────────────────────────────────────

async function sendViaFirebaseAdmin(
  deliveries: NotificationDelivery[],
  tokenByUserId: Map<string, string>,
): Promise<void> {
  if (!admin.apps.length) {
    logger.warn('[Push/FCM] Firebase Admin not initialised — skipping FCM deliveries');
    return;
  }

  const messages: admin.messaging.TokenMessage[] = deliveries.flatMap((delivery) => {
    const prefixedToken = tokenByUserId.get(delivery.userId);
    if (!prefixedToken) return [];
    const rawToken = prefixedToken.slice(FCM_PREFIX.length);

    return [{
      token: rawToken,
      notification: {
        title: delivery.notification.title,
        body: delivery.notification.body,
      },
      // FCM data payload values must all be strings
      data: Object.fromEntries(
        Object.entries({
          notificationId: delivery.notification.id,
          type: delivery.notification.type,
          ...(delivery.notification.data ?? {}),
        }).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: 'high' as const,
        notification: { channelId: 'default', sound: 'default' },
      },
    }];
  });

  if (messages.length === 0) return;

  logger.info('[Push/FCM] Sending via Firebase Admin', { count: messages.length });

  try {
    const result = await admin.messaging().sendEach(messages);

    logger.info('[Push/FCM] Firebase Admin result', {
      success: result.successCount,
      failed: result.failureCount,
    });

    await Promise.all(
      result.responses.map(async (r, i) => {
        if (r.success) return;
        const errorCode = r.error?.code ?? 'unknown';
        const rawToken = messages[i]?.token ?? '';
        logger.warn('[Push/FCM] Message failed', {
          errorCode,
          tokenPrefix: rawToken.slice(0, 20) + '…',
        });
        const staleTokenCodes = [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
        ];
        if (rawToken && staleTokenCodes.includes(errorCode)) {
          logger.info('[Push/FCM] Clearing stale token', { tokenPrefix: rawToken.slice(0, 20) + '…' });
          await prisma.user.updateMany({
            where: { expoPushToken: `${FCM_PREFIX}${rawToken}` },
            data: { expoPushToken: null },
          });
        }
      }),
    );
  } catch (err) {
    logger.warn('[Push/FCM] sendEach threw an exception', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Expo push gateway (iOS / legacy Expo push tokens) ───────────────────────

async function sendViaExpoPush(
  deliveries: NotificationDelivery[],
  tokenByUserId: Map<string, string>,
): Promise<void> {
  const messages = buildExpoPushMessages(deliveries, tokenByUserId);

  if (messages.length === 0) {
    logger.info('[Push/Expo] No messages to send');
    return;
  }

  logger.info('[Push/Expo] Sending via Expo gateway', { count: messages.length });

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const payload = (await response.json()) as ExpoPushResponse;

    if (!response.ok) {
      logger.warn('[Push/Expo] Non-OK status from Expo gateway', {
        status: response.status,
        errors: payload.errors,
      });
      return;
    }

    const tickets = payload.data ?? [];
    logger.info('[Push/Expo] Gateway response', {
      ok: tickets.filter((t) => t.status === 'ok').length,
      errors: tickets.filter((t) => t.status === 'error').length,
    });

    await handleExpoPushTickets(messages, tickets);
  } catch (error) {
    logger.warn('[Push/Expo] Gateway request threw an exception', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleExpoPushTickets(
  messages: ExpoPushMessage[],
  tickets: ExpoPushTicket[],
): Promise<void> {
  await Promise.all(
    tickets.map(async (ticket, index) => {
      if (ticket.status !== 'error') return;

      const token = messages[index]?.to;
      logger.warn('[Push/Expo] Ticket error', {
        tokenPrefix: token ? token.slice(0, 30) + '…' : null,
        errorCode: ticket.details?.error,
        message: ticket.message,
      });

      if (ticket.details?.error === 'DeviceNotRegistered' && token) {
        await prisma.user.updateMany({
          where: { expoPushToken: token },
          data: { expoPushToken: null },
        });
      }
    }),
  );
}

/** Sends a test SYSTEM push notification to the authenticated user's registered device. */
export async function sendTestPushToUser(userId: string): Promise<{
  hasToken: boolean;
  tokenPrefix: string | null;
  notificationId: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { expoPushToken: true },
  });

  const token = user?.expoPushToken ?? null;

  logger.info('[Push] Test push requested', {
    userId,
    hasToken: Boolean(token),
    tokenPrefix: token ? token.slice(0, 30) + '…' : null,
  });

  if (!token) {
    return { hasToken: false, tokenPrefix: null, notificationId: null };
  }

  const notification = await createNotification({
    userId,
    type: 'SYSTEM',
    title: '🔔 Teste de notificação',
    body: 'Push notifications estão a funcionar correctamente!',
    data: { test: true },
  });

  return {
    hasToken: true,
    tokenPrefix: token.slice(0, 30) + '…',
    notificationId: notification.id,
  };
}

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
}

export function buildExpoPushMessages(
  deliveries: NotificationDelivery[],
  tokenByUserId: Map<string, string>,
): ExpoPushMessage[] {
  return deliveries.flatMap((delivery) => {
    const token = tokenByUserId.get(delivery.userId);
    if (!token) {
      return [];
    }

    return [{
      to: token,
      sound: 'default',
      title: delivery.notification.title,
      body: delivery.notification.body,
      data: {
        notificationId: delivery.notification.id,
        type: delivery.notification.type,
        ...(delivery.notification.data ?? {}),
      },
    }];
  });
}