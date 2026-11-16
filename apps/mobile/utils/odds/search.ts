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
 * True when every word of `query` starts a word of one of the event's participant names (the house's
 * names and, for ESPN matches, ESPN's). "benf" finds "SL Benfica", "sinner alcaraz" finds that match.
 */
export function matchesQuery(item: OddsEventListItem, query: string): boolean {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return false;
  const { event } = item;
  const words = [event.home, event.away, event.canonical?.home ?? '', event.canonical?.away ?? '']
    .flatMap((n) => normalizeText(n).split(' '))
    .filter(Boolean);
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}
