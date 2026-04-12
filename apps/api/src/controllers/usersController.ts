import { Request, Response } from 'express';
import {
  updateProfileSchema,
  userSearchQuerySchema,
  usernameAvailabilityQuerySchema,
} from '@betintel/shared';
import {
  checkUsernameAvailability,
  getCurrentUserProfile,
  getPublicUserProfile,
  searchUsers,
  updateCurrentUserProfile,
} from '../services/social/userService';
import { uploadAvatar, removeAvatar } from '../services/social/avatarService';
import { logger } from '../utils/logger';

function ok<T>(res: Response, data: T, meta?: unknown): void {
  res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      logger.error('Users controller error', { error: err.message, stack: err.stack });
    }
    res.status(statusCode).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unknown users controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw Object.assign(new Error('Sessão inválida'), { statusCode: 401 });
  }
  return userId;
}

/** Handles GET /api/users/me. */
export async function getMeHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getCurrentUserProfile(requireUserId(req));
    ok(res, user);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles PATCH /api/users/me. */
export async function updateMeHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Dados de perfil inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await updateCurrentUserProfile(requireUserId(req), parsed.data);
    ok(res, user);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles POST /api/users/me/avatar — base64 image upload. */
export async function uploadAvatarHandler(req: Request, res: Response): Promise<void> {
  const { base64, mimeType } = req.body ?? {};

  if (typeof base64 !== 'string' || typeof mimeType !== 'string') {
    res.status(422).json({ success: false, error: 'Campos base64 e mimeType são obrigatórios.' });
    return;
  }

  try {
    const appUrl = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const user = await uploadAvatar(requireUserId(req), base64, mimeType, appUrl);
    ok(res, user);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles DELETE /api/users/me/avatar — removes the user's avatar. */
export async function deleteAvatarHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await removeAvatar(requireUserId(req));
    ok(res, user);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/users/search. */
export async function searchUsersHandler(req: Request, res: Response): Promise<void> {
  const parsed = userSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Parâmetros de pesquisa inválidos',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const users = await searchUsers(parsed.data.query, requireUserId(req));
    ok(res, users);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/users/check-username. */
export async function checkUsernameAvailabilityHandler(req: Request, res: Response): Promise<void> {
  const parsed = usernameAvailabilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      error: 'Nome de utilizador inválido',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await checkUsernameAvailability(parsed.data.username, req.user?.sub);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/** Handles GET /api/users/:username. */
export async function getPublicProfileHandler(req: Request, res: Response): Promise<void> {
  const username = req.params.username?.trim();
  if (!username) {
    res.status(400).json({ success: false, error: 'Username em falta' });
    return;
  }

  try {
    const profile = await getPublicUserProfile(username);
    if (!profile) {
      res.status(404).json({ success: false, error: 'Perfil não encontrado' });
      return;
    }

    ok(res, profile);
  } catch (err) {
    fail(res, err);
  }
}