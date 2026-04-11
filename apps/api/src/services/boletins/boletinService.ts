import { Prisma, BoletinStatus, NotificationType, ItemResult, Sport } from '@prisma/client';
import type {
  BoletinDetail,
  BoletinItemDetail,
  BoletinShareDetail,
  BoletinStatus as SharedBoletinStatus,
  CompactUser,
  CreateBoletinInput,
  CreateBoletinItemInput,
  ItemResult as SharedItemResult,
  ShareBoletinInput,
  Sport as SharedSport,
  UpdateBoletinInput,
  UpdateBoletinItemInput,
  UpdateBoletinItemsInput,
} from '@betintel/shared';
import { NotificationType as SharedNotificationType } from '@betintel/shared';
import { prisma } from '../../prisma';
import { redis } from '../../utils/redis';
import { emitBoletinResult, emitFriendActivity } from '../../sockets';
import { emitNotificationNew } from '../../sockets/notificationSocket';
import { toSharedNotification } from '../social/notificationService';

/** Invalidates all cached stats entries for a user after boletin changes. */
async function invalidateStatsCache(userId: string): Promise<void> {
  try {
    const keys = await redis.keys(`stats:${userId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Non-critical — stats will recompute on next request
  }
}

const COMPACT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const BOLETIN_DETAIL_INCLUDE = {
  user: { select: COMPACT_USER_SELECT },
  items: {
    orderBy: { id: 'asc' as const },
  },
  sharedWith: {
    include: {
      sharedBy: { select: COMPACT_USER_SELECT },
      sharedWith: { select: COMPACT_USER_SELECT },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

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

/** Creates a new boletin with user-supplied match info and odds. */
export async function createBoletin(userId: string, input: CreateBoletinInput): Promise<BoletinDetail> {
  assertUniqueSelections(input.items);

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
      isFreebet: input.isFreebet ?? false,
      siteSlug: input.siteSlug ?? null,
      betDate: input.betDate ? new Date(input.betDate) : null,
      stake,
      totalOdds: totalOddsValue,
      potentialReturn,
      items: {
        create: input.items.map((item) => ({
          homeTeam: item.homeTeam.trim(),
          awayTeam: item.awayTeam.trim(),
          competition: item.competition.trim(),
          sport: (item.sport ?? 'FOOTBALL') as Sport,
          market: item.market.trim(),
          selection: item.selection.trim(),
          oddValue: new Prisma.Decimal(item.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          result: ItemResult.PENDING,
        })),
      },
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  void invalidateStatsCache(userId);

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
  const actualReturn = resolveActualReturn(existing, nextStatus, input.actualReturn, input.cashoutAmount);

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: {
      name: input.name !== undefined ? normalizeNullableText(input.name) : undefined,
      notes: input.notes !== undefined ? normalizeNullableText(input.notes) : undefined,
      status: input.status,
      actualReturn,
      cashoutAmount: input.cashoutAmount !== undefined
        ? new Prisma.Decimal(input.cashoutAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : undefined,
      isPublic: input.isPublic,
      siteSlug: input.siteSlug !== undefined ? (input.siteSlug ?? null) : undefined,
      betDate: input.betDate !== undefined ? (input.betDate ? new Date(input.betDate) : null) : undefined,
      ...(input.stake !== undefined && {
        stake: input.stake,
        potentialReturn: new Prisma.Decimal(input.stake).mul(existing.totalOdds),
      }),
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

  void invalidateStatsCache(userId);

  return serializeBoletinDetail(updated);
}

/** Updates individual item results (won/lost/void) and auto-resolves the boletin status. */
export async function updateBoletinItems(
  userId: string,
  boletinId: string,
  input: UpdateBoletinItemsInput,
): Promise<BoletinDetail> {
  const existing = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
    include: { items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const existingItemIds = new Set(existing.items.map((item) => item.id));
  const invalidItems = input.items.filter((item) => !existingItemIds.has(item.id));
  if (invalidItems.length > 0) {
    throw Object.assign(new Error('Um ou mais itens não pertencem a este boletin'), { statusCode: 400 });
  }

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.boletinItem.update({
        where: { id: item.id },
        data: { result: item.result as ItemResult },
      }),
    ),
  );

  // Re-fetch items to compute new boletin status
  const updatedItems = await prisma.boletinItem.findMany({
    where: { boletinId },
  });

  const allResolved = updatedItems.every((item) => item.result !== ItemResult.PENDING);
  let newStatus: BoletinStatus | undefined;
  let actualReturn: Prisma.Decimal | undefined;

  if (allResolved) {
    const hasLost = updatedItems.some((item) => item.result === ItemResult.LOST);
    const hasVoid = updatedItems.some((item) => item.result === ItemResult.VOID);
    const hasWon = updatedItems.some((item) => item.result === ItemResult.WON);

    if (hasLost) {
      newStatus = BoletinStatus.LOST;
      actualReturn = new Prisma.Decimal(0);
    } else if (hasVoid && hasWon) {
      // Recalculate odds excluding void items
      const activeOdds = updatedItems
        .filter((item) => item.result === ItemResult.WON)
        .reduce((acc, item) => acc.mul(item.oddValue), new Prisma.Decimal(1));
      newStatus = BoletinStatus.PARTIAL;
      actualReturn = existing.stake.mul(activeOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    } else if (hasVoid && !hasWon) {
      newStatus = BoletinStatus.VOID;
      // Freebets have no real cash to refund on void events
      actualReturn = existing.isFreebet ? new Prisma.Decimal(0) : existing.stake;
    } else {
      newStatus = BoletinStatus.WON;
      actualReturn = existing.potentialReturn;
    }
  } else {
    // At least one item is still PENDING — reset the boletin to PENDING and clear any
    // previously recorded return so stale resolved data is not left on the record.
    newStatus = BoletinStatus.PENDING;
    actualReturn = undefined; // keep existing value as-is; set to null via payload below
  }

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: {
      ...(newStatus ? {
        status: newStatus,
        actualReturn: newStatus === BoletinStatus.PENDING ? null : actualReturn,
      } : {}),
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  if (newStatus && newStatus !== BoletinStatus.PENDING) {
    emitBoletinResult(userId, {
      boletinId: updated.id,
      status: updated.status as unknown as SharedBoletinStatus,
      actualReturn: updated.actualReturn?.toFixed(2) ?? null,
    });
  }

  void invalidateStatsCache(userId);

  return serializeBoletinDetail(updated);
}

/** Deletes a boletin owned by the authenticated user. */
export async function deleteBoletin(userId: string, boletinId: string): Promise<void> {
  const existing = await prisma.boletin.findFirst({ where: { id: boletinId, userId } });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  await prisma.boletin.delete({ where: { id: boletinId } });
  void invalidateStatsCache(userId);
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

/** Adds a single selection to an existing pending boletin and recalculates odds/return. */
export async function addBoletinItem(
  userId: string,
  boletinId: string,
  input: CreateBoletinItemInput,
): Promise<BoletinDetail> {
  const existing = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
    include: { items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  if (existing.items.length >= 20) {
    throw Object.assign(new Error('Máximo de 20 seleções por boletin'), { statusCode: 400 });
  }

  const newOddValue = new Prisma.Decimal(input.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const newTotalOdds = existing.totalOdds.mul(newOddValue).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const newPotentialReturn = existing.stake.mul(newTotalOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: {
      totalOdds: newTotalOdds,
      potentialReturn: newPotentialReturn,
      items: {
        create: {
          homeTeam: input.homeTeam.trim(),
          awayTeam: input.awayTeam.trim(),
          competition: input.competition.trim(),
          sport: (input.sport ?? 'FOOTBALL') as Sport,
          market: input.market.trim(),
          selection: input.selection.trim(),
          oddValue: newOddValue,
          result: ItemResult.PENDING,
        },
      },
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  return serializeBoletinDetail(updated);
}

/** Removes a single selection from an existing boletin and recalculates odds/return. */
export async function deleteBoletinItem(
  userId: string,
  boletinId: string,
  itemId: string,
): Promise<BoletinDetail> {
  const existing = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
    include: { items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const item = existing.items.find((i) => i.id === itemId);
  if (!item) {
    throw Object.assign(new Error('Seleção não encontrada'), { statusCode: 404 });
  }

  if (existing.items.length <= 1) {
    throw Object.assign(new Error('O boletin deve ter pelo menos uma seleção'), { statusCode: 400 });
  }

  // Recalculate totalOdds by dividing out the removed item's oddValue
  const newTotalOdds = existing.totalOdds
    .div(item.oddValue)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const newPotentialReturn = existing.stake.mul(newTotalOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  await prisma.boletinItem.delete({ where: { id: itemId } });

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: { totalOdds: newTotalOdds, potentialReturn: newPotentialReturn },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  return serializeBoletinDetail(updated);
}

/** Edits a single item's fields and recalculates boletin totals if oddValue changed. */
export async function updateBoletinItem(
  userId: string,
  boletinId: string,
  itemId: string,
  input: UpdateBoletinItemInput,
): Promise<BoletinDetail> {
  const existing = await prisma.boletin.findFirst({
    where: { id: boletinId, userId },
    include: { items: true },
  });

  if (!existing) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const item = existing.items.find((i) => i.id === itemId);
  if (!item) {
    throw Object.assign(new Error('Seleção não encontrada'), { statusCode: 404 });
  }

  // Recalculate boletin totals only when oddValue changes
  let newTotalOdds = existing.totalOdds;
  let newPotentialReturn = existing.potentialReturn;

  if (input.oddValue !== undefined) {
    const newOddDecimal = new Prisma.Decimal(input.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    // Divide out the old odd, multiply in the new odd
    newTotalOdds = existing.totalOdds
      .div(item.oddValue)
      .mul(newOddDecimal)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    newPotentialReturn = existing.stake
      .mul(newTotalOdds)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  await prisma.boletinItem.update({
    where: { id: itemId },
    data: {
      homeTeam: input.homeTeam !== undefined ? input.homeTeam.trim() : undefined,
      awayTeam: input.awayTeam !== undefined ? input.awayTeam.trim() : undefined,
      competition: input.competition !== undefined ? input.competition.trim() : undefined,
      sport: input.sport !== undefined ? (input.sport as Sport) : undefined,
      market: input.market !== undefined ? input.market.trim() : undefined,
      selection: input.selection !== undefined ? input.selection.trim() : undefined,
      oddValue: input.oddValue !== undefined
        ? new Prisma.Decimal(input.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : undefined,
      result: input.result !== undefined ? (input.result as ItemResult) : undefined,
    },
  });

  const updated = await prisma.boletin.update({
    where: { id: boletinId },
    data: { totalOdds: newTotalOdds, potentialReturn: newPotentialReturn },
    include: BOLETIN_DETAIL_INCLUDE,
  });

  return serializeBoletinDetail(updated);
}

function assertUniqueSelections(items: CreateBoletinInput['items']): void {
  const keys = items.map((item) => `${item.homeTeam}:${item.awayTeam}:${item.competition}:${item.market}:${item.selection}`);
  if (new Set(keys).size !== keys.length) {
    throw Object.assign(new Error('O boletin contém seleções duplicadas'), { statusCode: 400 });
  }
}

function resolveActualReturn(
  boletin: { stake: Prisma.Decimal; potentialReturn: Prisma.Decimal; actualReturn: Prisma.Decimal | null; isFreebet: boolean },
  status: BoletinStatus,
  actualReturn?: number,
  cashoutAmount?: number,
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
      // Freebets have no real cash to refund on void events
      return boletin.isFreebet ? new Prisma.Decimal(0) : boletin.stake;
    case BoletinStatus.CASHOUT:
      return cashoutAmount !== undefined
        ? new Prisma.Decimal(cashoutAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : boletin.actualReturn;
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

function serializeItem(item: {
  id: string;
  boletinId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: string;
  market: string;
  selection: string;
  oddValue: Prisma.Decimal;
  result: ItemResult;
}): BoletinItemDetail {
  return {
    id: item.id,
    boletinId: item.boletinId,
    homeTeam: item.homeTeam,
    awayTeam: item.awayTeam,
    competition: item.competition,
    sport: item.sport as unknown as SharedSport,
    market: item.market,
    selection: item.selection,
    oddValue: item.oddValue.toString(),
    result: item.result as unknown as SharedItemResult,
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

function serializeBoletinDetail(boletin: Prisma.BoletinGetPayload<{ include: typeof BOLETIN_DETAIL_INCLUDE }>): BoletinDetail {
  return {
    id: boletin.id,
    userId: boletin.userId,
    name: boletin.name,
    stake: boletin.stake.toString(),
    totalOdds: boletin.totalOdds.toString(),
    potentialReturn: boletin.potentialReturn.toString(),
    status: boletin.status as unknown as SharedBoletinStatus,
    actualReturn: boletin.actualReturn?.toString() ?? null,
    cashoutAmount: boletin.cashoutAmount?.toString() ?? null,
    notes: boletin.notes,
    isPublic: boletin.isPublic,
    isFreebet: boletin.isFreebet,
    siteSlug: boletin.siteSlug,
    betDate: boletin.betDate?.toISOString() ?? null,
    createdAt: boletin.createdAt.toISOString(),
    updatedAt: boletin.updatedAt.toISOString(),
    user: serializeCompactUser(boletin.user),
    items: boletin.items.map(serializeItem),
    shares: boletin.sharedWith.map(serializeShare),
  };
}