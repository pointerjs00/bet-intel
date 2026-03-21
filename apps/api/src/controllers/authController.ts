import { Request, Response } from 'express';
import { z, ZodSchema } from 'zod';
import {
  loginSchema,
  registerBaseSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleCompleteRegistrationSchema,
  setPasswordSchema,
  changePasswordSchema,
  resendVerificationSchema,
} from '@betintel/shared';
import {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  setPassword,
  changePassword,
} from '../services/auth/emailAuthService';
import {
  handleGoogleAuth,
  completeGoogleRegistration,
  linkGoogleToAccount,
  unlinkGoogleFromAccount,
} from '../services/auth/googleAuthService';
import {
  rotateRefreshToken,
  invalidateRefreshToken,
} from '../services/auth/tokenService';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AppError extends Error {
  statusCode?: number;
  retryAfter?: number;
  code?: string;
  details?: Record<string, string[] | string>;
}

function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, err: unknown): void {
  if (err instanceof Error) {
    const appErr = err as AppError;
    const status = appErr.statusCode ?? 500;

    if (status >= 500) {
      logger.error('Unhandled controller error', { error: err.message, stack: err.stack });
    }

    const body: Record<string, unknown> = { success: false, error: err.message };
    if (appErr.code) body.code = appErr.code;
    if (appErr.details) body.details = appErr.details;
    if (appErr.retryAfter) res.set('Retry-After', String(appErr.retryAfter));

    res.status(status).json(body);
    return;
  }
  logger.error('Unknown controller error', { error: err });
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

/**
 * Validates `req.body` against a Zod schema.
 * Returns the parsed data or responds 422 and returns null.
 */
function validate<T>(schema: ZodSchema<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(422).json({
      success: false,
      error: 'Dados inválidos',
      details: result.error.flatten().fieldErrors,
    });
    return null;
  }
  return result.data;
}

// ─── Email / Password controllers ─────────────────────────────────────────────

/**
 * POST /api/auth/register
 * { email, username, password, displayName? } → sends verification email
 */
export async function register(req: Request, res: Response): Promise<void> {
  const body = validate(registerBaseSchema, req.body, res);
  if (!body) return;

  try {
    await registerUser(body.email, body.username, body.password, body.displayName);
    ok(res, { message: 'Verifica o teu email para activar a tua conta.' }, 201);
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/login
 * { email, password } → { accessToken, refreshToken, user }
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = validate(loginSchema, req.body, res);
  if (!body) return;

  try {
    const result = await loginUser(body.email, body.password);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/refresh
 * { refreshToken } → { accessToken, refreshToken }
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const schema = z.object({ refreshToken: z.string().min(1) });
  const body = validate(schema, req.body, res);
  if (!body) return;

  try {
    const tokens = await rotateRefreshToken(body.refreshToken);
    if (!tokens) {
      res.status(401).json({ success: false, error: 'Refresh token inválido ou expirado' });
      return;
    }
    ok(res, tokens);
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/logout
 * { refreshToken } → invalidates the given refresh token
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const schema = z.object({ refreshToken: z.string().min(1) });
  const body = validate(schema, req.body, res);
  if (!body) return;

  try {
    await invalidateRefreshToken(body.refreshToken);
    ok(res, { message: 'Sessão terminada com sucesso.' });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/verify-email
 * { token } → marks email as verified
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const schema = z.object({ token: z.string().min(1, 'Token obrigatório') });
  const body = validate(schema, req.body, res);
  if (!body) return;

  try {
    await verifyEmail(body.token);
    ok(res, { message: 'Email verificado com sucesso.' });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/resend-verification
 * { email } → resends verification email
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const body = validate(resendVerificationSchema, req.body, res);
  if (!body) return;

  try {
    await resendVerificationEmail(body.email);
    // Always return success to prevent enumeration
    ok(res, { message: 'Se o email existir e não estiver verificado, reenviámos o link.' });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/forgot-password
 * { email } → sends reset link (always returns success)
 */
export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  const body = validate(forgotPasswordSchema, req.body, res);
  if (!body) return;

  try {
    await forgotPassword(body.email);
    // Always return the same message — prevents email enumeration
    ok(res, { message: 'Se o email existir, enviámos um link de recuperação.' });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/reset-password
 * { token, newPassword } → resets password, invalidates all sessions
 */
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const body = validate(resetPasswordSchema, req.body, res);
  if (!body) return;

  try {
    await resetPassword(body.token, body.newPassword);
    ok(res, { message: 'Password redefinida com sucesso. Faz login novamente.' });
  } catch (err) {
    fail(res, err);
  }
}

// ─── Google OAuth controllers ──────────────────────────────────────────────────

/**
 * POST /api/auth/google
 * { firebaseIdToken } → { accessToken, refreshToken, user } | { isNewUser: true, tempToken }
 */
export async function googleAuth(req: Request, res: Response): Promise<void> {
  const schema = z.object({ firebaseIdToken: z.string().min(1) });
  const body = validate(schema, req.body, res);
  if (!body) return;

  try {
    const result = await handleGoogleAuth(body.firebaseIdToken);
    ok(res, result);
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/google/complete-registration
 * { tempToken, username } → { accessToken, refreshToken, user }
 */
export async function googleCompleteRegistrationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = validate(googleCompleteRegistrationSchema, req.body, res);
  if (!body) return;

  try {
    const result = await completeGoogleRegistration(body.tempToken, body.username);
    ok(res, result, 201);
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/google/link  (authenticated)
 * { firebaseIdToken } → links Google to existing account
 */
export async function googleLink(req: Request, res: Response): Promise<void> {
  const schema = z.object({ firebaseIdToken: z.string().min(1) });
  const body = validate(schema, req.body, res);
  if (!body) return;

  try {
    const user = await linkGoogleToAccount(req.user!.sub, body.firebaseIdToken);
    ok(res, { user });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/google/unlink  (authenticated)
 * Unlinks Google; only allowed when passwordHash is set
 */
export async function googleUnlink(req: Request, res: Response): Promise<void> {
  try {
    const user = await unlinkGoogleFromAccount(req.user!.sub);
    ok(res, { user });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/set-password  (authenticated — Google-only users)
 * { newPassword } → sets password, promotes to HYBRID
 */
export async function setPasswordHandler(req: Request, res: Response): Promise<void> {
  const body = validate(setPasswordSchema, req.body, res);
  if (!body) return;

  try {
    const user = await setPassword(req.user!.sub, body.newPassword);
    ok(res, { user });
  } catch (err) {
    fail(res, err);
  }
}

/**
 * POST /api/auth/change-password  (authenticated)
 * { currentPassword, newPassword } → updates password, invalidates all sessions
 */
export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const body = validate(changePasswordSchema, req.body, res);
  if (!body) return;

  try {
    await changePassword(req.user!.sub, body.currentPassword, body.newPassword);
    ok(res, { message: 'Password alterada com sucesso. Faz login novamente.' });
  } catch (err) {
    fail(res, err);
  }
}
