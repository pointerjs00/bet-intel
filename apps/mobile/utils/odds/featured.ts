import type { OddsEventListItem } from './types';

/** At most this many games in "Em destaque". */
export const FEATURED_MAX = 6;
/**
 * Minimum popularity to be featured. Small games open a few dozen markets; big ones 150–300
 * (Alemanha – Países Baixos: 287 on Betano), and ESPN-matched games get +100.
 */
export const FEATURED_MIN = 120;

/** The most popular games still to play (or live), most popular first. */
export function pickFeatured(items: OddsEventListItem[], now: number = Date.now()): OddsEventListItem[] {
  return items
    .filter((i) => (i.popularity ?? 0) >= FEATURED_MIN && (i.event.live || Date.parse(i.event.startsAt) > now))
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.event.startsAt.localeCompare(b.event.startsAt))
    .slice(0, FEATURED_MAX);
}
