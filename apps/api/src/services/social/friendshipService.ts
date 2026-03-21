import { NotificationType, RequestStatus } from '@prisma/client';
import { NotificationType as SharedNotificationType } from '@betintel/shared';
import type { FriendRequestDetail, FriendRequestsOverview, FriendshipDetail } from '@betintel/shared';
import { prisma } from '../../prisma';
import { createNotification } from './notificationService';
import { emitFriendActivity } from '../../sockets/notificationSocket';

const SOCIAL_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  lastLoginAt: true,
} as const;

/** Returns the authenticated user's friend list. */
export async function listFriends(userId: string): Promise<FriendshipDetail[]> {
  const rows = await prisma.friendship.findMany({
    where: { userId },
    include: { friend: { select: SOCIAL_USER_SELECT } },
    orderBy: [{ friend: { username: 'asc' } }],
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    friendId: row.friendId,
    createdAt: row.createdAt.toISOString(),
    friend: serializeSocialUser(row.friend),
  }));
}

/** Returns pending requests sent to and from the authenticated user. */
export async function listPendingFriendRequests(userId: string): Promise<FriendRequestsOverview> {
  const [received, sent] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { receiverId: userId, status: RequestStatus.PENDING },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendRequest.findMany({
      where: { senderId: userId, status: RequestStatus.PENDING },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    received: received.map(serializeRequest),
    sent: sent.map(serializeRequest),
  };
}

/** Sends or reopens a friend request to another user. */
export async function sendFriendRequest(userId: string, targetUserId: string): Promise<FriendRequestDetail> {
  if (userId === targetUserId) {
    throw Object.assign(new Error('Não podes enviar um pedido a ti próprio'), { statusCode: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: SOCIAL_USER_SELECT,
  });

  if (!target) {
    throw Object.assign(new Error('Utilizador não encontrado'), { statusCode: 404 });
  }

  const [existingFriendship, sameDirection, oppositeDirection, me] = await Promise.all([
    prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
      select: { id: true },
    }),
    prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId: userId, receiverId: targetUserId } },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
    }),
    prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId: targetUserId, receiverId: userId } },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: SOCIAL_USER_SELECT }),
  ]);

  if (!me) {
    throw Object.assign(new Error('Utilizador não encontrado'), { statusCode: 404 });
  }

  if (existingFriendship) {
    throw Object.assign(new Error('Este utilizador já é teu amigo'), { statusCode: 409 });
  }

  if (oppositeDirection?.status === RequestStatus.PENDING) {
    throw Object.assign(new Error('Já tens um pedido pendente deste utilizador'), { statusCode: 409 });
  }

  let request;
  if (sameDirection) {
    if (sameDirection.status === RequestStatus.PENDING) {
      throw Object.assign(new Error('Já enviaste um pedido a este utilizador'), { statusCode: 409 });
    }

    request = await prisma.friendRequest.update({
      where: { id: sameDirection.id },
      data: { status: RequestStatus.PENDING },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
    });
  } else {
    request = await prisma.friendRequest.create({
      data: { senderId: userId, receiverId: targetUserId, status: RequestStatus.PENDING },
      include: {
        sender: { select: SOCIAL_USER_SELECT },
        receiver: { select: SOCIAL_USER_SELECT },
      },
    });
  }

  await createNotification({
    userId: targetUserId,
    type: NotificationType.FRIEND_REQUEST,
    title: 'Novo pedido de amizade',
    body: `${me.displayName ?? me.username} quer adicionar-te no BetIntel.`,
    data: { requestId: request.id, senderId: userId },
  });

  emitFriendActivity([targetUserId], {
    userId,
    type: SharedNotificationType.FRIEND_REQUEST,
    data: { requestId: request.id, senderId: userId },
  });

  return serializeRequest(request);
}

/** Accepts a pending friend request and creates the friendship pair. */
export async function acceptFriendRequest(userId: string, requestId: string): Promise<FriendshipDetail> {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, receiverId: userId, status: RequestStatus.PENDING },
    include: {
      sender: { select: SOCIAL_USER_SELECT },
      receiver: { select: SOCIAL_USER_SELECT },
    },
  });

  if (!request) {
    throw Object.assign(new Error('Pedido de amizade não encontrado'), { statusCode: 404 });
  }

  const friendship = await prisma.$transaction(async (transaction) => {
    await transaction.friendRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.ACCEPTED },
    });

    await transaction.friendship.upsert({
      where: { userId_friendId: { userId, friendId: request.senderId } },
      update: {},
      create: { userId, friendId: request.senderId },
    });

    const senderSide = await transaction.friendship.upsert({
      where: { userId_friendId: { userId: request.senderId, friendId: userId } },
      update: {},
      create: { userId: request.senderId, friendId: userId },
      include: {
        friend: { select: SOCIAL_USER_SELECT },
      },
    });

    return senderSide;
  });

  await createNotification({
    userId: request.senderId,
    type: NotificationType.FRIEND_ACCEPTED,
    title: 'Pedido aceite',
    body: `${request.receiver.displayName ?? request.receiver.username} aceitou o teu pedido de amizade.`,
    data: { requestId, friendId: userId },
  });

  emitFriendActivity([request.senderId], {
    userId,
    type: SharedNotificationType.FRIEND_ACCEPTED,
    data: { requestId, friendId: userId },
  });

  return {
    id: friendship.id,
    userId: friendship.userId,
    friendId: friendship.friendId,
    createdAt: friendship.createdAt.toISOString(),
    friend: serializeSocialUser(friendship.friend),
  };
}

/** Declines a pending friend request received by the authenticated user. */
export async function declineFriendRequest(userId: string, requestId: string): Promise<FriendRequestDetail> {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, receiverId: userId, status: RequestStatus.PENDING },
    include: {
      sender: { select: SOCIAL_USER_SELECT },
      receiver: { select: SOCIAL_USER_SELECT },
    },
  });

  if (!request) {
    throw Object.assign(new Error('Pedido de amizade não encontrado'), { statusCode: 404 });
  }

  const updated = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: RequestStatus.DECLINED },
    include: {
      sender: { select: SOCIAL_USER_SELECT },
      receiver: { select: SOCIAL_USER_SELECT },
    },
  });

  return serializeRequest(updated);
}

/** Removes an existing friendship in both directions. */
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const result = await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  });

  if (result.count === 0) {
    throw Object.assign(new Error('Amigo não encontrado'), { statusCode: 404 });
  }
}

function serializeSocialUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  lastLoginAt: Date | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function serializeRequest(request: {
  id: string;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  sender: Parameters<typeof serializeSocialUser>[0];
  receiver: Parameters<typeof serializeSocialUser>[0];
}): FriendRequestDetail {
  return {
    id: request.id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    status: request.status as FriendRequestDetail['status'],
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    sender: serializeSocialUser(request.sender),
    receiver: serializeSocialUser(request.receiver),
  };
}