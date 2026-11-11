// Ranking of team/player names against a typed query (as-you-type suggestions), and resolving a
// name from the user's bets to the one indexed team it denotes.

import { teamMatchScore } from '../marketResolutionEngine';
import type { IndexedTeam } from '../../jobs/sportAssetsJob';

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


/**
 * The ONE indexed team a name from the user's bets refers to: the best-scoring team of that sport,
 * provided it is unambiguous ("Sporting CP" → Sporting CP, never Sporting Gijón; "Inglaterra" →
 * England, never New England Revolution). Loose matches only count when nothing else competes.
 */
export function resolveIndexedTeam(name: string, sport: string, index: Array<Pick<IndexedTeam, 'id' | 'sport' | 'name'>>): Pick<IndexedTeam, 'id' | 'sport' | 'name'> | null {
  let best: Pick<IndexedTeam, 'id' | 'sport' | 'name'> | null = null;
  let bestScore = 0;
  let tie = false;
  for (const t of index) {
    if (t.sport !== sport) continue;
    const sc = teamMatchScore(name, t.name);
    if (sc > bestScore) { best = t; bestScore = sc; tie = false; } else if (sc === bestScore && sc > 0) tie = true;
  }
  if (!best || (tie && bestScore < 3)) return null;
  return best;
}

