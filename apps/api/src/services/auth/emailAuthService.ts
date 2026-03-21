import bcrypt from 'bcrypt';
import { AuthProvider } from '@prisma/client';
import { prisma } from '../../prisma';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import {
  issueAccessToken,
  issueRefreshToken,
  invalidateAllUserRefreshTokens,
  JwtPayload,
} from './tokenService';
import { sendVerificationEmail, sendPasswordResetEmail } from '../../utils/email';
import { logger } from '../../utils/logger';
import { USER_SELECT, toPublicUser } from '../../utils/userSerializer';
import type { PublicUser } from '@betintel/shared';

const BCRYPT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const EMAIL_VERIFY_HOURS = 24;
const PASSWORD_RESET_HOURS = 1;

/**
 * Registers a new user with email + password.
 * Does NOT auto-login — user must verify email first.
 */
export async function registerUser(
  email: string,
  username: string,
  password: string,
  displayName?: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: { equals: username, mode: 'insensitive' } },
      ],
    },
    select: { email: true },
  });

  if (existing?.email === normalizedEmail) {
    throw Object.assign(new Error('Email já registado'), { statusCode: 409 });
  }
  if (existing) {
    throw Object.assign(new Error('Nome de utilizador já existe'), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + EMAIL_VERIFY_HOURS);

  await prisma.user.create({
    data: {
      email: normalizedEmail,
      username,
      passwordHash,
      displayName: displayName ?? null,
      authProvider: AuthProvider.EMAIL,
      isEmailVerified: false,
      emailVerifyToken: tokenHash,
      emailVerifyExpiry: expiry,
    },
  });

  // Fire-and-forget — a send failure does not roll back registration
  sendVerificationEmail(normalizedEmail, rawToken).catch(() => {
    logger.error('Failed to send verification email', { domain: normalizedEmail.split('@')[1] });
  });
}

/** Marks an email address as verified using the raw token from the verification link. */
export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const user = await prisma.user.findUnique({
    where: { emailVerifyToken: tokenHash },
    select: { id: true, emailVerifyExpiry: true, isEmailVerified: true },
  });

  if (!user || !user.emailVerifyExpiry || user.emailVerifyExpiry < new Date()) {
    throw Object.assign(new Error('Token inválido ou expirado'), { statusCode: 400 });
  }

  if (user.isEmailVerified) return; // Idempotent

  await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
  });
}

/**
 * Resends the email verification link with a fresh token.
 * Silent no-op if the email is unknown or already verified — prevents enumeration.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, isEmailVerified: true },
  });

  if (!user || user.isEmailVerified) return;

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + EMAIL_VERIFY_HOURS);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: tokenHash, emailVerifyExpiry: expiry },
  });

  sendVerificationEmail(normalizedEmail, rawToken).catch(() => {
    logger.error('Failed to resend verification email', { domain: normalizedEmail.split('@')[1] });
  });
}

/**
 * Authenticates a user with email + password.
 * Enforces brute-force lockout: 5 failures → 15-minute account lock.
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      ...USER_SELECT,
      passwordHash: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

  // Generic message — never reveal which field is wrong (username enumeration)
  const genericError = Object.assign(new Error('Credenciais inválidas'), { statusCode: 401 });

  if (!user || !user.passwordHash) throw genericError;

  // Lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSecs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    throw Object.assign(
      new Error(
        `Conta bloqueada. Tenta novamente em ${Math.ceil(retryAfterSecs / 60)} minutos.`,
      ),
      { statusCode: 429, retryAfter: retryAfterSecs },
    );
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    const newCount = (user.failedLoginAttempts ?? 0) + 1;
    const update: Parameters<typeof prisma.user.update>[0]['data'] = {
      failedLoginAttempts: newCount,
    };

    if (newCount >= LOCKOUT_THRESHOLD) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_MINUTES);
      update.lockedUntil = lockedUntil;
      update.failedLoginAttempts = 0;
      logger.warn('Account locked after failed attempts', { userId: user.id });
    }

    await prisma.user.update({ where: { id: user.id }, data: update });
    throw genericError;
  }

  if (!user.isEmailVerified) {
    throw Object.assign(
      new Error('Por favor verifica o teu email antes de entrar.'),
      { statusCode: 403, code: 'EMAIL_NOT_VERIFIED' },
    );
  }

  // Success — reset security counters
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  logger.info('User logged in', { userId: user.id });

  const payload: JwtPayload = { sub: user.id, email: user.email, username: user.username };
  return {
    accessToken: issueAccessToken(payload),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

/**
 * Initiates password reset.
 * Always returns void — never reveals whether the email exists.
 */
export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, passwordHash: true },
  });

  // Silent no-op for unknown emails or Google-only accounts
  if (!user?.passwordHash) return;

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + PASSWORD_RESET_HOURS);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: tokenHash, passwordResetExpiry: expiry },
  });

  sendPasswordResetEmail(normalizedEmail, rawToken).catch(() => {
    logger.error('Failed to send password reset email', {
      domain: normalizedEmail.split('@')[1],
    });
  });
}

/**
 * Completes a password reset using the raw token from the reset email.
 * Invalidates ALL existing refresh tokens (forces re-login on all devices).
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: tokenHash },
    select: { id: true, passwordResetExpiry: true },
  });

  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw Object.assign(new Error('Token inválido ou expirado'), { statusCode: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await invalidateAllUserRefreshTokens(user.id);
  logger.info('Password reset — all sessions invalidated', { userId: user.id });
}

/**
 * Sets a password for a Google-only account, promoting authProvider to HYBRID.
 * POST /api/auth/set-password (authenticated)
 */
export async function setPassword(userId: string, newPassword: string): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, authProvider: AuthProvider.HYBRID },
    select: USER_SELECT,
  });

  logger.info('Password set, account promoted to HYBRID', { userId });
  return toPublicUser(user);
}

/**
 * Changes password for an authenticated user. Requires current password confirmation.
 * Invalidates all sessions on success.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) {
    throw Object.assign(new Error('Não tens uma password definida'), { statusCode: 400 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Password atual incorreta'), { statusCode: 401 });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await invalidateAllUserRefreshTokens(userId);
  logger.info('Password changed — all sessions invalidated', { userId });
}
