// Settlement of basketball (NBA) selections from the final score.
// Supported: winner (overtime included, as bookmakers settle "Vencedor do jogo"), 1X2 in
// regulation time, handicap/spread, total points, team total points, odd/even.
// Player props and anything unknown return null → the selection goes to "A rever".

import { teamNamesMatch } from './marketResolutionEngine';

export type BasketballResolution = 'WON' | 'LOST' | 'VOID';

export interface BasketballResult {
  /** Final score with overtime. */
  home: number;
  away: number;
  /** Points per period (4 quarters, then overtimes). */
  periods: Array<{ home: number; away: number }>;
}

export interface BasketballContext { home: string; away: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(\d)/g, '$1.$2').trim();

/** Which side a selection names: team name, "1"/"2", "casa"/"fora". */
function sideOf(text: string, ctx: BasketballContext): 'H' | 'A' | null {
  const t = norm(text).replace(/\s*\(?[+-]\d+(?:\.\d+)?\)?\s*$/, '').replace(/^(mais|menos|over|under)\s+de\s+.*$/, '').trim();
  if (/^(1|casa|home)$/.test(t)) return 'H';
  if (/^(2|fora|away)$/.test(t)) return 'A';
  const h = teamNamesMatch(t, ctx.home);
  const a = teamNamesMatch(t, ctx.away);
  if (h === a) return null;
  return h ? 'H' : 'A';
}

function lineIn(text: string): number | null {
  const m = norm(text).match(/([+-]?\d+(?:\.\d+)?)\s*\)?\s*$/);
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

export function resolveBasketballMarket(
  market: string,
  selection: string,
  r: BasketballResult,
  ctx: BasketballContext,
): BasketballResolution | null {
  const m = norm(market);
  const s = norm(selection);
  const total = r.home + r.away;
  const regulation = r.periods.slice(0, 4).reduce((acc, p) => ({ home: acc.home + p.home, away: acc.away + p.away }), { home: 0, away: 0 });

  // Player props are not settled from the box score here.
  if (/jogador|player|ressalt|assist|rebound/.test(m)) return null;

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
    const margin = side === 'H' ? r.home - r.away : r.away - r.home;
    const adj = margin + line;
    if (adj === 0) return 'VOID';
    return adj > 0 ? 'WON' : 'LOST';
  }

  // Totals: game total, or a team's total when the market/selection names a team.
  if (/total|pontos|mais\/menos|over\/under/.test(m) || overUnder(s) !== null) {
    const over = overUnder(s);
    const line = lineIn(s) ?? lineIn(m);
    if (over === null || line === null) return null;
    const team = sideOf(market.replace(/total|de|pontos|mais\/menos/gi, ''), ctx);
    if (team) return cmp(team === 'H' ? r.home : r.away, line, over);
    return cmp(total, line, over);
  }

  // 1X2 in regulation time (a draw after 48 minutes is possible).
  if (/1x2|tempo regulamentar|regular time|regulation/.test(m)) {
    const res = regulation.home > regulation.away ? 'H' : regulation.home < regulation.away ? 'A' : 'D';
    if (/^(x|empate|draw)$/.test(s)) return res === 'D' ? 'WON' : 'LOST';
    const side = sideOf(selection, ctx);
    if (!side) return null;
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
