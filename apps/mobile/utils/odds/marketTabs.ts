import type { ComparedSelection, OddsSport } from './types';

export type MarketTab = 'top' | 'resultado' | 'golos' | 'btts' | 'handicap' | 'marcadores' | 'exato' | 'outros';

export const MARKET_TAB_LABEL: Record<MarketTab, string> = {
  top: 'Top',
  resultado: 'Resultado',
  golos: 'Golos',
  btts: 'Ambas marcam',
  handicap: 'Handicap',
  marcadores: 'Marcadores',
  exato: 'Resultado exato',
  outros: 'Outros',
};

const TAB_ORDER: MarketTab[] = ['top', 'resultado', 'golos', 'btts', 'handicap', 'marcadores', 'exato', 'outros'];

/** Tab label, with the goals tab renamed per sport. */
export function tabLabel(tab: MarketTab, sport: OddsSport): string {
  if (tab === 'golos') return sport === 'BASKETBALL' ? 'Pontos' : sport === 'TENNIS' ? 'Jogos' : MARKET_TAB_LABEL.golos;
  return MARKET_TAB_LABEL[tab];
}

/** Maps a canonical key to its market tab; unknown or null keys go to `outros`. */
export function tabOf(key: string | null): Exclude<MarketTab, 'top'> {
  if (!key) return 'outros';
  const k = key.replace(/^[QH]\d:/, '');
  if (k.startsWith('HTFT.')) return 'resultado';
  if (k.startsWith('SCORER.')) return 'marcadores';
  const type = k.split('.')[1];
  switch (type) {
    case '1X2': case 'DC': case 'DNB': case 'ML': case 'WIN': return 'resultado';
    case 'TOTAL': case 'TEAMTOTAL': case 'GAMES': case 'SETSTOTAL': return 'golos';
    case 'BTTS': return 'btts';
    case 'HCP': return 'handicap';
    case 'FIRSTGOAL': return 'marcadores';
    case 'SCORE': case 'SETS': return 'exato';
    default: return 'outros';
  }
}

/** Whether a row belongs in the "Top" tab (main full-time markets only). */
export function isTop(row: ComparedSelection, sport: OddsSport): boolean {
  const k = row.key;
  if (!k) return false;
  if (sport === 'FOOTBALL') {
    if (!k.startsWith('FT.')) return false;
    const type = k.split('.')[1];
    if (type === '1X2' || type === 'DC' || type === 'BTTS') return true;
    return /^FT\.TOTAL\.GOALS\.[OU]\.2\.5$/.test(k);
  }
  if (/^[QH]\d:/.test(k)) return false;
  if (sport === 'BASKETBALL') return /^B\.(ML|1X2)\./.test(k);
  return k.startsWith('T.WIN.');
}

export interface MarketCard {
  title: string;
  rows: ComparedSelection[];
}

function cardsOf(rows: ComparedSelection[]): MarketCard[] {
  const cards: MarketCard[] = [];
  const byTitle = new Map<string, MarketCard>();
  for (const row of rows) {
    let card = byTitle.get(row.market);
    if (!card) {
      card = { title: row.market, rows: [] };
      byTitle.set(row.market, card);
      cards.push(card);
    }
    card.rows.push(row);
  }
  return cards;
}

/** Groups rows into market tabs (only non-empty ones, enum order) with cards by market. */
export function groupByTab(rows: ComparedSelection[], sport: OddsSport): Array<{ tab: MarketTab; cards: MarketCard[] }> {
  const buckets = new Map<MarketTab, ComparedSelection[]>();
  const add = (tab: MarketTab, row: ComparedSelection) => {
    const list = buckets.get(tab);
    if (list) list.push(row); else buckets.set(tab, [row]);
  };
  for (const row of rows) {
    if (isTop(row, sport)) add('top', row);
    add(tabOf(row.key), row);
  }
  return TAB_ORDER.filter((t) => buckets.has(t)).map((tab) => ({ tab, cards: cardsOf(buckets.get(tab)!) }));
}
