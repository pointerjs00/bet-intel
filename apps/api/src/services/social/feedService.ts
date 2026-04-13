import type { FriendFeedItem, PublicBoletinPreview, SocialUser } from '@betintel/shared';
import { prisma } from '../../prisma';

const SOCIAL_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  lastLoginAt: true,
} as const;

/** Builds the authenticated user's friend activity feed from public and directly shared friend boletins. */
export async function getFriendFeed(userId: string): Promise<FriendFeedItem[]> {
  const friendships = await prisma.friendship.findMany({
    where: { userId },
    select: { friendId: true },
  });

  const friendIds = friendships.map((friendship) => friendship.friendId);
  if (friendIds.length === 0) {
    return [];
  }

  const [publicBoletins, sharedBoletins] = await Promise.all([
    prisma.boletin.findMany({
      where: {
        userId: { in: friendIds },
        isPublic: true,
      },
      include: {
        user: { select: SOCIAL_USER_SELECT },
        items: {
          orderBy: { id: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.sharedBoletin.findMany({
      where: {
        sharedWithId: userId,
        sharedById: { in: friendIds },
      },
      include: {
        sharedBy: { select: SOCIAL_USER_SELECT },
        boletin: {
          include: {
            user: { select: SOCIAL_USER_SELECT },
            items: {
              orderBy: { id: 'asc' as const },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const publicFeed = publicBoletins.map((boletin) => ({
    id: `public-boletin:${boletin.id}`,
    type: 'PUBLIC_BOLETIN' as const,
    createdAt: boletin.createdAt.toISOString(),
    user: serializeSocialUser(boletin.user),
    message: `${boletin.user.displayName ?? boletin.user.username} publicou um boletin público.`,
    boletin: serializePreviewBoletin(boletin),
    previewEvents: serializePreviewEvents(boletin.items),
  }));

  const sharedFeed = sharedBoletins.map((share) => ({
    id: `shared-boletin:${share.id}`,
    type: 'SHARED_BOLETIN' as const,
    createdAt: share.createdAt.toISOString(),
    user: serializeSocialUser(share.sharedBy),
    message: `${share.sharedBy.displayName ?? share.sharedBy.username} partilhou um boletin contigo.`,
    boletin: serializePreviewBoletin(share.boletin),
    previewEvents: serializePreviewEvents(share.boletin.items),
  }));

  return [...publicFeed, ...sharedFeed]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 30);
}

function serializeSocialUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  lastLoginAt: Date | null;
}): SocialUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function serializePreviewBoletin(boletin: {
  id: string;
  name: string | null;
  status: string;
  createdAt: Date;
  stake: { toFixed: (digits: number) => string };
  totalOdds: { toFixed: (digits: number) => string };
  potentialReturn: { toFixed: (digits: number) => string };
  actualReturn: { toFixed: (digits: number) => string } | null;
  isPublic: boolean;
  items: Array<unknown>;
}): PublicBoletinPreview {
  return {
    id: boletin.id,
    name: boletin.name,
    status: boletin.status as PublicBoletinPreview['status'],
    createdAt: boletin.createdAt.toISOString(),
    stake: boletin.stake.toFixed(2),
    totalOdds: boletin.totalOdds.toFixed(4),
    potentialReturn: boletin.potentialReturn.toFixed(2),
    actualReturn: boletin.actualReturn?.toFixed(2) ?? null,
    isPublic: boletin.isPublic,
    itemCount: boletin.items.length,
  };
}

function serializePreviewEvents(items: Array<{ homeTeam: string; awayTeam: string }>): string[] {
  return items.slice(0, 3).map((item) => `${item.homeTeam} vs ${item.awayTeam}`);
}