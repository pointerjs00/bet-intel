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

const BOOST_TOLERANCE = new Prisma.Decimal('0.01');

function productOf(odds: Prisma.Decimal[]): Prisma.Decimal {
  return odds.reduce((acc, odd) => acc.mul(odd), new Prisma.Decimal(1));
}

/**
 * Recomputes a boletim's total odds from its legs, never by incremental division.
 * Imported boletins deliberately store the slip's (boosted) total odds, so the boost
 * (stored total / product of current legs) is measured before the change and reapplied
 * to the new product when it deviates from 1 by more than 1%. Rounded to 4 places at the end, matching what createBoletin stores, so an edit never shifts potentialReturn.
 */
export function recalculateTotalOdds(input: {
  currentTotalOdds: Prisma.Decimal;
  currentLegOdds: Prisma.Decimal[];
  nextLegOdds: Prisma.Decimal[];
}): Prisma.Decimal {
  const currentProduct = productOf(input.currentLegOdds);
  const nextProduct = productOf(input.nextLegOdds);
  const boost = currentProduct.isZero() ? new Prisma.Decimal(1) : input.currentTotalOdds.div(currentProduct);
  const total = boost.minus(1).abs().gt(BOOST_TOLERANCE) ? nextProduct.mul(boost) : nextProduct;
  return total.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}
