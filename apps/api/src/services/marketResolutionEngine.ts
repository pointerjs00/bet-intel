// apps/api/src/services/marketResolutionEngine.ts
//
// Resolves a BoletinItem market/selection against a finished fixture result.
// Returns WON / LOST / VOID, or null when the market is unrecognised (needs manual review).

export type Resolution = 'WON' | 'LOST' | 'VOID';

interface FixtureResult {
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  statusShort: string; // "FT" | "AET" | "PEN" | "CANC" | "PST" | "ABD" etc.
}

export function resolveMarket(
  market: string,
  selection: string,
  fixture: FixtureResult,
): Resolution | null {
  const { statusShort, homeScore: gh, awayScore: ga, htHomeScore, htAwayScore } = fixture;
  const total = gh + ga;
  const m = market.toLowerCase().trim();
  const sel = selection.trim();

  // Cancelled / postponed / abandoned → always VOID
  if (['canc', 'pst', 'abd', 'wo', 'awd'].includes(statusShort.toLowerCase())) {
    return 'VOID';
  }

  // Only settle if match has a final result
  const settled = ['ft', 'aet', 'pen'].includes(statusShort.toLowerCase());
  if (!settled) return null;

  // ─── 1X2 / Resultado Final ────────────────────────────────────────────────
  if (m.includes('resultado final') || m.includes('1x2') || m === 'resultado') {
    if (sel === '1') return gh > ga ? 'WON' : 'LOST';
    if (sel === 'X' || sel === 'x') return gh === ga ? 'WON' : 'LOST';
    if (sel === '2') return ga > gh ? 'WON' : 'LOST';
  }

  // ─── Double Chance / Dupla Chance ─────────────────────────────────────────
  if (m.includes('dupla chance') || m.includes('double chance')) {
    if (sel === '1X' || sel === 'X1') return gh >= ga ? 'WON' : 'LOST';
    if (sel === '12') return gh !== ga ? 'WON' : 'LOST';
    if (sel === 'X2' || sel === '2X') return ga >= gh ? 'WON' : 'LOST';
  }

  // ─── Over/Under Goals (full time) ─────────────────────────────────────────
  // Matches: "Mais de 2.5", "Over 2.5", "Golos - Mais de 2.5", "Golos Mais de 1.5"
  const ouFtMatch =
    !m.includes('intervalo') &&
    (m.match(/mais\s+de\s+(\d+[.,]\d)/i) ??
     m.match(/over\s+(\d+[.,]\d)/i) ??
     m.match(/menos\s+de\s+(\d+[.,]\d)/i) ??
     m.match(/under\s+(\d+[.,]\d)/i));

  if (ouFtMatch) {
    const line = parseFloat(ouFtMatch[1].replace(',', '.'));
    const isOver =
      m.includes('mais de') || m.includes('over') ||
      sel.toLowerCase().includes('mais') || sel.toLowerCase().includes('over') ||
      sel.toLowerCase().startsWith('acima');
    const isUnder = m.includes('menos de') || m.includes('under');

    if (isOver || isUnder) {
      const clears = total > line;
      return clears ? (isOver ? 'WON' : 'LOST') : (isOver ? 'LOST' : 'WON');
    }
  }

  // ─── Over/Under HT Goals ─────────────────────────────────────────────────
  if (m.includes('intervalo') && (m.includes('mais de') || m.includes('over') || m.includes('menos de') || m.includes('under'))) {
    const htMatch =
      m.match(/mais\s+de\s+(\d+[.,]\d)/i) ??
      m.match(/over\s+(\d+[.,]\d)/i) ??
      m.match(/menos\s+de\s+(\d+[.,]\d)/i) ??
      m.match(/under\s+(\d+[.,]\d)/i);

    if (htMatch && htHomeScore !== null && htAwayScore !== null) {
      const line = parseFloat(htMatch[1].replace(',', '.'));
      const htTotal = htHomeScore + htAwayScore;
      const isOver = m.includes('mais de') || m.includes('over');
      const clears = htTotal > line;
      return clears ? (isOver ? 'WON' : 'LOST') : (isOver ? 'LOST' : 'WON');
    }
  }

  // ─── BTTS / Ambas as Equipas Marcam ──────────────────────────────────────
  if (
    m.includes('ambas') ||
    m.includes('btts') ||
    m.includes('ambas as equipas marcam') ||
    m.includes('ambas marcam')
  ) {
    const btts = gh > 0 && ga > 0;
    const wantsBtts =
      sel.toLowerCase() === 'sim' ||
      sel.toLowerCase() === 'yes' ||
      sel.toLowerCase() === 's';
    return btts === wantsBtts ? 'WON' : 'LOST';
  }

  // ─── HT Result (Resultado ao Intervalo) ──────────────────────────────────
  if (m.includes('intervalo') && (m.includes('resultado') || m === 'resultado ao intervalo')) {
    if (htHomeScore === null || htAwayScore === null) return null;
    if (sel === '1') return htHomeScore > htAwayScore ? 'WON' : 'LOST';
    if (sel === 'X' || sel === 'x') return htHomeScore === htAwayScore ? 'WON' : 'LOST';
    if (sel === '2') return htAwayScore > htHomeScore ? 'WON' : 'LOST';
  }

  // ─── Clean Sheet ─────────────────────────────────────────────────────────
  if (m.includes('baliza a zero') || m.includes('clean sheet')) {
    const teamIsHome = sel.toLowerCase().includes('casa') || sel.toLowerCase().includes('home');
    const teamIsAway = sel.toLowerCase().includes('fora') || sel.toLowerCase().includes('away');
    if (teamIsHome) return ga === 0 ? 'WON' : 'LOST';
    if (teamIsAway) return gh === 0 ? 'WON' : 'LOST';
  }

  // ─── Correct Score ───────────────────────────────────────────────────────
  if (m.includes('resultado correto') || m.includes('correct score') || m.includes('marcador correto')) {
    // Selection format: "2-1" or "2:1"
    const scoreMatch = sel.match(/^(\d+)[:\-](\d+)$/);
    if (scoreMatch) {
      return gh === parseInt(scoreMatch[1]) && ga === parseInt(scoreMatch[2]) ? 'WON' : 'LOST';
    }
  }

  return null; // unrecognised market → needs review
}
