import * as admin from 'firebase-admin';
import { AuthProvider } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  issueAccessToken,
  issueRefreshToken,
  issueOnboardingToken,
  verifyOnboardingToken,
  JwtPayload,
} from './tokenService';
import { generatePendingUsername } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { USER_SELECT, toPublicUser } from '../../utils/userSerializer';
import type { PublicUser } from '@betintel/shared';

// ─── Firebase Admin initialisation ───────────────────────────────────────────
// Guard prevents re-initialisation during hot-reloads in development.
if (!admin.apps.length) {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!encoded) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is missing');
  }
  const serviceAccount = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8'),
  ) as admin.ServiceAccount;
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  emailVerified: boolean;
}

export type GoogleAuthResult =
  | { isNewUser: false; accessToken: string; refreshToken: string; user: PublicUser }
  | { isNewUser: true; tempToken: string };

// ─── Token verification ───────────────────────────────────────────────────────

/**
 * Verifies a Firebase ID token issued by Google Sign-In.
 * Throws if the token is invalid, expired, or from a different Firebase project.
 */
export async function verifyGoogleToken(firebaseIdToken: string): Promise<VerifiedGoogleUser> {
  const decoded = await admin.auth().verifyIdToken(firebaseIdToken);
  return {
    googleId: decoded.uid,
    email: decoded.email!.toLowerCase(),
    displayName: decoded.name,
    avatarUrl: decoded.picture,
    emailVerified: decoded.email_verified ?? false,
  };
}

// ─── Main Google auth handler ─────────────────────────────────────────────────

/**
 * Handles POST /api/auth/google.
 *
 * 3a) User found by googleId → existing Google user → issue JWT pair.
 * 3b) User found by email but googleId not set → silently links Google identity,
 *     promotes to HYBRID, issues JWT pair.
 * 3c) No user found → creates account (without username), returns tempToken for
 *     the username-picker screen.
 */
export async function handleGoogleAuth(firebaseIdToken: string): Promise<GoogleAuthResult> {
  const verified = await verifyGoogleToken(firebaseIdToken);

  // 3a — returning Google user
  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: verified.googleId },
    select: USER_SELECT,
  });

  if (byGoogleId) {
    await prisma.user.update({
      where: { id: byGoogleId.id },
      data: { lastLoginAt: new Date() },
    });
    const payload: JwtPayload = {
      sub: byGoogleId.id,
      email: byGoogleId.email,
      username: byGoogleId.username,
    };
    return {
      isNewUser: false,
      accessToken: issueAccessToken(payload),
      refreshToken: await issueRefreshToken(byGoogleId.id),
      user: toPublicUser(byGoogleId),
    };
  }

  // 3b — existing email/password account with the same email → link Google silently
  const byEmail = await prisma.user.findFirst({
    where: { email: verified.email },
    select: USER_SELECT,
  });

  if (byEmail) {
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: verified.googleId,
        authProvider: AuthProvider.HYBRID,
        isEmailVerified: true,
        lastLoginAt: new Date(),
        // Only set avatar if the user doesn't already have one
        ...(byEmail.avatarUrl === null && verified.avatarUrl
          ? { avatarUrl: verified.avatarUrl }
          : {}),
      },
      select: USER_SELECT,
    });
    logger.info('Google identity linked to existing account', { userId: linked.id });
    const payload: JwtPayload = { sub: linked.id, email: linked.email, username: linked.username };
    return {
      isNewUser: false,
      accessToken: issueAccessToken(payload),
      refreshToken: await issueRefreshToken(linked.id),
      user: toPublicUser(linked),
    };
  }

  // 3c — brand-new user: create with a temp placeholder username, return onboarding token
  const newUser = await prisma.user.create({
    data: {
      email: verified.email,
      // Placeholder — replaced permanently by completeGoogleRegistration
      username: generatePendingUsername(),
      googleId: verified.googleId,
      authProvider: AuthProvider.GOOGLE,
      isEmailVerified: true,
      displayName: verified.displayName ?? null,
      avatarUrl: verified.avatarUrl ?? null,
    },
    select: USER_SELECT,
  });

  logger.info('New Google user created, awaiting username selection', { userId: newUser.id });
  return { isNewUser: true, tempToken: issueOnboardingToken(newUser.id) };
}

// ─── Complete Google registration ─────────────────────────────────────────────

/**
 * Second step of Google onboarding: user chooses a username.
 * POST /api/auth/google/complete-registration
 */
export async function completeGoogleRegistration(
  tempToken: string,
  username: string,
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const userId = verifyOnboardingToken(tempToken);

  // Case-insensitive uniqueness check
  const conflict = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });

  if (conflict && conflict.id !== userId) {
    throw Object.assign(new Error('Nome de utilizador já existe'), { statusCode: 409 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { username, lastLoginAt: new Date() },
    select: USER_SELECT,
  });

  logger.info('Google user completed registration', { userId });
  const payload: JwtPayload = { sub: user.id, email: user.email, username: user.username };
  return {
    accessToken: issueAccessToken(payload),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

// ─── Account linking / unlinking ──────────────────────────────────────────────

/**
 * Links a Google identity to an existing authenticated account.
 * POST /api/auth/google/link (authenticated)
 */
export async function linkGoogleToAccount(
  userId: string,
  firebaseIdToken: string,
): Promise<PublicUser> {
  const verified = await verifyGoogleToken(firebaseIdToken);

  const alreadyLinked = await prisma.user.findUnique({
    where: { googleId: verified.googleId },
    select: { id: true },
  });

  if (alreadyLinked && alreadyLinked.id !== userId) {
    throw Object.assign(
      new Error('Esta conta Google já está associada a outro utilizador'),
      { statusCode: 409 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      googleId: verified.googleId,
      authProvider: AuthProvider.HYBRID,
      isEmailVerified: true,
    },
    select: USER_SELECT,
  });

  logger.info('Google account linked', { userId });
  return toPublicUser(user);
}

/**
 * Unlinks Google from an account.
 * Only allowed when the user has a password set — prevents account lockout.
 * POST /api/auth/google/unlink (authenticated)
 */
export async function unlinkGoogleFromAccount(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) {
    throw Object.assign(
      new Error('Não podes desvincular o Google sem ter uma password definida'),
      { statusCode: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { googleId: null, authProvider: AuthProvider.EMAIL },
    select: USER_SELECT,
  });

  logger.info('Google account unlinked', { userId });
  return toPublicUser(updated);
}
