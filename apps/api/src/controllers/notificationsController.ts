import { Request, Response } from 'express';
import { paginationSchema } from '@betintel/shared';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendTestPushToUser,
} from '../services/social/notificationService';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

const VALID_PREFS = ['GOALS', 'HALF_TIME', 'MATCH_END', 'RED_CARD'] as const;

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

/** Handles POST /api/notifications/test-push — sends a test push to the caller's registered device. */
export async function testPushHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await sendTestPushToUser(requireUserId(req));
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** GET /api/notifications/fixture-prefs — returns user's fixture notification preferences. */
export async function getFixtureNotifPrefsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: requireUserId(req) },
      select: { fixtureNotifPrefs: true },
    }) as { fixtureNotifPrefs: string[] } | null;
    const prefs: string[] = user?.fixtureNotifPrefs ?? [...VALID_PREFS];
    ok(res, {
      goals:    prefs.includes('GOALS'),
      halfTime: prefs.includes('HALF_TIME'),
      matchEnd: prefs.includes('MATCH_END'),
      redCard:  prefs.includes('RED_CARD'),
    });
  } catch (err) {
    fail(res, err);
  }
}

/** PUT /api/notifications/fixture-prefs — updates user's fixture notification preferences. */
export async function updateFixtureNotifPrefsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { goals, halfTime, matchEnd, redCard } = req.body as Record<string, boolean>;
    const prefs: string[] = [
      ...(goals    !== false ? ['GOALS']     : []),
      ...(halfTime !== false ? ['HALF_TIME'] : []),
      ...(matchEnd !== false ? ['MATCH_END'] : []),
      ...(redCard  !== false ? ['RED_CARD']  : []),
    ];
    await (prisma as any).user.update({
      where: { id: requireUserId(req) },
      data: { fixtureNotifPrefs: prefs },
    });
    ok(res, { goals: prefs.includes('GOALS'), halfTime: prefs.includes('HALF_TIME'), matchEnd: prefs.includes('MATCH_END'), redCard: prefs.includes('RED_CARD') });
  } catch (err) {
    fail(res, err);
  }
}