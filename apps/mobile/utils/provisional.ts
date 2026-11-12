// "Se o jogo acabasse agora": the boletim's result from the settled selections plus the live
// verdict of the ones in play (server live tracker). Pure (tests).

export type LiveVerdict = 'a ganhar' | 'a perder' | 'ganha' | 'perdida' | null;

export interface ProvisionalLeg { id: string; result: string; odd: number }
export interface Provisional {
  /** win = every selection holds; lose = at least one fails; open = holding but games still to start. */
  state: 'win' | 'lose' | 'open';
  holding: number;
  failing: number;
  toStart: number;
  legs: number;
  /** Profit if it ended now (win: return − stake; lose: −stake). */
  profit: number;
}

export function provisional(legs: ProvisionalLeg[], stake: number, isFreebet: boolean, live: Map<string, LiveVerdict>): Provisional | null {
  let holding = 0; let failing = 0; let toStart = 0; let odds = 1; let anyLive = false;
  for (const l of legs) {
    const v = live.get(l.id) ?? null;
    if (live.has(l.id)) anyLive = true;
    if (l.result === 'VOID') continue;
    const win = l.result === 'WON' || (l.result === 'PENDING' && (v === 'a ganhar' || v === 'ganha'));
    const lose = l.result === 'LOST' || (l.result === 'PENDING' && (v === 'a perder' || v === 'perdida'));
    if (win) { holding++; odds *= l.odd; } else if (lose) failing++; else toStart++;
  }
  if (!anyLive) return null;
  const ret = stake * odds;
  const state = failing ? 'lose' : toStart ? 'open' : 'win';
  return { state, holding, failing, toStart, legs: legs.length, profit: failing ? (isFreebet ? 0 : -stake) : isFreebet ? ret - stake + stake : ret - stake };
}
