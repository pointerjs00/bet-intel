import type { FriendFeedItem, PublicBoletinPreview } from '@betintel/shared';
import { prisma } from '../../prisma';

const SOCIAL_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  lastLoginAt: true,
} as const;

/** Builds the authenticated user's friend activity feed from public friend boletins. */
export async function getFriendFeed(userId: string): Promise<FriendFeedItem[]> {
  const friendships = await prisma.friendship.findMany({
    where: { userId },
    select: { friendId: true },
  });

  const friendIds = friendships.map((friendship) => friendship.friendId);
  if (friendIds.length === 0) {
    return [];
  }

  const boletins = await prisma.boletin.findMany({
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
  });

  return boletins.map((boletin) => {
    const user = {
      id: boletin.user.id,
      username: boletin.user.username,
      displayName: boletin.user.displayName,
      avatarUrl: boletin.user.avatarUrl,
      bio: boletin.user.bio,
      lastLoginAt: boletin.user.lastLoginAt?.toISOString() ?? null,
    };

    const previewEvents = boletin.items.slice(0, 3).map((item) => `${item.homeTeam} vs ${item.awayTeam}`);
    const previewBoletin: PublicBoletinPreview = {
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

    return {
      id: `public-boletin:${boletin.id}`,
      type: 'PUBLIC_BOLETIN' as const,
      createdAt: boletin.createdAt.toISOString(),
      user,
      message: `${boletin.user.displayName ?? boletin.user.username} publicou um boletin público.`,
      boletin: previewBoletin,
      previewEvents,
    };
  });
}