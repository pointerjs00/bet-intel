import { Prisma, BoletinStatus, ItemResult } from '@prisma/client';

/**
 * Derives a boletim's status and actual return from its legs. Pure: no database access.
 *
 * Order matters: a lost leg loses the whole multiple immediately (return 0), even while other
 * legs are still pending; only then does a pending leg keep the boletim PENDING.
 * Freebets: the stake is not returned, so a won freebet pays stake x odds (potentialReturn)
 * and a void freebet pays 0.
 */
export function deriveBoletinState(input: {
  stake: Prisma.Decimal;
  potentialReturn: Prisma.Decimal;
  isFreebet: boolean;
  items: Array<{ result: ItemResult; oddValue: Prisma.Decimal }>;
}): { status: BoletinStatus; actualReturn: Prisma.Decimal | null } {
  if (input.items.length === 0) {
    return { status: BoletinStatus.PENDING, actualReturn: null };
  }

  if (input.items.some((item) => item.result === ItemResult.LOST)) {
    return { status: BoletinStatus.LOST, actualReturn: new Prisma.Decimal(0) };
  }

  if (input.items.some((item) => item.result === ItemResult.PENDING)) {
    return { status: BoletinStatus.PENDING, actualReturn: null };
  }

  const hasVoid = input.items.some((item) => item.result === ItemResult.VOID);
  const hasWon = input.items.some((item) => item.result === ItemResult.WON);

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
