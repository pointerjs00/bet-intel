import type { CanonicalSelection, HouseId } from './types';

/** Tie-break / display order of houses. */
export const HOUSE_ORDER: HouseId[] = ['betclic', 'betano', 'lebull', 'placard', 'solverde', 'bwin'];

export interface HousePrice {
  odds: number;
  suspended: boolean;
}

/** One comparable row: the same canonical selection across houses. */
export interface ComparedSelection {
  key: string | null;
  label: string;
  /** Market text of the house that created the row. */
  market: string;
  prices: Partial<Record<HouseId, HousePrice>>;
  best: HouseId | null;
  /** Original market/selection text per house. */
  labels: Partial<Record<HouseId, { market: string; selection: string }>>;
}

function bestOf(prices: Partial<Record<HouseId, HousePrice>>): HouseId | null {
  let best: HouseId | null = null;
  for (const h of HOUSE_ORDER) {
    const p = prices[h];
    if (!p || p.suspended) continue;
    if (best === null || p.odds > prices[best]!.odds) best = h;
  }
  return best;
}

/**
 * Joins selections with the same non-null key across houses; null-key selections stay
 * as one row for their own house. Best = highest non-suspended odds (ties by house order).
 */
export function mergeEvent(perHouse: Partial<Record<HouseId, CanonicalSelection[]>>): ComparedSelection[] {
  const byKey = new Map<string, ComparedSelection>();
  const rows: ComparedSelection[] = [];
  for (const house of HOUSE_ORDER) {
    for (const s of perHouse[house] ?? []) {
      const price = { odds: s.odds, suspended: s.suspended };
      const text = { market: s.marketLabel, selection: s.selectionLabel };
      if (s.key === null) {
        rows.push({ key: null, label: s.selectionLabel, market: s.marketLabel, prices: { [house]: price }, best: null, labels: { [house]: text } });
        continue;
      }
      const existing = byKey.get(s.key);
      if (existing) {
        if (!existing.prices[house]) existing.labels[house] = text;
        existing.prices[house] ??= price;
      } else {
        const row: ComparedSelection = { key: s.key, label: s.selectionLabel, market: s.marketLabel, prices: { [house]: price }, best: null, labels: { [house]: text } };
        byKey.set(s.key, row);
        rows.push(row);
      }
    }
  }
  for (const r of rows) r.best = bestOf(r.prices);
  return rows;
}

const SCALE = 1_000_000n; // odds as integer millionths; exact BigInt product

/** Product of odds rounded half up to 2 decimals, using exact integer arithmetic. */
function productRounded(odds: number[]): number {
  let acc = 1n;
  for (const o of odds) acc *= BigInt(Math.round(o * 1_000_000));
  const divisor = SCALE ** BigInt(odds.length) / 100n; // acc / divisor = hundredths
  const hundredths = (acc * 2n + divisor) / (divisor * 2n);
  return Number(hundredths) / 100;
}

/**
 * Totals of a multiple per house. A house with a missing or suspended leg has total null
 * (`missing` counts legs it does not price). Best = highest complete total (ties by house order).
 */
export function compareMultiple(
  legs: Array<Partial<Record<HouseId, HousePrice>>>,
): { perHouse: Partial<Record<HouseId, { total: number | null; missing: number }>>; best: HouseId | null } {
  const perHouse: Partial<Record<HouseId, { total: number | null; missing: number }>> = {};
  let best: HouseId | null = null;
  for (const house of HOUSE_ORDER) {
    if (!legs.some((l) => l[house])) continue;
    const prices = legs.map((l) => l[house]);
    const missing = prices.filter((p) => !p).length;
    const complete = missing === 0 && prices.every((p) => !p!.suspended);
    const total = complete ? productRounded(prices.map((p) => p!.odds)) : null;
    perHouse[house] = { total, missing };
    if (total !== null && (best === null || total > perHouse[best]!.total!)) best = house;
  }
  return { perHouse, best };
}
