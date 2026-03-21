import { Prisma, BoletinStatus, NotificationType, ItemResult } from '@prisma/client';
import type {
  BoletinDetail,
  BoletinItemDetail,
  BoletinShareDetail,
  BoletinStatus as SharedBoletinStatus,
  CompactBettingSite,
  CompactSportEvent,
  CompactUser,
  CreateBoletinInput,
  EventStatus as SharedEventStatus,
  ItemResult as SharedItemResult,
  ShareBoletinInput,
  UpdateBoletinInput,
} from '@betintel/shared';
import { NotificationType as SharedNotificationType } from '@betintel/shared';
import { prisma } from '../../prisma';
import { emitBoletinResult, emitFriendActivity } from '../../sockets';
import { emitNotificationNew } from '../../sockets/notificationSocket';
import { toSharedNotification } from '../social/notificationService';

const COMPACT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const COMPACT_SITE_SELECT = {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
} as const;

const COMPACT_EVENT_SELECT = {
  id: true,
  league: true,
  homeTeam: true,
  awayTeam: true,
  eventDate: true,
  status: true,
  homeScore: true,
  awayScore: true,
} as const;

const BOLETIN_DETAIL_INCLUDE = {
  user: { select: COMPACT_USER_SELECT },
  items: {
    include: {
      event: { select: COMPACT_EVENT_SELECT },
      site: { select: COMPACT_SITE_SELECT },
    },
    orderBy: { id: 'asc' },
  },
  sharedWith: {
    include: {
      sharedBy: { select: COMPACT_USER_SELECT },
      sharedWith: { select: COMPACT_USER_SELECT },
    },
    orderBy: { createdAt: 'desc' },
  },
} as const;

type BoletinDetailRecord = Prisma.BoletinGetPayload<{
  include: typeof BOLETIN_DETAIL_INCLUDE;
}>;

/** Shape returned by GET /api/betintel/shared. */
export interface SharedBoletinFeedItem {
  share: BoletinShareDetail;
  boletin: BoletinDetail;
}

