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

type NotificationRow = Prisma.NotificationGetPayload<Record<string, never>>;

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

  const notification = serializeNotification(row);
  emitNotificationNew(row.userId, notification);
  await sendExpoPushNotifications([{ userId: row.userId, notification }]);
  return notification;
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

  const notifications = rows.map(serializeNotification);
  rows.forEach((row, index) => {
    emitNotificationNew(row.userId, notifications[index]!);
  });

  await sendExpoPushNotifications(
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

async function sendExpoPushNotifications(
  deliveries: Array<{ userId: string; notification: SharedNotification }>,
): Promise<void> {
  if (deliveries.length === 0) {
    return;
  }

  const userIds = [...new Set(deliveries.map((delivery) => delivery.userId))];
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      expoPushToken: { not: null },
    },
    select: {
      id: true,
      expoPushToken: true,
    },
  });

  const tokenByUserId = new Map(
    users
      .filter((user) => Boolean(user.expoPushToken))
      .map((user) => [user.id, user.expoPushToken as string]),
  );

  const messages: ExpoPushMessage[] = deliveries.flatMap((delivery) => {
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

  if (messages.length === 0) {
    return;
  }

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
      logger.warn('Expo push send request failed', {
        status: response.status,
        errors: payload.errors,
      });
      return;
    }

    await handleExpoPushTickets(messages, payload.data ?? []);
  } catch (error) {
    logger.warn('Expo push send threw an error', {
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
      if (ticket.status !== 'error') {
        return;
      }

      const token = messages[index]?.to;
      logger.warn('Expo push ticket returned an error', {
        token,
        message: ticket.message,
        details: ticket.details,
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