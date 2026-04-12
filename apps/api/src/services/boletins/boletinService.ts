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

/** Updates boletin metadata and keeps status derived from selection results. */
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

  const metadataData: Prisma.BoletinUpdateInput = {};
  if (input.name !== undefined) {
    metadataData.name = normalizeNullableText(input.name);
  }
  if (input.notes !== undefined) {
    metadataData.notes = normalizeNullableText(input.notes);
  }
  if (input.isPublic !== undefined) {
    metadataData.isPublic = input.isPublic;
  }
  if (input.isFreebet !== undefined) {
    metadataData.isFreebet = input.isFreebet;
  }
  if (input.siteSlug !== undefined) {
    metadataData.siteSlug = input.siteSlug ?? null;
  }
  if (input.betDate !== undefined) {
    metadataData.betDate = input.betDate ? new Date(input.betDate) : null;
  }

  if (Object.keys(metadataData).length > 0) {
    await prisma.boletin.update({
      where: { id: boletinId },
      data: metadataData,
    });
  }

  const nextStake = input.stake !== undefined
    ? new Prisma.Decimal(input.stake).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : undefined;

  const updated = await syncBoletinDerivedState(
    boletinId,
    nextStake !== undefined ? { stake: nextStake } : undefined,
  );

  emitResolvedBoletinResult(userId, updated);

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

  const updated = await syncBoletinDerivedState(boletinId);

  emitResolvedBoletinResult(userId, updated);

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

/** Adds a single selection to an existing boletin and recalculates odds/status. */
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

  await prisma.boletin.update({
    where: { id: boletinId },
    data: {
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
  });

  const updated = await syncBoletinDerivedState(boletinId, { totalOdds: newTotalOdds });

  emitResolvedBoletinResult(userId, updated);
  void invalidateStatsCache(userId);

  return serializeBoletinDetail(updated);
}

/** Removes a single selection from an existing boletin and recalculates odds/status. */
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
  await prisma.boletinItem.delete({ where: { id: itemId } });

  const updated = await syncBoletinDerivedState(boletinId, { totalOdds: newTotalOdds });

  emitResolvedBoletinResult(userId, updated);
  void invalidateStatsCache(userId);

  return serializeBoletinDetail(updated);
}

/** Edits a single item's fields and recalculates boletin totals/status when needed. */
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

  // Recalculate boletin totals only when oddValue changes.
  let newTotalOdds: Prisma.Decimal | undefined;

  if (input.oddValue !== undefined) {
    const newOddDecimal = new Prisma.Decimal(input.oddValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    newTotalOdds = existing.totalOdds
      .div(item.oddValue)
      .mul(newOddDecimal)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
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

  const updated = await syncBoletinDerivedState(
    boletinId,
    newTotalOdds !== undefined ? { totalOdds: newTotalOdds } : undefined,
  );

  emitResolvedBoletinResult(userId, updated);
  void invalidateStatsCache(userId);

  return serializeBoletinDetail(updated);
}

function deriveBoletinState(input: {
  stake: Prisma.Decimal;
  potentialReturn: Prisma.Decimal;
  isFreebet: boolean;
  items: Array<{ result: ItemResult; oddValue: Prisma.Decimal }>;
}): { status: BoletinStatus; actualReturn: Prisma.Decimal | null } {
  if (input.items.length === 0 || input.items.some((item) => item.result === ItemResult.PENDING)) {
    return { status: BoletinStatus.PENDING, actualReturn: null };
  }

  const hasLost = input.items.some((item) => item.result === ItemResult.LOST);
  const hasVoid = input.items.some((item) => item.result === ItemResult.VOID);
  const hasWon = input.items.some((item) => item.result === ItemResult.WON);

  if (hasLost) {
    return { status: BoletinStatus.LOST, actualReturn: new Prisma.Decimal(0) };
  }

  if (hasVoid && hasWon) {
    const winningOdds = input.items
      .filter((item) => item.result === ItemResult.WON)
      .reduce((acc, item) => acc.mul(item.oddValue), new Prisma.Decimal(1));

    return {
      status: BoletinStatus.PARTIAL,
      actualReturn: input.stake.mul(winningOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    };
  }

  if (hasVoid) {
    return {
      status: BoletinStatus.VOID,
      actualReturn: input.isFreebet ? new Prisma.Decimal(0) : input.stake,
    };
  }

  return {
    status: BoletinStatus.WON,
    actualReturn: input.potentialReturn,
  };
}

async function syncBoletinDerivedState(
  boletinId: string,
  overrides?: { stake?: Prisma.Decimal; totalOdds?: Prisma.Decimal },
) {
  const boletin = await prisma.boletin.findUnique({
    where: { id: boletinId },
    select: {
      id: true,
      stake: true,
      totalOdds: true,
      isFreebet: true,
      items: {
        select: {
          result: true,
          oddValue: true,
        },
      },
    },
  });

  if (!boletin) {
    throw Object.assign(new Error('Boletin não encontrado'), { statusCode: 404 });
  }

  const nextStake = overrides?.stake ?? boletin.stake;
  const nextTotalOdds = overrides?.totalOdds ?? boletin.totalOdds;
  const nextPotentialReturn = nextStake.mul(nextTotalOdds).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const derivedState = deriveBoletinState({
    stake: nextStake,
    potentialReturn: nextPotentialReturn,
    isFreebet: boletin.isFreebet,
    items: boletin.items,
  });

  return prisma.boletin.update({
    where: { id: boletinId },
    data: {
      stake: overrides?.stake,
      totalOdds: overrides?.totalOdds,
      potentialReturn:
        overrides?.stake !== undefined || overrides?.totalOdds !== undefined ? nextPotentialReturn : undefined,
      status: derivedState.status,
      actualReturn: derivedState.actualReturn,
      cashoutAmount: null,
    },
    include: BOLETIN_DETAIL_INCLUDE,
  });
}

function emitResolvedBoletinResult(
  userId: string,
  boletin: { id: string; status: BoletinStatus; actualReturn: Prisma.Decimal | null },
): void {
  if (boletin.status === BoletinStatus.PENDING) {
    return;
  }

  emitBoletinResult(userId, {
    boletinId: boletin.id,
    status: boletin.status as unknown as SharedBoletinStatus,
    actualReturn: boletin.actualReturn?.toFixed(2) ?? null,
  });
}

function assertUniqueSelections(items: CreateBoletinInput['items']): void {
  const keys = items.map((item) => `${item.homeTeam}:${item.awayTeam}:${item.competition}:${item.market}:${item.selection}`);
  if (new Set(keys).size !== keys.length) {
    throw Object.assign(new Error('O boletin contém seleções duplicadas'), { statusCode: 400 });
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