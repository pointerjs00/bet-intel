import type { OddsEventListItem } from './types';

/** Lower case, no accents, punctuation as spaces, single spaces. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when every word of `query` starts a word of the event's participant names (the house's names
 * and, for ESPN matches, ESPN's) or of its competition. "benf" finds "SL Benfica", "sinner alcaraz"
 * finds that match, "premier" finds every Premier League game, "benfica liga" Benfica's league game.
 */
export function matchesQuery(item: OddsEventListItem, query: string): boolean {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return false;
  const { event } = item;
  const words = [event.home, event.away, event.canonical?.home ?? '', event.canonical?.away ?? '', event.competition]
    .flatMap((n) => normalizeText(n).split(' '))
    .filter(Boolean);
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}

/** List filters of the Odds tab; every one that is set must hold. */
export interface OddsFilters {
  competition?: string | null;
  /** Only games at least two houses price (the ones worth comparing). */
  comparable?: boolean;
  live?: boolean;
}

/** Items that pass every set filter, in their original order. */
export function applyFilters(items: OddsEventListItem[], f: OddsFilters): OddsEventListItem[] {
  return items.filter((i) =>
    (!f.competition || i.event.competition === f.competition)
    && (!f.comparable || i.houseCount >= 2)
    && (!f.live || i.event.live));
}
