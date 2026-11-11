// Explains a selection against a finished (or live) football match: what the user needed, what
// happened, and — for result / total goals / both-teams-to-score — how the bet stood minute by
// minute, rebuilt from the goal incidents.

import { sameTeam } from './teamNames';

export interface GoalEvent { minute: number; side: 'home' | 'away'; label: string }
export interface TimelineSegment { from: number; to: number; winning: boolean }
export interface DecisiveMoment { minute: number; label: string; winningAfter: boolean; score: string }

export interface BetExplanation {
  /** "FC Porto ganhar nos 90'" */
  needed: string;
  /** "Vitória SC 1–2 FC Porto" */
  happened: string;
  /** Null when the market can't be followed minute by minute. */
  segments: TimelineSegment[] | null;
  moments: DecisiveMoment[];
}

type Check = (h: number, a: number) => boolean;

/** "38'" → 38, "90'+7'" → 97, "45+2'" → 47. */
export function parseMinute(m: string): number {
  const parts = m.match(/\d+/g)?.map(Number) ?? [0];
  return (parts[0] ?? 0) + (parts[1] ?? 0);
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Works out what a selection needs as a function of the score, for the markets we can follow. */
function interpret(market: string, selection: string, home: string, away: string): { needed: string; check: Check } | null {
  const mk = norm(market);
  const sel = norm(selection).replace(/\s+(vence|ganha)$/, '');
  const line = Number((selection.match(/(\d+[.,]\d+|\d+)/)?.[1] ?? '').replace(',', '.'));

  if (/ambas|both teams/.test(mk) || /as duas equipas marcam/.test(sel)) {
    const yes = /^(sim|yes)$|duas equipas marcam/.test(sel);
    const no = /^(nao|no)$/.test(sel);
    if (yes) return { needed: 'As duas equipas marcarem', check: (h, a) => h > 0 && a > 0 };
    if (no) return { needed: 'Uma das equipas ficar a zero', check: (h, a) => h === 0 || a === 0 };
  }
  if (/golos|goals|total/.test(mk) && Number.isFinite(line) && line > 0 && !/canto|cart|corner|card/.test(mk)) {
    if (/^(mais|over|\+)/.test(sel)) return { needed: `Mais de ${String(line).replace('.', ',')} golos`, check: (h, a) => h + a > line };
    if (/^(menos|under|-)/.test(sel)) return { needed: `Menos de ${String(line).replace('.', ',')} golos`, check: (h, a) => h + a < line };
  }
  if (/resultado|vencedor|1x2|match winner|winner/.test(mk) && !/handicap|duplo|intervalo|exato/.test(mk)) {
    if (/^(x|empate|draw)$/.test(sel)) return { needed: 'Empate no fim', check: (h, a) => h === a };
    if (sel === '1' || sameTeam(selection.replace(/\s+(vence|ganha)$/i, ''), home)) return { needed: `${home} ganhar`, check: (h, a) => h > a };
    if (sel === '2' || sameTeam(selection.replace(/\s+(vence|ganha)$/i, ''), away)) return { needed: `${away} ganhar`, check: (h, a) => a > h };
  }
  return null;
}

/**
 * Explanation of a selection on a match. `goals` must be in match order; `end` is the last minute
 * played (90 + added time when finished, the current minute when live).
 */
export function explainBet(
  market: string,
  selection: string,
  home: string,
  away: string,
  goals: GoalEvent[],
  final: { home: number; away: number } | null,
  end: number,
): BetExplanation {
  const it = interpret(market, selection, home, away);
  const happened = final ? `${home} ${final.home}–${final.away} ${away}` : 'Ainda sem resultado';
  if (!it) return { needed: `${selection} (${market})`, happened, segments: null, moments: [] };

  const segments: TimelineSegment[] = [];
  const moments: DecisiveMoment[] = [];
  let h = 0, a = 0, from = 0;
  let state = it.check(0, 0);
  for (const g of [...goals].sort((x, y) => x.minute - y.minute)) {
    if (g.side === 'home') h++; else a++;
    const next = it.check(h, a);
    if (next !== state) {
      if (g.minute > from) segments.push({ from, to: g.minute, winning: state });
      moments.push({ minute: g.minute, label: g.label, winningAfter: next, score: `${h}–${a}` });
      from = g.minute;
      state = next;
    }
  }
  segments.push({ from, to: Math.max(end, from + 1), winning: state });
  return { needed: it.needed, happened, segments, moments };
}
