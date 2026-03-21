import { Request, Response } from 'express';
import {
  acceptFriendRequest,
  declineFriendRequest,
  listFriends,
  listPendingFriendRequests,
  removeFriend,
  sendFriendRequest,
} from '../services/social/friendshipService';
import { getFriendFeed } from '../services/social/feedService';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Friends controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unknown friends controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

/** Handles GET /api/friends. */
export async function listFriendsHandler(req: Request, res: Response): Promise<void> {
  try {
    const friends = await listFriends(requireUserId(req));
    ok(res, friends);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/friends/requests. */
export async function listFriendRequestsHandler(req: Request, res: Response): Promise<void> {
  try {
    const requests = await listPendingFriendRequests(requireUserId(req));
    ok(res, requests);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/friends/request/:userId. */
export async function sendFriendRequestHandler(req: Request, res: Response): Promise<void> {
  const targetUserId = req.params.userId;
  if (!targetUserId) {
    res.status(400).json({ success: false, error: 'ID do utilizador em falta' });
    return;
  }

  try {
    const request = await sendFriendRequest(requireUserId(req), targetUserId);
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/friends/accept/:requestId. */
export async function acceptFriendRequestHandler(req: Request, res: Response): Promise<void> {
  const requestId = req.params.requestId;
  if (!requestId) {
    res.status(400).json({ success: false, error: 'ID do pedido em falta' });
    return;
  }

  try {
    const friendship = await acceptFriendRequest(requireUserId(req), requestId);
    ok(res, friendship);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/friends/decline/:requestId. */
export async function declineFriendRequestHandler(req: Request, res: Response): Promise<void> {
  const requestId = req.params.requestId;
  if (!requestId) {
    res.status(400).json({ success: false, error: 'ID do pedido em falta' });
    return;
  }

  try {
    const request = await declineFriendRequest(requireUserId(req), requestId);
    ok(res, request);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles DELETE /api/friends/:userId. */
export async function removeFriendHandler(req: Request, res: Response): Promise<void> {
  const friendId = req.params.userId;
  if (!friendId) {
    res.status(400).json({ success: false, error: 'ID do amigo em falta' });
    return;
  }

  try {
    await removeFriend(requireUserId(req), friendId);
    res.status(204).send();
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/friends/feed. */
export async function getFriendFeedHandler(req: Request, res: Response): Promise<void> {
  try {
    const feed = await getFriendFeed(requireUserId(req));
    ok(res, feed);
  } catch (err) {
    fail(res, err);
  }
}