import type { AuthProvider as PrismaAuthProvider } from '@prisma/client';
import type { PublicUser, AuthProvider, Theme } from '@betintel/shared';

/**
 * Prisma `select` object for all fields that make up a PublicUser.
 * Import and spread this wherever you need a safe user projection.
 */
export const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  googleId: true,
  authProvider: true,
  isEmailVerified: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  theme: true,
  currency: true,
  defaultBoletinsPublic: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Shape of a Prisma User row selected with USER_SELECT. */
export interface UserRow {
  id: string;
  email: string;
  username: string;
  googleId: string | null;
  authProvider: PrismaAuthProvider;
  isEmailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  theme: string;
  currency: string;
  defaultBoletinsPublic: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serialises a Prisma User row into the PublicUser API shape.
 * Converts Date objects to ISO strings and maps Prisma enum values to shared enum values.
 * SECURITY: does NOT include passwordHash, tokens, or security fields.
 */
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    googleId: user.googleId,
    authProvider: user.authProvider as unknown as AuthProvider,
    isEmailVerified: user.isEmailVerified,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    theme: user.theme as unknown as Theme,
    currency: user.currency,
    defaultBoletinsPublic: user.defaultBoletinsPublic,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
