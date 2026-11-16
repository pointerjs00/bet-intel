// Pure core of the read-only audit of settled items whose market the old parseBet misread
// (half-restricted, corner/card results, minute ranges, team totals, quarter lines, margins,
// combos reduced to one leg, "<equipa> marca" read as a scorer…).
// No I/O: the script in scripts/auditMisparsedSettlements.ts loads the data and prints the table.

import { parseBet, resolveMarket, type FixtureResult, type Resolution } from './marketResolutionEngine';

export interface AuditItem {
  market: string;
  selection: string;
  /** Result stored today (WON / LOST / VOID). */
  result: string;
  homeTeam: string;
  awayTeam: string;
}

/** Final data stored for the match (Fixture + FixtureStats). */
export interface AuditFixture {
  homeTeam: string;
  awayTeam: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
}

export type AuditOutcome =
  | { kind: 'SAME' }
  | { kind: 'CHANGED'; now: Resolution }
  | { kind: 'REVIEW'; reason: string };

function plain(s: string): string {
  return s.toLowerCase().replace(/ª/g, 'a').replace(/º/g, 'o').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Labels the old parser read as a full-match leg although the market restricts it.
const SUSPECT = new RegExp([
  String.raw`\b[12]\.?\s?[ao] (parte|tempo)\b`, 'primeira parte', 'segunda parte', 'primeiro tempo', 'segundo tempo',
  String.raw`\bintervalo\b(?!\s*/|\s+e (no )?final)`, String.raw`\bminutos?\b`, 'resto do jogo',
  String.raw`(cantos?|cart(ao|oes)).*(resultado|1x2)`, String.raw`(resultado|1x2).*(cantos?|cart(ao|oes))`,
  String.raw`\bequipa\b`, String.raw`golos (da|do) `, String.raw`\S - total`, 'asiatic', String.raw`empate \(`,
  'vantagem', 'margem', 'diferenca', 'vence por', 'sem sofrer', String.raw`\bpartes\b`, String.raw`\d\.(25|75)\b`,
].join('|'));
// Selection-only patterns: draw leg of a 3-way handicap ("X (Leixões -1)"), a margin ("Leixões por 2"),
// a result and BTTS joined by a slash ("Leixões / Sim").
const SUSPECT_SELECTION = /^x \(|\bpor \d|\/ (sim|nao)$/;
// A "Sim"/"Não" answer to a market naming a combination or a team scoring ("Leixões vence e ambas
// marcam", "As duas equipas marcam/Total de golos", "Leixões marca"): read before as BTTS alone or
// as a scorer named "sim".
const COMBO_MARKET = /\s(e|\+)\s|&|\/|\bmarca\b/;

/** True when the item's market/selection matches one of the patterns the old parser misread. */
export function isSuspect(market: string, selection: string): boolean {
  const m = plain(market);
  const s = plain(selection).replace(/,/g, '.');
  if (/^(sim|nao|yes|no)$/.test(s) && COMBO_MARKET.test(m.replace(/intervalo\/final|ht\/ft/g, ' '))) return true;
  return SUSPECT.test(m) || SUSPECT.test(s) || SUSPECT_SELECTION.test(s);
}

/**
 * Re-evaluates one settled item with the current parser and the stored match data.
 * SAME = the stored result stands; CHANGED = the engine now settles it differently;
 * REVIEW = it would now go to review (market not supported as named, or data not stored).
 */
export function reauditItem(item: AuditItem, fixture: AuditFixture | null): AuditOutcome {
  const ctx = {
    homeNames: [item.homeTeam, ...(fixture ? [fixture.homeTeam] : [])],
    awayNames: [item.awayTeam, ...(fixture ? [fixture.awayTeam] : [])],
  };
  if (!parseBet(item.market, item.selection, ctx)) return { kind: 'REVIEW', reason: 'agora vai para revisão (mercado não suportado como está escrito)' };
  if (!fixture) return { kind: 'REVIEW', reason: 'sem resultado do jogo guardado: confirmar à mão' };
  const cancelled = fixture.status === 'CANCELLED';
  if (!cancelled && (fixture.status !== 'FINISHED' || fixture.homeScore === null || fixture.awayScore === null)) {
    return { kind: 'REVIEW', reason: 'sem resultado final guardado: confirmar à mão' };
  }
  const result: FixtureResult = {
    homeScore: fixture.homeScore ?? 0,
    awayScore: fixture.awayScore ?? 0,
    htHomeScore: fixture.htHomeScore,
    htAwayScore: fixture.htAwayScore,
    statusShort: cancelled ? 'CANC' : 'FT',
    homeCorners: fixture.homeCorners ?? null,
    awayCorners: fixture.awayCorners ?? null,
  };
  const now = resolveMarket(item.market, item.selection, result, ctx);
  if (now === null) return { kind: 'REVIEW', reason: 'agora vai para revisão (faltam dados guardados, ex.: intervalo, cantos ou cartões)' };
  return now === item.result ? { kind: 'SAME' } : { kind: 'CHANGED', now };
}
