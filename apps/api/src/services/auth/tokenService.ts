import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import { logger } from '../../utils/logger';

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_EXPIRY_DAYS = 30;

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}

/** Issues a signed JWT access token valid for 15 minutes. */
export function issueAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

/**
 * Issues a short-lived JWT for the Google onboarding flow only (10 min).
 * Contains `scope: 'google-onboarding'` — rejected by all other endpoints.
 */
export function issueOnboardingToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: 'google-onboarding' }, ACCESS_SECRET, {
    expiresIn: '10m',
  });
}

/**
 * Verifies a Google onboarding token and returns the userId.
 * Throws if the token is invalid, expired, or has the wrong scope.
 */
export function verifyOnboardingToken(token: string): string {
  const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
  if (decoded.scope !== 'google-onboarding' || !decoded.sub) {
    throw Object.assign(new Error('Token inválido'), { statusCode: 401 });
  }
  return decoded.sub;
}

/** Verifies a JWT access token. Throws if invalid or expired. */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

/**
 * Persists a new refresh token.
 * SECURITY: only the SHA-256 hash is stored in the DB; the raw token is returned
 * to the caller exactly once and must be transmitted to the client over HTTPS.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateSecureToken(40);
  const hash = hashToken(raw);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);

  await prisma.refreshToken.create({ data: { token: hash, userId, expiresAt } });
  return raw;
}

/**
 * Validates and rotates a refresh token.
 *
 * - Token found + not expired → delete old record, issue new access + refresh pair.
 * - Token not found (already rotated or forged) → session-compromise signal → log warning.
 *   Caller should return 401; without the userId we cannot invalidate other sessions here.
 * - Token expired → delete and return null.
 *
 * Returns null on any failure so the caller always returns 401.
 */
export async function rotateRefreshToken(
  rawToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const hash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { token: hash } });

  if (!stored) {
    // Possible token reuse of an already-rotated token — potential session hijack
    logger.warn('Refresh token reuse or forgery detected');
    return null;
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return null;
  }

  // Invalidate old token before issuing new pair (rotation)
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, username: true },
  });

  if (!user) return null;

  const payload: JwtPayload = { sub: user.id, email: user.email, username: user.username };
  const accessToken = issueAccessToken(payload);
  const refreshToken = await issueRefreshToken(user.id);

  return { accessToken, refreshToken };
}

/** Invalidates a single refresh token (single-device logout). */
export async function invalidateRefreshToken(rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  await prisma.refreshToken.deleteMany({ where: { token: hash } });
}

/** Invalidates ALL refresh tokens for a user (password reset / security event). */
export async function invalidateAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
