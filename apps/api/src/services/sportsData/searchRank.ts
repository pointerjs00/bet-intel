// Ranking of team/player names against a typed query (as-you-type suggestions).

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * How well a name fits a typed query, for as-you-type suggestions: 0 = no match,
 * 3 = the name starts with it, 2 = every word starts a word of the name, 1 = contained.
 */
export function matchScore(name: string, q: string): number {
  const query = norm(q);
  if (!query) return 0;
  const n = norm(name);
  const words = query.split(' ');
  if (!words.every((w) => n.includes(w))) return 0;
  if (n.startsWith(query)) return 3;
  const nameWords = n.split(' ');
  if (words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 2;
  return 1;
}

