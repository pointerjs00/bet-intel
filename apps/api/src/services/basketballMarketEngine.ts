// Settlement of basketball (NBA) selections from the final score and the box score.
// Supported: winner (overtime included, as bookmakers settle "Vencedor do jogo"), 1X2 in
// regulation time, handicap/spread, total points, team totals, odd/even, the same per quarter
// or half, and player props (points, rebounds, assists, threes, steals, blocks, combinations,
// double-double / triple-double). Anything unknown returns null → the selection goes to "A rever".

import { findPlayer, teamNamesMatch } from './marketResolutionEngine';

export type BasketballResolution = 'WON' | 'LOST' | 'VOID';

export interface BasketballPlayerLine {
  name: string;
  played: boolean;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export interface BasketballResult {
  /** Final score with overtime. */
  home: number;
  away: number;
  /** Points per period (4 quarters, then overtimes). */
  periods: Array<{ home: number; away: number }>;
  /** Box score; null when not available. */
  players?: BasketballPlayerLine[] | null;
}

export interface BasketballContext { home: string; away: string }

type PropStat = 'points' | 'rebounds' | 'assists' | 'threes' | 'steals' | 'blocks' | 'turnovers';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(\d)/g, '$1.$2').trim();

/** Which side a selection names: team name, "1"/"2", "casa"/"fora". */
function sideOf(text: string, ctx: BasketballContext): 'H' | 'A' | null {
  const t = norm(text).replace(/\s*\(?[+-]\d+(?:\.\d+)?\)?\s*$/, '').replace(/^(mais|menos|over|under)\s+de\s+.*$/, '').trim();
  if (/^(1|casa|home)$/.test(t)) return 'H';
  if (/^(2|fora|away)$/.test(t)) return 'A';
  if (!t) return null;
  const h = teamNamesMatch(t, ctx.home);
  const a = teamNamesMatch(t, ctx.away);
  if (h === a) return null;
  return h ? 'H' : 'A';
}

function lineIn(text: string): number | null {
  const m = norm(text).match(/([+-]?\d+(?:\.\d+)?)\s*\)?\s*(pontos)?\s*$/);
  return m ? Number(m[1]) : null;
}

function overUnder(text: string): boolean | null {
  const t = norm(text);
  if (/\b(mais|over|acima)\b|^\+/.test(t)) return true;
  if (/\b(menos|under|abaixo)\b|^-/.test(t)) return false;
  return null;
}

function cmp(value: number, line: number, over: boolean): BasketballResolution {
  if (value === line) return 'VOID';
  return (value > line) === over ? 'WON' : 'LOST';
}

/** Stats a player market adds up ("Pontos + Ressaltos + Assistências" → three). */
function propStats(text: string): PropStat[] {
  let t = norm(text);
  const out: PropStat[] = [];
  if (/\bpra\b/.test(t)) return ['points', 'rebounds', 'assists'];
  if (/triplos?|lancamentos? de (3|tres)|cestos? de (3|tres)|(3|tres) pontos|three/.test(t)) {
    out.push('threes');
    t = t.replace(/triplos?|lancamentos? de (3|tres)|cestos? de (3|tres)|(3|tres) pontos|three/g, ' ');
  }
  if (/\bpontos\b|\bpoints\b/.test(t)) out.push('points');
  if (/ressaltos?|rebounds?/.test(t)) out.push('rebounds');
  if (/assistencias?|assists?/.test(t)) out.push('assists');
  if (/roubos?( de bola)?|steals?/.test(t)) out.push('steals');
  if (/desarmes? de lancamento|bloqueios?|tocos?|blocks?/.test(t)) out.push('blocks');
  if (/perdas? de bola|turnovers?/.test(t)) out.push('turnovers');
  return out;
}

const PLAYER_MARKET = /jogador|player|ressalto|assistenc|triplo|roubo|desarme|bloqueio|duplo|triplo-duplo|double|pra\b/;

