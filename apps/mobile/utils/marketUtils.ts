/**
 * Utility helpers for market names used across boletin creation and editing.
 */

/**
 * Returns true if the market name fully encodes the outcome, so no separate
 * "Seleção" input is needed (e.g. "Casa Ganha + Mais de 1.5 Golos").
 */
export function isSelfDescribing(market: string): boolean {
  return (
    /Mais de \d+[.,]\d+/.test(market) ||
    /Menos de \d+[.,]\d+/.test(market) ||
    /Casa Ganha/.test(market) ||
    /Fora Ganha/.test(market) ||
    /Casa vence/.test(market) ||
    /Fora vence/.test(market) ||
    /Casa Handicap/.test(market) ||
    /Fora Handicap/.test(market) ||
    /\bEmpate\b/.test(market) ||
    / ou /.test(market) ||
    /^EAA:/.test(market) ||
    /^HT\/FT:/.test(market) ||
    /Cantos - Mais de \d/.test(market) ||
    /Cartões - Mais de \d/.test(market)
  );
}

/**
 * Converts a technical market name into a human-readable selection string by
 * substituting generic placeholders with the actual teams chosen.
 */
export function humanizeMarket(market: string, homeTeam: string, awayTeam: string): string {
  const home = homeTeam || 'Casa';
  const away = awayTeam || 'Fora';
  return market
    .replace(/Casa Ganha \+ Mais de (\d+[.,]\d+) Golos/g, `${home} vence & +$1 Golos`)
    .replace(/Casa Ganha \+ Menos de (\d+[.,]\d+) Golos/g, `${home} vence & -$1 Golos`)
    .replace(/Fora Ganha \+ Mais de (\d+[.,]\d+) Golos/g, `${away} vence & +$1 Golos`)
    .replace(/Fora Ganha \+ Menos de (\d+[.,]\d+) Golos/g, `${away} vence & -$1 Golos`)
    .replace(/Casa Ganha/g, `${home} vence`)
    .replace(/Fora Ganha/g, `${away} vence`)
    .replace(/Total de Golos - Mais de (\d+[.,]\d+)/g, '+$1 Golos')
    .replace(/Total de Golos - Menos de (\d+[.,]\d+)/g, '-$1 Golos')
    .replace(/Golos Casa - Mais de (\d+[.,]\d+)/g, `${home}: +$1 Golos`)
    .replace(/Golos Casa - Menos de (\d+[.,]\d+)/g, `${home}: -$1 Golos`)
    .replace(/Golos Fora - Mais de (\d+[.,]\d+)/g, `${away}: +$1 Golos`)
    .replace(/Golos Fora - Menos de (\d+[.,]\d+)/g, `${away}: -$1 Golos`)
    .replace(/Ambas Marcam \+ Total de Golos Mais de (\d+[.,]\d+)/g, 'BTTS & +$1 Golos')
    .replace(/Ambas Marcam \+ Total de Golos Menos de (\d+[.,]\d+)/g, 'BTTS & -$1 Golos')
    .replace(/Pontos Casa - Mais de (\d+[.,]\d+)/g, `${home}: +$1 Pts`)
    .replace(/Pontos Casa - Menos de (\d+[.,]\d+)/g, `${home}: -$1 Pts`)
    .replace(/Pontos Fora - Mais de (\d+[.,]\d+)/g, `${away}: +$1 Pts`)
    .replace(/Pontos Fora - Menos de (\d+[.,]\d+)/g, `${away}: -$1 Pts`)
    .replace(/Total de Pontos - Mais de (\d+[.,]\d+)/g, '+$1 Pts')
    .replace(/Total de Pontos - Menos de (\d+[.,]\d+)/g, '-$1 Pts')
    .replace(/Cantos - Mais de (\d+[.,]\d+)/g, 'Cantos: +$1')
    .replace(/Cartões - Mais de (\d+[.,]\d+)/g, 'Cartões: +$1')
    // HT/FT: substitute Casa → home and Fora → away within the outcome codes
    .replace(/HT\/FT: (\w+)\/(\w+)/g, (_, ht, ft) => {
      const htLabel = ht === 'Casa' ? home : ht === 'Fora' ? away : ht;
      const ftLabel = ft === 'Casa' ? home : ft === 'Fora' ? away : ft;
      return `HT/FT: ${htLabel}/${ftLabel}`;
    })
    .replace(/\bCasa\b/g, home)
    .replace(/\bFora\b/g, away);
}

/** Popularity-ordered market category display order. */
export const MARKET_CATEGORY_ORDER = [
  'Principal', 'Golos', 'Handicap', '1ª Parte', '2ª Parte',
  'Resultado', 'Combinado', 'Especiais', 'Pontos', 'Sets',
  'Games', 'Quartos', 'Corridas', '1ª Volta', '1º Período', 'Total', 'Outro',
];
