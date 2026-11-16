import { HOUSE_ORDER, type ComparedSelection, type HouseId } from './types';

/** Decimal odd with a comma: 1.9 -> "1,90". */
export function formatOdd(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Euro amount: 84.1 -> "84,10 €". */
export function formatEuro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Highest non-suspended price (ties broken by HOUSE_ORDER), or null. */
export function bestPrice(row: ComparedSelection): { house: HouseId; odds: number } | null {
  let best: { house: HouseId; odds: number } | null = null;
  for (const house of HOUSE_ORDER) {
    const p = row.prices[house];
    if (!p || p.suspended) continue;
    if (best === null || p.odds > best.odds) best = { house, odds: p.odds };
  }
  return best;
}

/** Houses by odds descending, suspended ones last. */
export function housesByOdds(row: ComparedSelection): Array<{ house: HouseId; odds: number; suspended: boolean }> {
  const list: Array<{ house: HouseId; odds: number; suspended: boolean }> = [];
  for (const house of HOUSE_ORDER) {
    const p = row.prices[house];
    if (p) list.push({ house, odds: p.odds, suspended: p.suspended });
  }
  return list.sort((a, b) => Number(a.suspended) - Number(b.suspended) || b.odds - a.odds);
}

const lisbonFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day (YYYY-MM-DD) in Europe/Lisbon, `offsetDays` from now. */
export function lisbonDay(offsetDays: number, now: Date = new Date()): string {
  const today = lisbonFmt.format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
