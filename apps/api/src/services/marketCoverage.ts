// Which markets the settlement engines understand, measured on real selections.
// Betclic blocks automated access (HTTP 403), so the market catalogue is learned from the
// user's own boletins: every market seen is classified as automatic or "goes to review".

import { parseBet } from './marketResolutionEngine';
import { resolveBasketballMarket } from './basketballMarketEngine';
import { resolveTennisMarket } from './tennisMarketEngine';

export type Support = 'AUTO' | 'REVIEW';

/** Whether a selection can be settled automatically (given the match data the free sources give). */
export function supportOf(sport: string, market: string, selection: string, home: string, away: string): Support {
  try {
    if (sport === 'FOOTBALL') return parseBet(market, selection, { homeNames: [home], awayNames: [away] }) ? 'AUTO' : 'REVIEW';
    if (sport === 'TENNIS') {
      const r = resolveTennisMarket(market, selection, { status: 'FINISHED', sets: [{ a: 6, b: 4 }, { a: 6, b: 7 }, { a: 6, b: 3 }], winner: 'A' }, { playerA: [home], playerB: [away] });
      return r ? 'AUTO' : 'REVIEW';
    }
    if (sport === 'BASKETBALL') {
      // A synthetic box score that contains whatever player the selection names.
      const name = selection.replace(/\s*(marca\s+)?(acima|abaixo|mais|menos)\s+de.*$/i, '').trim() || 'Jogador';
      const player = { name, played: true, points: 20, rebounds: 8, assists: 6, threes: 2, steals: 1, blocks: 1, turnovers: 2 };
      const r = resolveBasketballMarket(market, selection, {
        home: 100, away: 95, periods: [{ home: 25, away: 24 }, { home: 25, away: 24 }, { home: 25, away: 24 }, { home: 25, away: 23 }], players: [player],
      }, { home, away });
      return r ? 'AUTO' : 'REVIEW';
    }
  } catch {
    // fall through
  }
  return 'REVIEW';
}

export interface MarketCoverageRow {
  sport: string;
  market: string;
  total: number;
  auto: number;
  examples: string[];
}

/** Groups selections by sport + market, most frequent first. */
export function coverageOf(items: Array<{ sport: string; market: string; selection: string; homeTeam: string; awayTeam: string }>): {
  total: number;
  auto: number;
  markets: MarketCoverageRow[];
} {
  const rows = new Map<string, MarketCoverageRow>();
  let auto = 0;
  for (const it of items) {
    const key = `${it.sport}|${it.market}`;
    const row = rows.get(key) ?? { sport: it.sport, market: it.market, total: 0, auto: 0, examples: [] };
    row.total++;
    if (supportOf(it.sport, it.market, it.selection, it.homeTeam, it.awayTeam) === 'AUTO') { row.auto++; auto++; }
    else if (row.examples.length < 3 && !row.examples.includes(it.selection)) row.examples.push(it.selection);
    rows.set(key, row);
  }
  return { total: items.length, auto, markets: [...rows.values()].sort((a, b) => b.total - a.total) };
}
