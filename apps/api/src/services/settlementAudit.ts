// Pure core of the read-only audit of settled items whose market the old parseBet misread
// (half-restricted, corner/card results, minute ranges, team totals, quarter lines, margins…).
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

/** True when the item's market/selection matches one of the patterns the old parser misread. */
export function isSuspect(market: string, selection: string): boolean {
  return SUSPECT.test(plain(market)) || SUSPECT.test(plain(selection).replace(/,/g, '.'));
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
