import { Request, Response } from 'express';
import { paginationSchema } from '@betintel/shared';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/social/notificationService';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Notifications controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unknown notifications controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

/** Handles GET /api/notifications. */
export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Parâmetros de paginação inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const page = await listNotifications(requireUserId(req), parsed.data);
    ok(res, page.items, { pagination: page.meta, unreadCount: page.meta.unreadCount });
  } catch (err) {
    fail(res, err);
  }
}

/** Handles PATCH /api/notifications/:id/read. */
export async function markNotificationReadHandler(req: Request, res: Response): Promise<void> {
  const notificationId = req.params.id;
  if (!notificationId) {
    res.status(400).json({ success: false, error: 'ID da notificação em falta' });
    return;
  }

  try {
    const notification = await markNotificationRead(requireUserId(req), notificationId);
    ok(res, notification);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles PATCH /api/notifications/read-all. */
export async function markAllNotificationsReadHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await markAllNotificationsRead(requireUserId(req));
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}