/** Player-prop settlement, or undefined when the selection isn't a player prop. */
function resolvePlayerProp(market: string, selection: string, r: BasketballResult, ctx: BasketballContext): BasketballResolution | null | undefined {
  const m = norm(market);
  const s = norm(selection);
  const ou = s.match(/^(.*?)\s*(?:marca\s+)?(acima de|abaixo de|mais de|menos de|over|under)\s*(\d+(?:\.\d+)?)(.*)$/);
  const isDouble = /duplo-?duplo|double-?double|triplo-?duplo|triple-?double/.test(`${m} ${s}`);
  if (!isDouble && !(ou && (PLAYER_MARKET.test(m) || (ou[1] && !sideOf(ou[1], ctx))))) return undefined;
  if (!r.players) return null;

  // Player name: before the line in the selection, or after a dash in the market ("Ressaltos - Giannis").
  let name = ou ? ou[1]!.replace(/\b(marca|faz|tem)$/, '').trim() : s.replace(/\b(sim|nao|yes|no)\b/g, '').trim();
  if (!name) name = m.split(/\s[-–:]\s/).slice(1).join(' ').trim();
  if (!name || sideOf(name, ctx)) return undefined; // a team total, handled elsewhere
  const p = findPlayer(name, r.players);
  if (!p || p === 'AMBIGUOUS') return null;
  if (!p.played) return 'VOID';

  if (isDouble) {
    const tens = [p.points, p.rebounds, p.assists, p.steals, p.blocks].filter((v) => v >= 10).length;
    const need = /triplo|triple/.test(`${m} ${s}`) ? 3 : 2;
    const yes = !/\b(nao|no)\b/.test(s);
    return (tens >= need) === yes ? 'WON' : 'LOST';
  }
  const stats = propStats(`${m} ${ou![4] ?? ''}`);
  if (stats.length === 0) return null;
  const value = stats.reduce((acc, k) => acc + p[k], 0);
  return cmp(value, Number(ou![3]), /acima|mais|over/.test(ou![2]!));
}

/** Quarter or half a market is about; null = the whole game. */
function scopeOf(market: string): { quarter?: number; half?: 1 | 2 } | null {
  const m = norm(market);
  const q = m.match(/\b([1-4])\.?\s*[ºo°]?\s*(quarto|periodo)\b/) ?? m.match(/\b(primeiro|segundo|terceiro|quarto) (quarto|periodo)\b/);
  if (q) {
    const words: Record<string, number> = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4 };
    return { quarter: words[q[1]!] ?? Number(q[1]) };
  }
  if (/\b(1\.?\s*[ªa]?\s*parte|primeira parte|1st half|first half)\b/.test(m)) return { half: 1 };
  if (/\b(2\.?\s*[ªa]?\s*parte|segunda parte|2nd half|second half)\b/.test(m)) return { half: 2 };
  return null;
}

/** Points in the scope, or null when that part hasn't been played (or isn't known). */
function scoped(r: BasketballResult, scope: ReturnType<typeof scopeOf>): { home: number; away: number } | null {
  if (!scope) return { home: r.home, away: r.away };
  const sum = (ps: Array<{ home: number; away: number }>) => ps.reduce((a, p) => ({ home: a.home + p.home, away: a.away + p.away }), { home: 0, away: 0 });
  if (scope.quarter) return r.periods[scope.quarter - 1] ?? null;
  if (scope.half === 1) return r.periods.length >= 2 ? sum(r.periods.slice(0, 2)) : null;
  return r.periods.length >= 4 ? sum(r.periods.slice(2)) : null; // second half includes overtime
}

