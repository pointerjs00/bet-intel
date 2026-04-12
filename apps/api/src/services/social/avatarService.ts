import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

import { prisma } from '../../prisma';
import type { PublicUser } from '@betintel/shared';
import { toPublicUser, USER_SELECT } from '../../utils/userSerializer';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

/**
 * Accepts a base64-encoded image, saves it to disk, and updates the user's avatarUrl.
 * Returns the updated public user profile.
 */
export async function uploadAvatar(
  userId: string,
  base64Data: string,
  mimeType: string,
  appUrl: string,
): Promise<PublicUser> {
  if (!ALLOWED_MIMES.includes(mimeType as (typeof ALLOWED_MIMES)[number])) {
    throw Object.assign(new Error('Tipo de ficheiro não suportado. Usa JPEG, PNG ou WebP.'), {
      statusCode: 422,
    });
  }

  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.byteLength > MAX_SIZE_BYTES) {
    throw Object.assign(new Error('Imagem demasiado grande (máx. 5 MB).'), { statusCode: 422 });
  }

  await ensureUploadsDir();

  // Delete old avatar file if it was a local upload
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (currentUser?.avatarUrl?.includes('/uploads/avatars/')) {
    const oldFilename = currentUser.avatarUrl.split('/uploads/avatars/').pop();
    if (oldFilename) {
      const oldPath = path.join(UPLOADS_DIR, oldFilename);
      await fs.unlink(oldPath).catch(() => {});
    }
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${userId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await fs.writeFile(filePath, buffer);

  const avatarUrl = `${appUrl.replace(/\/$/, '')}/uploads/avatars/${filename}`;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: USER_SELECT,
  });

  return toPublicUser(updated);
}

/**
 * Removes the user's avatar.
 */
export async function removeAvatar(userId: string): Promise<PublicUser> {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });

  if (currentUser?.avatarUrl?.includes('/uploads/avatars/')) {
    const oldFilename = currentUser.avatarUrl.split('/uploads/avatars/').pop();
    if (oldFilename) {
      const oldPath = path.join(UPLOADS_DIR, oldFilename);
      await fs.unlink(oldPath).catch(() => {});
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
    select: USER_SELECT,
  });

  return toPublicUser(updated);
}
