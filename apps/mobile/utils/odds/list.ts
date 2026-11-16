import type { ComparedSelection, OddsEventListItem } from './types';

/** Distinct competitions ordered by number of games (desc), ties alphabetical. */
export function competitionsByCount(items: Array<Pick<OddsEventListItem, 'event'>>): string[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.event.competition, (counts.get(it.event.competition) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** Button order and caption of a main-market row: football H, D, A; sides use participant names. */
export function mainCaption(item: Pick<OddsEventListItem, 'event'>, row: ComparedSelection): string {
  switch (row.key) {
    case 'FT.1X2.H': case 'B.ML.H': case 'T.WIN.A': return item.event.home;
    case 'FT.1X2.A': case 'B.ML.A': case 'T.WIN.B': return item.event.away;
    case 'FT.1X2.D': return 'Empate';
    default: return row.label;
  }
}

const ORDER = ['FT.1X2.H', 'FT.1X2.D', 'FT.1X2.A', 'T.WIN.A', 'T.WIN.B', 'B.ML.H', 'B.ML.A'];

/** Main rows sorted into display order; unknown keys keep their relative order at the end. */
export function orderMain(rows: ComparedSelection[]): ComparedSelection[] {
  const rank = (r: ComparedSelection) => { const i = r.key ? ORDER.indexOf(r.key) : -1; return i < 0 ? ORDER.length : i; };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}

const timeFmt = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });

/** HH:MM in Europe/Lisbon. */
export function lisbonTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