/** Returns the authenticated user's boletins ordered from newest to oldest. */
export async function listUserBoletins(userId: string): Promise<BoletinDetail[]> {
  const boletins = await prisma.boletin.findMany({
    where: { userId },
    include: BOLETIN_DETAIL_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return boletins.map(serializeBoletinDetail);
}

/** Creates a new boletin after validating that all referenced odds still exist. */
export async function createBoletin(userId: string, input: CreateBoletinInput): Promise<BoletinDetail> {
  assertUniqueSelections(input.items);
  await assertSelectionsExist(input.items);

  const totalOdds = input.items.reduce(
    (acc, item) => acc.mul(new Prisma.Decimal(item.oddValue)),
    new Prisma.Decimal(1),
  );
  const totalOddsValue = totalOdds.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const stake = new Prisma.Decimal(input.stake).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const potentialReturn = stake
    .mul(totalOddsValue)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const boletin = await prisma.boletin.create({
    data: {
      userId,
      name: normalizeNullableText(input.name),
      notes: normalizeNullableText(input.notes),
      isPublic: input.isPublic,
      stake,
      totalOdds: totalOddsValue,
      potentialReturn,
      items: {
        create: input.items.map((item) => ({
          eventId: item.eventId,
          siteId: item.siteId,
          market: item.market.trim(),
          selection: item.selection.trim(),
          oddValue: new Prisma.Decimal(item.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          result: ItemResult.PENDING,
        })),
      },
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  return serializeBoletinDetail(boletin);
}

/** Returns a boletin detail when the user owns it, it is public, or it has been shared with them. */
export async function getBoletinDetail(userId: string, boletinId: string): Promise<BoletinDetail | null> {
  const boletin = await prisma.boletin.findFirst({
    where: {
      id: boletinId,
      OR: [
        { userId },
        { isPublic: true },
        { sharedWith: { some: { sharedWithId: userId } } },
      ],
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  return boletin ? serializeBoletinDetail(boletin) : null;
}

/** Updates boletin metadata and optionally resolves it with a final return value. */
export async function updateBoletin(
  userId: string,
  boletinId: string,
  input: UpdateBoletinInput,
): Promise<BoletinDetail> {
  const existing = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
  });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const nextStatus = input.status ?? existing.status;
  const actualReturn = resolveActualReturn(existing, nextStatus, input.actualReturn);

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: {
      name: input.name !== undefined ? normalizeNullableText(input.name) : undefined,
      notes: input.notes !== undefined ? normalizeNullableText(input.notes) : undefined,
      status: input.status,
      actualReturn,
      isPublic: input.isPublic,
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  if (updated.status !== BoletinStatus.PENDING) {
    emitBoletinResult(userId, {
      boletinId: updated.id,
      status: updated.status as unknown as SharedBoletinStatus,
      actualReturn: updated.actualReturn?.toFixed(2) ?? null,
    });
  }

  return serializeBoletinDetail(updated);
}

/** Deletes a boletin owned by the authenticated user. */
export async function deleteBoletin(userId: string, boletinId: string): Promise<void> {
  const existing = await prisma.boletin.findFirst({ where: { id: boletinId, userId } });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  await prisma.boletin.delete({ where: { id: boletinId } });
}

/** Shares a boletin with one or more friends and emits notifications for each recipient. */
export async function shareBoletin(
  userId: string,
  boletinId: string,
  input: ShareBoletinInput,
): Promise<BoletinShareDetail[]> {
  const boletin = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
    select: {
      id: true,
      name: true,
      user: { select: COMPACT_USER_SELECT },
    },
  });

  if (!boletin) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const recipientIds = Array.from(new Set(input.userIds.filter((candidate) => candidate !== userId)));
  if (recipientIds.length === 0) {
    throw Object.assign(new Error('Seleciona pelo menos um amigo válido'), { statusCode: 400 });
  }

  const recipients = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: COMPACT_USER_SELECT,
  });

  if (recipients.length !== recipientIds.length) {
    throw Object.assign(new Error('Um ou mais utilizadores não existem'), { statusCode: 404 });
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: recipientIds.flatMap((recipientId) => [
        { userId, friendId: recipientId },
        { userId: recipientId, friendId: userId },
      ]),
    },
    select: { userId: true, friendId: true },
  });

  const friendshipPairs = new Set(friendships.map((friendship) => `${friendship.userId}:${friendship.friendId}`));
  const invalidRecipients = recipientIds.filter(
    (recipientId) =>
      !friendshipPairs.has(`${userId}:${recipientId}`) && !friendshipPairs.has(`${recipientId}:${userId}`),
  );

  if (invalidRecipients.length > 0) {
    throw Object.assign(new Error('Só podes partilhar boletins com amigos'), { statusCode: 400 });
  }

  const message = normalizeNullableText(input.message);
  const { sharedRows, notifications } = await prisma.$transaction(async (transaction) => {
    const rows = await Promise.all(
      recipientIds.map((recipientId) =>
        transaction.sharedBoletin.upsert({
          where: {
            boletinId_sharedWithId: {
              boletinId,
              sharedWithId: recipientId,
            },
          },
          create: {
            boletinId,
            sharedById: userId,
            sharedWithId: recipientId,
            message,
          },
          update: {
            message,
            sharedById: userId,
          },
          include: {
            sharedBy: { select: COMPACT_USER_SELECT },
            sharedWith: { select: COMPACT_USER_SELECT },
          },
        }),
      ),
    );

    const createdNotifications = await Promise.all(
      recipients.map((recipient) =>
        transaction.notification.create({
          data: {
            userId: recipient.id,
            type: NotificationType.BOLETIN_SHARED,
            title: 'Novo boletin partilhado',
            body: `${boletin.user.displayName ?? boletin.user.username} partilhou um boletin contigo`,
            data: {
              boletinId,
              sharedById: userId,
              message,
              boletinName: boletin.name,
            },
          },
        }),
      ),
    );

    return { sharedRows: rows, notifications: createdNotifications };
  });

  notifications.forEach((notification) => {
    emitNotificationNew(notification.userId, toSharedNotification(notification));
  });

  emitFriendActivity(recipientIds, {
    userId,
    type: SharedNotificationType.BOLETIN_SHARED,
    data: { boletinId, sharedById: userId, recipientIds },
  });

  return sharedRows.map(serializeShare);
}

/** Returns all boletins shared with the authenticated user. */
export async function listSharedBoletins(userId: string): Promise<SharedBoletinFeedItem[]> {
  const shared = await prisma.sharedBoletin.findMany({
    where: { sharedWithId: userId },
    include: {
      sharedBy: { select: COMPACT_USER_SELECT },
      sharedWith: { select: COMPACT_USER_SELECT },
      boletin: {
        include: BOLETIN_DETAIL_INCLUDE,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return shared.map((item) => ({
    share: serializeShare(item),
    boletin: serializeBoletinDetail(item.boletin),
  }));
}

function assertUniqueSelections(items: CreateBoletinInput['items']): void {
  const keys = items.map((item) => `${item.eventId}:${item.siteId}:${item.market}:${item.selection}`);
  if (new Set(keys).size !== keys.length) {
    throw Object.assign(new Error('O boletin contém seleções duplicadas'), { statusCode: 400 });
  }
}

async function assertSelectionsExist(items: CreateBoletinInput['items']): Promise<void> {
  const activeOdds = await prisma.odd.findMany({
    where: {
      isActive: true,
      OR: items.map((item) => ({
        eventId: item.eventId,
        siteId: item.siteId,
        market: item.market.trim(),
        selection: item.selection.trim(),
      })),
    },
    select: {
      eventId: true,
      siteId: true,
      market: true,
      selection: true,
    },
  });

  const activeKeys = new Set(
    activeOdds.map((odd) => `${odd.eventId}:${odd.siteId}:${odd.market}:${odd.selection}`),
  );

  const missingSelection = items.find(
    (item) => !activeKeys.has(`${item.eventId}:${item.siteId}:${item.market.trim()}:${item.selection.trim()}`),
  );

  if (missingSelection) {
    throw Object.assign(new Error('Uma das odds já não está disponível'), { statusCode: 409 });
  }
}

function resolveActualReturn(
  boletin: { stake: Prisma.Decimal; potentialReturn: Prisma.Decimal; actualReturn: Prisma.Decimal | null },
  status: BoletinStatus,
  actualReturn?: number,
): Prisma.Decimal | null | undefined {
  if (actualReturn !== undefined) {
    return new Prisma.Decimal(actualReturn).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  switch (status) {
    case BoletinStatus.WON:
      return boletin.potentialReturn;
    case BoletinStatus.LOST:
      return new Prisma.Decimal(0);
    case BoletinStatus.VOID:
      return boletin.stake;
    case BoletinStatus.PENDING:
      return null;
    case BoletinStatus.PARTIAL:
    default:
      return boletin.actualReturn;
  }
}

function normalizeNullableText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializeCompactUser(user: {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}): CompactUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function serializeCompactSite(site: {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}): CompactBettingSite {
  return {
    id: site.id,
    slug: site.slug,
    name: site.name,
    logoUrl: site.logoUrl,
  };
}

function serializeCompactEvent(event: {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: Date;
  status: BoletinDetailRecord['items'][number]['event']['status'];
  homeScore: number | null;
  awayScore: number | null;
}): CompactSportEvent {
  return {
    id: event.id,
    league: event.league,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    eventDate: event.eventDate.toISOString(),
    status: event.status as unknown as SharedEventStatus,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
  };
}

function serializeItem(item: BoletinDetailRecord['items'][number]): BoletinItemDetail {
  return {
    id: item.id,
    boletinId: item.boletinId,
    eventId: item.eventId,
    siteId: item.siteId,
    market: item.market,
    selection: item.selection,
    oddValue: item.oddValue.toString(),
    result: item.result as unknown as SharedItemResult,
    event: serializeCompactEvent(item.event),
    site: serializeCompactSite(item.site),
  };
}

function serializeShare(share: {
  id: string;
  boletinId: string;
  sharedById: string;
  sharedWithId: string;
  message: string | null;
  createdAt: Date;
  sharedBy: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  sharedWith: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}): BoletinShareDetail {
  return {
    id: share.id,
    boletinId: share.boletinId,
    sharedById: share.sharedById,
    sharedWithId: share.sharedWithId,
    message: share.message,
    createdAt: share.createdAt.toISOString(),
    sharedBy: serializeCompactUser(share.sharedBy),
    sharedWith: serializeCompactUser(share.sharedWith),
  };
}

function serializeBoletinDetail(boletin: BoletinDetailRecord): BoletinDetail {
  return {
    id: boletin.id,
    userId: boletin.userId,
    name: boletin.name,
    stake: boletin.stake.toString(),
    totalOdds: boletin.totalOdds.toString(),
    potentialReturn: boletin.potentialReturn.toString(),
    status: boletin.status as unknown as SharedBoletinStatus,
    actualReturn: boletin.actualReturn?.toString() ?? null,
    notes: boletin.notes,
    isPublic: boletin.isPublic,
    createdAt: boletin.createdAt.toISOString(),
    updatedAt: boletin.updatedAt.toISOString(),
    user: serializeCompactUser(boletin.user),
    items: boletin.items.map(serializeItem),
    shares: boletin.sharedWith.map(serializeShare),
  };
}