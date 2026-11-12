// Splits a football selection into the conditions it needs and checks each one against the score,
// so the match screen can say which part failed ("Mais de 1,5 golos ✕ só 1 golo"). Pure (tests).

import { sameTeam } from './teamNames';

export interface BetCondition {
  label: string;
  /** true = met, false = failed, null = can't tell (still playing / unknown). */
  ok: boolean | null;
  detail: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (s: string) => Number(s.replace(',', '.'));

function resultPart(raw: string, home: string, away: string, h: number, a: number): BetCondition | null {
  const t = raw.trim();
  const n = norm(t);
  const side = (name: string): 'H' | 'A' | null => (sameTeam(name, home) ? 'H' : sameTeam(name, away) ? 'A' : null);
  const score = `${h}–${a}`;
  // "X / Empate", "X ou Empate", "Empate / X" (double chance)
  const dc = n.match(/^(.+?)\s*(?:\/|ou)\s*empate$/) ?? n.match(/^empate\s*(?:\/|ou)\s*(.+)$/);
  if (dc) {
    const s = side(t.replace(/\s*(\/|ou)\s*empate\s*$/i, '').replace(/^empate\s*(\/|ou)\s*/i, ''));
    if (!s) return null;
    const ok = s === 'H' ? h >= a : a >= h;
    return { label: `${s === 'H' ? home : away} ou empate`, ok, detail: score };
  }
  const vem = t.match(/^(.+?)\s+vence\s+ou\s+empata$/i);
  if (vem) {
    const s = side(vem[1]!);
    if (!s) return null;
    return { label: `${s === 'H' ? home : away} vence ou empata`, ok: s === 'H' ? h >= a : a >= h, detail: score };
  }
  const v = t.match(/^(.+?)\s+(?:vence|ganha)$/i);
  if (v) {
    const s = side(v[1]!);
    if (!s) return null;
    return { label: `${s === 'H' ? home : away} vence`, ok: s === 'H' ? h > a : a > h, detail: score };
  }
  if (n === 'empate' || n === 'x') return { label: 'Empate', ok: h === a, detail: score };
  return null;
}

function goalsPart(raw: string, h: number, a: number): BetCondition | null {
  const m = norm(raw).match(/^(acima|mais|abaixo|menos)\s+de\s+(\d+(?:[.,]\d+)?)(?:\s+golos?)?$/);
  if (!m) return null;
  const line = num(m[2]!);
  const over = m[1] === 'acima' || m[1] === 'mais';
  const total = h + a;
  const label = `${over ? 'Mais' : 'Menos'} de ${String(line).replace('.', ',')} golos`;
  return { label, ok: over ? total > line : total < line, detail: total === 1 ? 'só 1 golo' : `${total} golos` };
}

function bttsPart(raw: string, h: number, a: number): BetCondition | null {
  const n = norm(raw);
  const m = n.match(/^ambas(?:\s+as\s+equipas)?\s+marcam(?:\s*[:-]?\s*(sim|nao))?$/);
  if (!m) return null;
  const yes = m[1] !== 'nao';
  const both = h > 0 && a > 0;
  return { label: `Ambas marcam: ${yes ? 'sim' : 'não'}`, ok: yes ? both : !both, detail: both ? 'as duas marcaram' : 'não marcaram as duas' };
}

/**
 * Conditions of a selection, checked against the score. Empty when the selection isn't a
 * recognised combination (the screen then shows the plain "Precisavas / Aconteceu").
 * `finished` false → conditions not yet decided show ok = null.
 */
export function betConditions(selection: string, home: string, away: string, score: { home: number; away: number } | null, finished: boolean): BetCondition[] {
  if (!score) return [];
  const parts = selection.split(/\s+(?:e|&)\s+|\s*&\s*/i).map((p) => p.trim()).filter(Boolean);
  const out: BetCondition[] = [];
  for (const p of parts) {
    const c = resultPart(p, home, away, score.home, score.away) ?? goalsPart(p, score.home, score.away) ?? bttsPart(p, score.home, score.away);
    if (!c) return [];
    out.push(finished ? c : { ...c, ok: null });
  }
  return out;
}
