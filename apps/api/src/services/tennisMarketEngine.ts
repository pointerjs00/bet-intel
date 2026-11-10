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
  // No free source has aces, double faults or break points per match (see ESTUDO_ESTATISTICAS.md).
  if (/aces|duplas faltas|break point|(?<!tie-)\bbreaks?\b|primeiro (jogo|ponto)|exato de jogos/.test(m)) return null;

  const setsA = r.sets.filter((x) => setWinner(x) === 'A').length;
  const setsB = r.sets.filter((x) => setWinner(x) === 'B').length;
  const yes = /^(sim|yes)$/.test(s);
  const no = /^(nao|no)$/.test(s);

  // Tie-break: in the match, or in set N (a 7-6 / 6-7 set).
  if (/tie-?break/.test(m)) {
    const tb = (x: TennisSet) => (x.a === 7 && x.b === 6) || (x.a === 6 && x.b === 7);
    const n = m.match(/\b([1-5])\.?\s*(?:o|º)?\s*set\b|\bset\s*([1-5])\b/);
    const happened = n ? (r.sets[Number(n[1] ?? n[2]) - 1] ? tb(r.sets[Number(n[1] ?? n[2]) - 1]!) : null) : r.sets.some(tb);
    if (happened === null) return 'VOID'; // that set wasn't played
    if (yes || no) return happened === yes ? 'WON' : 'LOST';
    return null;
  }

  // Handicap of games (default) or of sets: "Jannik Sinner (-3.5)".
  if (/handicap/.test(m)) {
    const hm = s.match(/^(.+?)\s*\(?\s*([+-]\d+(?:\.\d+)?)\s*\)?$/);
    if (!hm) return null;
    const p = playerOf(hm[1]!, ctx);
    if (!p) return null;
    const bySets = /\bsets?\b/.test(m) && !/jogos|games/.test(m);
    const gamesA = r.sets.reduce((acc, x) => acc + x.a, 0);
    const gamesB = r.sets.reduce((acc, x) => acc + x.b, 0);
    const diff = bySets ? (p === 'A' ? setsA - setsB : setsB - setsA) : (p === 'A' ? gamesA - gamesB : gamesB - gamesA);
    const adj = diff + parseFloat(hm[2]!);
    if (adj === 0) return 'VOID';
    return adj > 0 ? 'WON' : 'LOST';
  }

  // "Vence pelo menos um set" — player in the selection, or in the market with "Sim"/"Não".
  if (/pelo menos (um|1) set|ganha (um|1) set|to win a set/.test(m)) {
    const p = playerOf(yes || no ? m.replace(/.*(pelo menos (um|1) set|ganha (um|1) set|to win a set)\s*[-–:]?\s*/, '') : s, ctx);
    if (!p) return null;
    const won = (p === 'A' ? setsA : setsB) >= 1;
    return won === !no ? 'WON' : 'LOST';
  }

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

export interface TennisLive {
  /** As if the match ended now with the current leader winning. */
  ifEndedNow: TennisResolution | null;
  /** Set when what is left can't change it (a set already won, a tie-break already played…). */
  decided: TennisResolution | null;
}

/**
 * Live state of a tennis bet. `sets` are the sets so far, the last one possibly in progress
 * (`lastSetDone` says whether it is over).
 */
export function assessTennisLive(market: string, selection: string, sets: TennisSet[], lastSetDone: boolean, ctx: TennisContext): TennisLive {
  const done = lastSetDone ? sets : sets.slice(0, -1);
  const setsA = done.filter((x) => setWinner(x) === 'A').length;
  const setsB = done.filter((x) => setWinner(x) === 'B').length;
  const leader = setsA > setsB ? 'A' : setsB > setsA ? 'B' : null;
  const ifEndedNow = leader && done.length
    ? resolveTennisMarket(market, selection, { status: 'FINISHED', sets: done, winner: leader }, ctx)
    : null;
  const m = norm(market);
  const s = norm(selection);

  // A finished set settles its own markets.
  const setNo = m.match(/\b([1-5])\.?\s*(?:o|º)?\s*set\b|\bset\s*([1-5])\b/);
  if (setNo) {
    const idx = Number(setNo[1] ?? setNo[2]) - 1;
    if (idx < done.length) {
      return { ifEndedNow, decided: resolveTennisMarket(market, selection, { status: 'FINISHED', sets: done, winner: leader ?? 'A' }, ctx) };
    }
    return { ifEndedNow, decided: null };
  }
  // A tie-break already played answers "Haverá tie-break?".
  if (/tie-?break/.test(m) && done.some((x) => (x.a === 7 && x.b === 6) || (x.a === 6 && x.b === 7))) {
    return { ifEndedNow, decided: /^(sim|yes)$/.test(s) ? 'WON' : /^(nao|no)$/.test(s) ? 'LOST' : null };
  }
  // A set already won answers "Vence pelo menos um set".
  if (/pelo menos (um|1) set|ganha (um|1) set/.test(m)) {
    const p = playerOf(s, ctx);
    if (p && (p === 'A' ? setsA : setsB) >= 1) return { ifEndedNow, decided: 'WON' };
  }
  // Games only go up: an "over" line already passed is won.
  const tot = s.match(/(mais de|acima de|over|menos de|abaixo de|under)\s*(\d+(?:\.\d+)?)/);
  if (tot && /total|jogos|games/.test(`${m} ${s}`) && !/\bsets?\b/.test(m) && !s.slice(0, tot.index).trim()) {
    const games = sets.reduce((acc, x) => acc + x.a + x.b, 0);
    if (games > parseFloat(tot[2]!)) return { ifEndedNow, decided: /mais|acima|over/.test(tot[1]!) ? 'WON' : 'LOST' };
  }
  return { ifEndedNow, decided: null };
}