export function resolveBasketballMarket(
  market: string,
  selection: string,
  r: BasketballResult,
  ctx: BasketballContext,
): BasketballResolution | null {
  const m = norm(market);
  const s = norm(selection);

  const prop = resolvePlayerProp(market, selection, r, ctx);
  if (prop !== undefined) return prop;
  if (/jogador|player/.test(m)) return null;

  const scope = scopeOf(market);
  const sc = scoped(r, scope);
  if (!sc) return null;
  const total = sc.home + sc.away;
  const regulation = r.periods.slice(0, 4).reduce((acc, p) => ({ home: acc.home + p.home, away: acc.away + p.away }), { home: 0, away: 0 });

  // Odd / even total points.
  if (/par.?impar|odd.?even/.test(m)) {
    if (/^(par|even)$/.test(s)) return total % 2 === 0 ? 'WON' : 'LOST';
    if (/^(impar|odd)$/.test(s)) return total % 2 === 1 ? 'WON' : 'LOST';
    return null;
  }

  // Handicap / spread: "Lakers -5.5", "Lakers (-5.5)", or market "Handicap Lakers -5.5" + "Sim".
  if (/handicap|spread/.test(m)) {
    const side = sideOf(selection, ctx) ?? sideOf(market.replace(/handicap|spread|resultado/gi, ''), ctx);
    const line = lineIn(selection) ?? lineIn(market);
    if (!side || line === null) return null;
    const margin = side === 'H' ? sc.home - sc.away : sc.away - sc.home;
    const adj = margin + line;
    if (adj === 0) return 'VOID';
    return adj > 0 ? 'WON' : 'LOST';
  }

  // Totals: game total, or a team's total when the market/selection names a team.
  if (/total|pontos|mais\/menos|over\/under/.test(m) || overUnder(s) !== null) {
    const over = overUnder(s);
    const line = lineIn(s) ?? lineIn(m);
    if (over === null || line === null) return null;
    const team = sideOf(market.replace(/total|de|pontos|mais\/menos|\d\.?\s*[ºoªa°]?\s*(quarto|parte|periodo)/gi, ''), ctx)
      ?? sideOf(s.replace(/(mais|menos|acima|abaixo) de.*$/, '').trim(), ctx);
    if (team) return cmp(team === 'H' ? sc.home : sc.away, line, over);
    return cmp(total, line, over);
  }

  // 1X2 in regulation time (a draw after 48 minutes is possible), or a quarter/half result.
  if (/1x2|tempo regulamentar|regular time|regulation/.test(m) || (scope && /resultado|vencedor|1x2/.test(m))) {
    const base = scope ? sc : regulation;
    const res = base.home > base.away ? 'H' : base.home < base.away ? 'A' : 'D';
    if (/^(x|empate|draw)$/.test(s)) return res === 'D' ? 'WON' : 'LOST';
    const side = sideOf(selection, ctx);
    if (!side) return null;
    if (res === 'D' && scope && !/1x2/.test(m)) return 'VOID'; // 2-way quarter winner tied: void
    return side === res ? 'WON' : 'LOST';
  }

  // Winner / moneyline (overtime included).
  if (/vencedor|winner|moneyline|resultado|quem ganha|^$/.test(m) || sideOf(selection, ctx)) {
    const side = sideOf(selection, ctx);
    if (!side) return null;
    const winner = r.home > r.away ? 'H' : 'A';
    return side === winner ? 'WON' : 'LOST';
  }

  return null;
}

export interface BasketballLive {
  ifEndedNow: BasketballResolution | null;
  /** Set when the rest of the game can't change it (over line passed, quarter finished…). */
  decided: BasketballResolution | null;
}

/**
 * Live state of a basketball bet. `completedPeriods` = quarters already over (2 at half time).
 * Points, rebounds etc. only go up, so "over" lines passed are won and "under" lines passed are lost.
 */
export function assessBasketballLive(
  market: string,
  selection: string,
  r: BasketballResult,
  completedPeriods: number,
  ctx: BasketballContext,
): BasketballLive {
  const ifEndedNow = resolveBasketballMarket(market, selection, r, ctx);
  const m = norm(market);
  const s = norm(selection);
  const scope = scopeOf(market);

  // A finished quarter/half settles its markets.
  if (scope) {
    const lastQuarter = scope.quarter ?? (scope.half === 1 ? 2 : 99);
    return { ifEndedNow, decided: completedPeriods >= lastQuarter ? ifEndedNow : null };
  }

  const isPlayer = resolvePlayerProp(market, selection, r, ctx) !== undefined;
  const isTotal = isPlayer || (!/handicap|spread|par.?impar|odd.?even/.test(m) && (/total|pontos/.test(m) || overUnder(s) !== null));
  if (!isTotal || ifEndedNow === null || ifEndedNow === 'VOID') return { ifEndedNow, decided: null };
  const over = /acima|mais|over/.test(s);
  // "Over" already beaten stays won; "under" already beaten stays lost.
  if (over && ifEndedNow === 'WON') return { ifEndedNow, decided: 'WON' };
  if (!over && ifEndedNow === 'LOST') return { ifEndedNow, decided: 'LOST' };
  if (/duplo|double|triplo|triple/.test(`${m} ${s}`) && ifEndedNow === 'WON' && !/\b(nao|no)\b/.test(s)) return { ifEndedNow, decided: 'WON' };
  return { ifEndedNow, decided: null };
}
