// Pure tennis helpers (no app imports).

export interface GameSet { a: number; b: number }

/** Winner of a COMPLETED set; null while the set is still being played. */
export function setWinner(s: GameSet): 'A' | 'B' | null {
  const done = (Math.max(s.a, s.b) >= 6 && Math.abs(s.a - s.b) >= 2) || (Math.max(s.a, s.b) === 7 && Math.min(s.a, s.b) >= 5);
  if (!done) return null;
  return s.a > s.b ? 'A' : s.b > s.a ? 'B' : null;
}

/** Sets won by each side, counting only completed sets. */
export function setsWon(sets: GameSet[]): { home: number; away: number } {
  return { home: sets.filter((s) => setWinner(s) === 'A').length, away: sets.filter((s) => setWinner(s) === 'B').length };
}

/** "6-2 1-1" → [{a:6,b:2},{a:1,b:1}] (fallback when the API sends only the text line). */
export function parseSetLine(line: string | null | undefined): GameSet[] {
  if (!line) return [];
  return line.split(' ').map((p) => p.split('-').map(Number)).filter((x) => x.length === 2 && x.every(Number.isFinite)).map(([a, b]) => ({ a, b }));
}
