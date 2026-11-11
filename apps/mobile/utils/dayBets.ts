import type { BoletinDetail } from '@betintel/shared';
import { BoletinStatus, ItemResult } from '@betintel/shared';
import { sameTeam } from './teamNames';

/** The user's selection on one listed match, with what the row needs to show it. */
export interface MatchBet {
  boletinId: string;
  selection: string;
  market: string;
  odd: number;
  result: ItemResult;
  /** Selections in the boletim (1 = single). */
  legs: number;
  wonLegs: number;
  /** Profit of the boletim once settled (singles and multiples alike), else null. */
  profit: number | null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function profitOf(b: BoletinDetail): number | null {
  if (b.status === BoletinStatus.PENDING) return null;
  const ret = Number(b.actualReturn ?? (b.status === BoletinStatus.CASHOUT ? b.cashoutAmount ?? 0 : 0));
  return ret - (b.isFreebet ? 0 : Number(b.stake));
}

/** Index of the user's selections by day, to look up listed matches quickly. */
export function indexBetsByDay(boletins: BoletinDetail[]): Map<string, Array<{ home: string; away: string; bet: MatchBet }>> {
  const out = new Map<string, Array<{ home: string; away: string; bet: MatchBet }>>();
  for (const b of boletins) {
    const wonLegs = b.items.filter((i) => i.result === ItemResult.WON).length;
    const profit = profitOf(b);
    for (const it of b.items) {
      const when = new Date(it.kickoffAt ?? b.betDate ?? b.createdAt);
      const key = dayKey(when);
      const list = out.get(key) ?? [];
      list.push({
        home: it.homeTeam, away: it.awayTeam,
        bet: { boletinId: b.id, selection: it.selection, market: it.market, odd: Number(it.oddValue), result: it.result, legs: b.items.length, wonLegs, profit },
      });
      out.set(key, list);
    }
  }
  return out;
}

/** The user's bet on a listed match (same day ±1, both teams match), or null. */
export function findMatchBet(
  index: Map<string, Array<{ home: string; away: string; bet: MatchBet }>>,
  kickoff: string,
  home: string,
  away: string,
): MatchBet | null {
  const d = new Date(kickoff);
  for (const off of [0, -1, 1]) {
    const list = index.get(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + off)));
    const hit = list?.find((x) => (sameTeam(x.home, home) && sameTeam(x.away, away)) || (sameTeam(x.home, away) && sameTeam(x.away, home)));
    if (hit) return hit.bet;
  }
  return null;
}

/** Every selection the user has on a match (several boletins can include the same game). */
export function findMatchBets(
  index: Map<string, Array<{ home: string; away: string; bet: MatchBet }>>,
  kickoff: string,
  home: string,
  away: string,
): Array<{ home: string; away: string; bet: MatchBet }> {
  const d = new Date(kickoff);
  const out: Array<{ home: string; away: string; bet: MatchBet }> = [];
  for (const off of [0, -1, 1]) {
    const list = index.get(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + off))) ?? [];
    for (const x of list) {
      if ((sameTeam(x.home, home) && sameTeam(x.away, away)) || (sameTeam(x.home, away) && sameTeam(x.away, home))) out.push(x);
    }
  }
  return out;
}

export { sameTeam };
