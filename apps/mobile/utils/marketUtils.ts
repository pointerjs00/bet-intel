/**
 * Utility helpers for market names — aligned with Portuguese bookmaker formats
 * (Betclic PT, bet365 PT, etc.) as observed in real user bet data.
 */

/**
 * Markets where the market name itself fully encodes the outcome — no separate
 * "Seleção" input is needed. The market is the selection.
 *
 * These are either already humanised (team name substituted in) or are
 * self-contained outcome statements.
 */
export function isSelfDescribing(market: string): boolean {
  if (!market) return false;
  return (
    // Already contains a team/player name + result verb
    /\bvence\b/.test(market) ||
    /\bempata\b/.test(market) ||
    // Bookmaker-style combo markets that already name the outcome
    /^BTTS/.test(market) ||
    /Ambas Marcam \(BTTS\)/.test(market) ||
    // Dupla with named teams
    /^Dupla:/.test(market) ||
    // EAA / Draw No Bet shorthand
    /^EAA:/.test(market) ||
    // HT/FT codes with team names
    /^HT\/FT:/.test(market) ||
    // Over/Under already resolved to "+X" or "-X" style
    /^[+-]\d/.test(market) ||
    /: [+-]\d/.test(market) ||
    // Corners / cards with threshold
    /Cantos: [+-]/.test(market) ||
    /Cartões: [+-]/.test(market)
  );
}

/**
 * Converts a generic template market name into a human-readable form by
 * substituting "Casa" / "Fora" placeholders with actual team names.
 *
 * This matches the format users expect from PT bookmakers.
 */
export function humanizeMarket(market: string, homeTeam: string, awayTeam: string): string {
  const home = homeTeam || 'Casa';
  const away = awayTeam || 'Fora';

  return market
    // ── Self-describing combo markets ──────────────────────────────────────
    .replace(/Casa vence & \+(\d+[.,]\d+) Golos/g, `${home} vence & +$1 Golos`)
    .replace(/Casa vence & -(\d+[.,]\d+) Golos/g, `${home} vence & -$1 Golos`)
    .replace(/Fora vence & \+(\d+[.,]\d+) Golos/g, `${away} vence & +$1 Golos`)
    .replace(/Fora vence & -(\d+[.,]\d+) Golos/g, `${away} vence & -$1 Golos`)
    .replace(/Casa vence ou empata & \+(\d+[.,]\d+) Golos/g, `${home} vence ou empata & +$1 Golos`)
    .replace(/Casa vence ou empata & -(\d+[.,]\d+) Golos/g, `${home} vence ou empata & -$1 Golos`)
    .replace(/Fora vence ou empata & \+(\d+[.,]\d+) Golos/g, `${away} vence ou empata & +$1 Golos`)
    .replace(/Fora vence ou empata & -(\d+[.,]\d+) Golos/g, `${away} vence ou empata & -$1 Golos`)
    // ── Simple win / draw markets ───────────────────────────────────────────
    .replace(/\bCasa vence ou empata\b/g, `${home} vence ou empata`)
    .replace(/\bFora vence ou empata\b/g, `${away} vence ou empata`)
    .replace(/\bCasa vence\b/g, `${home} vence`)
    .replace(/\bFora vence\b/g, `${away} vence`)
    // ── Dupla (Double Chance) with placeholders ─────────────────────────────
    .replace(/Dupla: Casa ou Empate & \+(\d+[.,]\d+) Golos/g, `Dupla: ${home} ou Empate & +$1 Golos`)
    .replace(/Dupla: Casa ou Fora & \+(\d+[.,]\d+) Golos/g, `Dupla: ${home} ou ${away} & +$1 Golos`)
    .replace(/Dupla: Empate ou Fora & \+(\d+[.,]\d+) Golos/g, `Dupla: Empate ou ${away} & +$1 Golos`)
    .replace(/Dupla: Casa ou Empate\b/g, `Dupla: ${home} ou Empate`)
    .replace(/Dupla: Casa ou Fora\b/g, `Dupla: ${home} ou ${away}`)
    .replace(/Dupla: Empate ou Fora\b/g, `Dupla: Empate ou ${away}`)
    // ── BTTS combos ────────────────────────────────────────────────────────
    .replace(/Ambas Marcam \+ Total de Golos Mais de (\d+[.,]\d+)/g, `BTTS & +$1 Golos`)
    .replace(/Ambas Marcam \+ Total de Golos Menos de (\d+[.,]\d+)/g, `BTTS & -$1 Golos`)
    // ── HT/FT substitution ─────────────────────────────────────────────────
    .replace(/HT\/FT: (\w+)\/(\w+)/g, (_, ht, ft) => {
      const htLabel = ht === 'Casa' ? home : ht === 'Fora' ? away : ht;
      const ftLabel = ft === 'Casa' ? home : ft === 'Fora' ? away : ft;
      return `HT/FT: ${htLabel}/${ftLabel}`;
    })
    // ── Remaining bare placeholders ────────────────────────────────────────
    .replace(/\bCasa\b/g, home)
    .replace(/\bFora\b/g, away);
}

/** Popularity-ordered market category display order. */
export const MARKET_CATEGORY_ORDER = [
  'Principal', 'Golos', 'Combinado', 'Handicap', 'Resultado',
  '1ª Parte', '2ª Parte', 'Especiais', 'Pontos', 'Sets',
  'Games', 'Quartos', 'Total', 'Outro',
];