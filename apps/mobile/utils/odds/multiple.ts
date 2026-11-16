import { HOUSE_ORDER, type HouseId, type MultipleResult, type OddsEventView } from './types';
import type { SlipLeg } from './slip';

type PerHouse = MultipleResult['perHouse'];

/** Houses present in `perHouse` by HOUSE_ORDER, the best one first. */
export function orderColumns(perHouse: PerHouse, best: HouseId | null): HouseId[] {
  const present = HOUSE_ORDER.filter((h) => perHouse[h] !== undefined);
  if (best && present.includes(best)) return [best, ...present.filter((h) => h !== best)];
  return present;
}

/** A house is selectable only when it has a price for every leg. */
export function isSelectable(perHouse: PerHouse, house: HouseId): boolean {
  const e = perHouse[house];
  return !!e && e.total !== null && e.missing === 0;
}

/** House to register at: the picked one if still selectable, else the best, else null. */
export function chosenHouse(perHouse: PerHouse, best: HouseId | null, picked: HouseId | null): HouseId | null {
  if (picked && isSelectable(perHouse, picked)) return picked;
  if (best && isSelectable(perHouse, best)) return best;
  return null;
}

/** Odd of one leg at a house (null when absent or suspended). */
export function legOdd(view: OddsEventView | null | undefined, selectionKey: string, house: HouseId): number | null {
  const p = view?.rows.find((r) => r.key === selectionKey)?.prices[house];
  return p && !p.suspended ? p.odds : null;
}

/** Odds shown in the table keyed by builder item id (`eventKey|selectionKey|house`). */
export function shownOddsFor(
  legs: SlipLeg[],
  house: HouseId,
  views: Map<string, OddsEventView | null | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of legs) {
    const o = legOdd(views.get(l.eventKey), l.selectionKey, house);
    if (o !== null) out[`${l.eventKey}|${l.selectionKey}|${house}`] = o;
  }
  return out;
}
