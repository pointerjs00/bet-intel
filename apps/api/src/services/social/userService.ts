import { BoletinStatus, Prisma } from '@prisma/client';
import type {
  PaginationMeta,
  PublicBoletinPreview,
  PublicProfile,
  PublicProfileStats,
  PublicUser,
  SocialUser,
  UpdateProfileInput,
  UserSearchResult,
  UsernameAvailability,
} from '@betintel/shared';
import { prisma } from '../../prisma';
import { USER_SELECT, toPublicUser } from '../../utils/userSerializer';

const SOCIAL_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  lastLoginAt: true,
} as const;

const PUBLIC_PROFILE_SELECT = {
  ...SOCIAL_USER_SELECT,
  createdAt: true,
  boletins: {
    where: { isPublic: true },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      stake: true,
      totalOdds: true,
      potentialReturn: true,
      actualReturn: true,
      isPublic: true,
      items: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  },
} as const;

type SocialUserRow = Prisma.UserGetPayload<{ select: typeof SOCIAL_USER_SELECT }>;
type PublicProfileRow = Prisma.UserGetPayload<{ select: typeof PUBLIC_PROFILE_SELECT }>;

/** Returns the authenticated user's editable profile. */
export async function getCurrentUserProfile(userId: string): Promise<PublicUser> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });

  if (!row) {
    throw Object.assign(new Error('Utilizador não encontrado'), { statusCode: 404 });
  }

  return toPublicUser(row);
}

/** Updates the authenticated user's editable profile settings. */
export async function updateCurrentUserProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      expoPushToken: input.expoPushToken,
      currency: input.currency,
      theme: input.theme,
      defaultBoletinsPublic: input.defaultBoletinsPublic,
      ...(input.goals !== undefined && { goals: input.goals }),
    },
    select: USER_SELECT,
  });

  return toPublicUser(updated);
}

/** Checks whether a username is available, optionally excluding the current user. */
export async function checkUsernameAvailability(
  username: string,
  excludeUserId?: string,
): Promise<UsernameAvailability> {
  const existing = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return { available: !existing };
}

/** Searches users by username or display name and annotates friend/request state for the caller. */
export async function searchUsers(query: string, userId: string): Promise<UserSearchResult[]> {
  const rows = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { username: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: SOCIAL_USER_SELECT,
    orderBy: [{ username: 'asc' }],
    take: 20,
  });

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }

  const [friendships, pendingRequests] = await Promise.all([
    prisma.friendship.findMany({
      where: { userId, friendId: { in: ids } },
      select: { friendId: true },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { senderId: userId, receiverId: { in: ids } },
          { receiverId: userId, senderId: { in: ids } },
        ],
      },
      select: { senderId: true, receiverId: true },
    }),
  ]);

  const friendIds = new Set(friendships.map((row) => row.friendId));
  const sentRequestIds = new Set(
    pendingRequests.filter((row) => row.senderId === userId).map((row) => row.receiverId),
  );
  const receivedRequestIds = new Set(
    pendingRequests.filter((row) => row.receiverId === userId).map((row) => row.senderId),
  );

  return rows.map((row) => ({
    ...serializeSocialUser(row),
    isFriend: friendIds.has(row.id),
    hasPendingRequest: sentRequestIds.has(row.id) || receivedRequestIds.has(row.id),
    pendingRequestDirection: sentRequestIds.has(row.id)
      ? 'sent'
      : receivedRequestIds.has(row.id)
        ? 'received'
        : null,
  }));
}

/** Returns a public profile with public stats and recent public boletins. */
export async function getPublicUserProfile(username: string): Promise<PublicProfile | null> {
  const row = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: PUBLIC_PROFILE_SELECT,
  });

  if (!row) {
    return null;
  }

  const stats = buildPublicProfileStats(row);
  const publicBoletins = row.boletins.map(serializePublicBoletinPreview);

  return {
    user: {
      ...serializeSocialUser(row),
      createdAt: row.createdAt.toISOString(),
    },
    stats,
    publicBoletins,
  };
}

function buildPublicProfileStats(row: PublicProfileRow): PublicProfileStats {
  let settledBoletins = 0;
  let wonBoletins = 0;
  let totalStaked = 0;
  let totalReturned = 0;

  for (const boletin of row.boletins) {
    const stake = decimalToNumber(boletin.stake);
    totalStaked += stake;

    if (boletin.status !== BoletinStatus.PENDING) {
      settledBoletins += 1;
      const returned = getPublicBoletinReturn(boletin.status, boletin.potentialReturn, boletin.actualReturn, boletin.stake);
      totalReturned += returned;

      if (boletin.status === BoletinStatus.WON || boletin.status === BoletinStatus.PARTIAL) {
        wonBoletins += 1;
      }
    }
  }

  const profitLoss = totalReturned - totalStaked;

  return {
    publicBoletins: row.boletins.length,
    settledBoletins,
    winRate: settledBoletins > 0 ? round((wonBoletins / settledBoletins) * 100) : 0,
    roi: totalStaked > 0 ? round((profitLoss / totalStaked) * 100) : 0,
    totalStaked: round(totalStaked),
    totalReturned: round(totalReturned),
    profitLoss: round(profitLoss),
  };
}

function getPublicBoletinReturn(
  status: BoletinStatus,
  potentialReturn: Prisma.Decimal,
  actualReturn: Prisma.Decimal | null,
  stake: Prisma.Decimal,
): number {
  switch (status) {
    case BoletinStatus.WON:
      return decimalToNumber(actualReturn ?? potentialReturn);
    case BoletinStatus.LOST:
      return decimalToNumber(actualReturn ?? new Prisma.Decimal(0));
    case BoletinStatus.VOID:
      return decimalToNumber(actualReturn ?? stake);
    case BoletinStatus.PARTIAL:
      return decimalToNumber(actualReturn ?? potentialReturn);
    case BoletinStatus.PENDING:
    default:
      return 0;
  }
}

function serializeSocialUser(row: SocialUserRow): SocialUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

function serializePublicBoletinPreview(boletin: PublicProfileRow['boletins'][number]): PublicBoletinPreview {
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

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}