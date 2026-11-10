// Resolves tennis bets (match winner, set score, set winner, total games, total sets) against a
// finished match. Returns null when unsure (unknown market/player, retirement, walkover) → review.

import { teamNamesMatch } from './marketResolutionEngine';

export type TennisResolution = 'WON' | 'LOST' | 'VOID';

export interface TennisSet { a: number; b: number }

export interface TennisResult {
  status: 'FINISHED' | 'RETIRED' | 'WALKOVER' | 'CANCELLED';
  sets: TennisSet[];
  winner: 'A' | 'B' | null;
}

export interface TennisContext { playerA: string[]; playerB: string[] }

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
}

/** Which player a selection text names ("Jannik Sinner", "Sinner", "Jannik Sinner vence 2-0"). */
function playerOf(text: string, ctx: TennisContext): 'A' | 'B' | null {
  const t = text.replace(/\b(vence|ganha|wins?)\b.*$/, '').trim();
  if (!t) return null;
  const byName = (names: string[]) => names.some((n) => teamNamesMatch(t, n) || norm(n).split(' ').pop() === norm(t));
  const a = byName(ctx.playerA);
  const b = byName(ctx.playerB);
  if (a === b) return null;
  return a ? 'A' : 'B';
}

function setWinner(s: TennisSet): 'A' | 'B' | null {
  return s.a > s.b ? 'A' : s.b > s.a ? 'B' : null;
}

function overUnder(value: number, line: number, over: boolean): TennisResolution | null {
  if (value === line) return Number.isInteger(line) ? null : over ? 'WON' : 'LOST';
  return value > line === over ? 'WON' : 'LOST';
}

export function resolveTennisMarket(market: string, selection: string, r: TennisResult, ctx: TennisContext): TennisResolution | null {
  if (r.status === 'CANCELLED') return 'VOID';
  if (r.status !== 'FINISHED' || !r.winner || r.sets.length === 0) return null; // retirements/walkovers: bookmaker rules differ

  const m = norm(market);
  const s = norm(selection);
  if (/handicap|aces|duplas faltas|break|tie-?break|primeiro|exato de jogos/.test(m)) return null;

  const setsA = r.sets.filter((x) => setWinner(x) === 'A').length;
  const setsB = r.sets.filter((x) => setWinner(x) === 'B').length;

  // Set-specific markets: "1.º Set - Vencedor", "Vencedor do 2.º set"
  const setNo = m.match(/\b([1-5])\.?\s*(?:o|º)?\s*set\b|\bset\s*([1-5])\b/);
  if (setNo) {
    const idx = Number(setNo[1] ?? setNo[2]) - 1;
    const set = r.sets[idx];
    if (!set) return 'VOID';
    if (/jogos|games/.test(m)) {
      const line = s.match(/(mais de|acima de|over|menos de|abaixo de|under)\s*(\d+(?:\.\d+)?)/);
      return line ? overUnder(set.a + set.b, parseFloat(line[2]!), /mais|acima|over/.test(line[1]!)) : null;
    }
    const p = playerOf(s, ctx);
    return p ? (setWinner(set) === p ? 'WON' : 'LOST') : null;
  }

  // Correct score in sets: "Jannik Sinner vence 2-0" or "2-0" (first number = named player / player A)
  if (/resultado corret|resultado exat|correct score|resultado em sets|sets? exatos?/.test(m)) {
    const sc = s.match(/(\d)\s*[-:]\s*(\d)/);
    if (!sc) return null;
    const named = /vence|ganha/.test(s) ? playerOf(s, ctx) : 'A';
    if (!named) return null;
    const [x, y] = [Number(sc[1]), Number(sc[2])];
    const actual = named === 'A' ? [setsA, setsB] : [setsB, setsA];
    return actual[0] === x && actual[1] === y ? 'WON' : 'LOST';
  }

  // Totals: games or sets
  const tot = s.match(/(mais de|acima de|over|menos de|abaixo de|under)\s*(\d+(?:\.\d+)?)/);
  if (tot && /total|jogos|games|sets/.test(`${m} ${s}`)) {
    const over = /mais|acima|over/.test(tot[1]!);
    const line = parseFloat(tot[2]!);
    if (/\bsets?\b/.test(m) && !/jogos|games/.test(m)) return overUnder(r.sets.length, line, over);
    const before = s.slice(0, tot.index).trim();
    if (before) {
      const p = playerOf(before, ctx);
      if (!p) return null;
      return overUnder(r.sets.reduce((acc, x) => acc + (p === 'A' ? x.a : x.b), 0), line, over);
    }
    return overUnder(r.sets.reduce((acc, x) => acc + x.a + x.b, 0), line, over);
  }

  // Match winner
  if (/vencedor|winner|resultado|vence o encontro|para ganhar/.test(m) || /\bvence\b/.test(s)) {
    const p = playerOf(s, ctx);
    return p ? (p === r.winner ? 'WON' : 'LOST') : null;
  }
  return null;
}
