/* eslint-disable @typescript-eslint/no-explicit-any -- Retabet calendar JSON (minified field names) is untyped external data; `any` is confined to this boundary. */
/**
 * Pure mapping of Retabet data to `SourceEvent` / `SourceMarket`.
 *
 * Calendar events (JSON of the `SportsbookDateIndex` widget and of `LoadPending`) use minified fields: `i` id,
 * `d` "Home - Away", `p[]` participants `{n, h}`, `du` UTC start, `di` sport id, `scd`/`sdd` country / competition
 * (the competition text starts with the country), `nb` number of market lines, `il` live, `b[]` the markets of the
 * calendar `{md, o:[[{t, p:"2,18", l, v}]]}`. There is no BetRadar id anywhere (study), so none is invented.
 *
 * Markets of a game come from the HTML readers (`html.ts`). They are translated by their (PT) name into the labels
 * `canonicalKey` reads; line markets use the numbers of the labels ("+ de 2,5", "Newcastle (+0,5)"), half lines only.
 * A market that is not translated keeps the house's own text and shows only for this house; if that raw text would
 * nevertheless get a canonical key it is dropped: a wrong key is worse than none. An option whose team name is not
 * one of the two participants is dropped, never guessed.
 */
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceEvent, SourceMarket } from '../../types';
import { ProviderFormatError } from '../../../sportsData/providerHealth';
import type { PageMarket, PageOption, PageRow, RawEvent } from './html';

/** Retabet discipline ids (`di`). */
export const SPORT_DI: Record<OddsSport, number> = { FOOTBALL: 1, BASKETBALL: 5, TENNIS: 8 };

/** Country name as the calendar spells it (`scd`, PT-PT) → ISO code used by the app. Unknown names give no country. */
const COUNTRY: Record<string, string> = {
  Alemanha: 'DE', Argentina: 'AR', Austrália: 'AU', Áustria: 'AT', Bélgica: 'BE', Bolívia: 'BO', 'Bósnia e Herzegovina': 'BA', Brasil: 'BR', Bulgária: 'BG',
  Canadá: 'CA', Catar: 'QA', Chile: 'CL', China: 'CN', Chipre: 'CY', Colômbia: 'CO', 'Coreia do Sul': 'KR', 'Costa Rica': 'CR', Croácia: 'HR',
  Dinamarca: 'DK', Equador: 'EC', Eslováquia: 'SK', Eslovénia: 'SI', Espanha: 'ES', 'Estados Unidos': 'US', Finlândia: 'FI', França: 'FR', Geórgia: 'GE',
  Grécia: 'GR', Holanda: 'NL', Hungria: 'HU', Índia: 'IN', Inglaterra: 'GB-ENG', Irlanda: 'IE', 'Irlanda do Norte': 'GB-NIR', Israel: 'IL', Itália: 'IT',
  Japão: 'JP', Lituânia: 'LT', Luxemburgo: 'LU', México: 'MX', Montenegro: 'ME', Noruega: 'NO', 'Países Baixos': 'NL', Paraguai: 'PY', Peru: 'PE',
  Polónia: 'PL', Portugal: 'PT', Roménia: 'RO', Rússia: 'RU', Escócia: 'GB-SCT', Sérvia: 'RS', Suécia: 'SE', Suíça: 'CH', Turquia: 'TR', Ucrânia: 'UA',
  Uruguai: 'UY', Venezuela: 'VE',
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fmt = (n: number) => String(n === 0 ? 0 : n);
const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const isHalfLine = (n: number) => Math.abs(n % 1) === 0.5;
const num = (s: string) => Number(s.replace(',', '.'));

// ─── Calendar ────────────────────────────────────────────────────────────────

const SPORT_SLUG: Record<OddsSport, string> = { FOOTBALL: 'futebol', BASKETBALL: 'basquetebol', TENNIS: 'tenis' };

/** The game page accepts any slug between the sport and the id (it redirects to the canonical one). */
export const eventUrl = (sport: OddsSport, id: string) => `https://www.retabet.pt/desportos/${SPORT_SLUG[sport]}/jogo/jogo/jogo/${id}`;

/** Home and away of a calendar event: the title "Home - Away", or the participant list when a hyphen makes it ambiguous. */
function namesOf(e: RawEvent, sport: OddsSport): { home: string; away: string } | null {
  const title = clean(e.d);
  const parts = title.split(' - ').map((s) => s.trim());
  let home = '';
  let away = '';
  if (parts.length === 2 && parts[0] && parts[1]) [home, away] = parts as [string, string];
  else if (Array.isArray(e.p)) {
    const h = e.p.find((x: any) => x?.h === true);
    const a = e.p.find((x: any) => x?.h === false);
    if (h && a && `${clean(h.n)} - ${clean(a.n)}` === title) [home, away] = [clean(h.n), clean(a.n)];
  }
  if (!home || !away || home === away) return null;
  if (sport === 'TENNIS' && (/\s\/\s/.test(home) || /\s\/\s/.test(away))) return null; // doubles are not compared
  return { home, away };
}

/** Lowercase, `1ªparte` → `1ª parte`, single spaces, a space after ":". */
function norm(name: string): string {
  return clean(name)
    .toLowerCase()
    .replace(/(\d)\s*ª\s*parte/g, '$1ª parte')
    .replace(/\s*:\s*/g, ': ');
}

/** Name of the main market (1X2 / winner / moneyline) in the calendar, by sport. */
const MAIN_NAME: Record<OddsSport, string> = { FOOTBALL: '1-x-2', BASKETBALL: 'vencedor do jogo', TENNIS: 'vencedor do encontro' };

/** The main market of a calendar event (its `b[]` entry named like the sport's winner market), mapped like page markets. */
function mainMarkets(e: RawEvent, sport: OddsSport, names: { home: string; away: string }): SourceMarket[] {
  const b = (Array.isArray(e.b) ? e.b : []).find((m: any) => norm(clean(m?.md)) === MAIN_NAME[sport]);
  if (!b || !Array.isArray(b.o)) return [];
  const rows: PageRow[] = b.o
    .filter((row: unknown) => Array.isArray(row))
    .map((row: any[]) => ({
      title: '',
      options: row.map((o): PageOption => ({
        id: String(o?.i ?? ''),
        label: clean(o?.t),
        odds: /^\d+(?:,\d+)?$/.test(clean(o?.p)) ? num(clean(o.p)) : null,
        suspended: o?.l === true || o?.v === false,
      })),
    }));
  return mapMarkets(sport, names, [{ mid: String(b.i ?? ''), tag: 0, name: clean(b.md), rows }]);
}

/** Calendar events of one sport (any start time: the caller filters the window). */
export function mapCalendarEvents(raw: RawEvent[], sport: OddsSport): SourceEvent[] {
  const out: SourceEvent[] = [];
  for (const e of raw) {
    const id = String(e?.i ?? '');
    const t = Date.parse(String(e?.du ?? ''));
    if (e?.di !== SPORT_DI[sport] || !/^\d+$/.test(id) || !Number.isFinite(t)) continue;
    const names = namesOf(e, sport);
    if (!names) continue;
    const country = clean(e.scd);
    let competition = clean(e.sdd);
    // "Inglaterra Premier League" → "Premier League" (tennis tours are not countries: keep "Challenger Metz").
    if (sport !== 'TENNIS' && country && competition.startsWith(`${country} `)) competition = competition.slice(country.length + 1).trim() || competition;
    const countryCode = sport === 'TENNIS' ? undefined : COUNTRY[country];
    const marketCount = Number(e.nb);
    const main = mainMarkets(e, sport, names);
    out.push({
      house: 'retabet',
      houseEventId: id,
      sport,
      competition,
      home: names.home,
      away: names.away,
      startsAt: new Date(t).toISOString(),
      live: e.il === true,
      pageUrl: eventUrl(sport, id),
      ...(Number.isFinite(marketCount) && marketCount > 0 ? { marketCount } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(main.length ? { mainMarkets: main } : {}),
    });
  }
  return out;
}

/** Paging cursor of `LoadPending`. */
export interface PendingCursor {
  lei: number;
  let: string;
}

/** Cursor that continues after `last`, the last event of the page just read (`/calendario` only). */
export function cursorOf(last: RawEvent): PendingCursor {
  return { lei: Number(last.i), let: String(last.du).replace(/(\.\d+)?Z$/, '') + '.0000000Z' };
}

/** Body of `POST /api/sportsbookCalendarEvents/LoadPending` for the central panel. */
export function pendingBody(c: PendingCursor) {
  return { wpa: 'CentralPanel', wpo: 1, lei: c.lei, let: c.let };
}

/** `LoadPending` answer → its events and the cursor of the next page (null at the end). */
export function parsePending(body: unknown): { events: RawEvent[]; next: PendingCursor | null } {
  if (typeof body !== 'object' || body === null || !('eg' in body)) throw new ProviderFormatError('Retabet LoadPending: unexpected answer (no "eg")');
  const b = body as { eg: unknown; lei?: unknown; let?: unknown; ier?: unknown };
  if (b.eg === null) return { events: [], next: null };
  const events = (b.eg as { e?: unknown } | undefined)?.e;
  if (!Array.isArray(events)) throw new ProviderFormatError('Retabet LoadPending: "eg" without an event list');
  const ok = events.length > 0 && b.ier !== true && Number.isInteger(b.lei) && (b.lei as number) > 0 && typeof b.let === 'string' && /^\d{4}-\d\d-\d\dT/.test(b.let);
  return { events: events as RawEvent[], next: ok ? { lei: b.lei as number, let: b.let as string } : null };
}

// ─── Market translators ──────────────────────────────────────────────────────

interface Names {
  home: string;
  away: string;
}
interface Pick {
  label: string;
  line?: number | null;
}
interface Translated {
  label: string;
  pick: (o: PageOption) => Pick | null;
}
type Builder = (m: RegExpMatchArray, names: Names) => Translated;

const sideOfName = (name: string, n: Names): 'H' | 'A' | null => (name === n.home ? 'H' : name === n.away ? 'A' : null);
const nameOfSide = (side: 'H' | 'A', n: Names) => (side === 'H' ? n.home : n.away);

/** Options "1"/"X"/"2" (or the other forms listed in `from`) → the label canonicalKey reads. */
const exact = (label: string, allowed: RegExp): Translated => ({ label, pick: (o) => (allowed.test(o.label) ? { label: o.label } : null) });

/** Home / draw / away by name or number → "1" / "X" / "2". */
const result3 = (label: string, n: Names): Translated => ({
  label,
  pick: (o) => {
    if (/^[1X2]$/.test(o.label)) return { label: o.label };
    if (/^empate$/i.test(o.label)) return { label: 'X' };
    const side = sideOfName(o.label, n);
    return side ? { label: side === 'H' ? '1' : '2' } : null;
  },
});

/** Two-way winner (and draw-no-bet): options are the participants' names, or "1"/"2". */
const winnerNames = (label: string, n: Names): Translated => ({
  label,
  pick: (o) => {
    const side = o.label === '1' ? 'H' : o.label === '2' ? 'A' : sideOfName(o.label, n);
    return side ? { label: nameOfSide(side, n) } : null;
  },
});

/** "+ de 2,5" / "- de 2,5", half lines only. */
function overUnder(o: PageOption): Pick | null {
  const m = o.label.match(/^([+-])\s*de\s+(\d+(?:,\d+)?)$/);
  if (!m) return null;
  const line = num(m[2]!);
  return isHalfLine(line) ? { label: `${m[1] === '+' ? 'Mais' : 'Menos'} de ${fmt(line)}`, line } : null;
}
const totals = (label: string): Translated => ({ label, pick: overUnder });

/** "Newcastle (+0,5)" → "Newcastle +0.5", half lines only, the name must be a participant. */
const handicap = (label: string, n: Names): Translated => ({
  label,
  pick: (o) => {
    const m = o.label.match(/^(.+?)\s*\(([+-]\d+(?:,\d+)?)\)$/);
    if (!m || !sideOfName(m[1]!.trim(), n)) return null;
    const line = num(m[2]!);
    return isHalfLine(line) ? { label: `${m[1]!.trim()} ${signed(line)}`, line } : null;
  },
});

const side2 = (s: string) => (s === 'local' ? 'H' : 'A');

const FOOTBALL: [RegExp, Builder][] = [
  [/^1-x-2$/, () => exact('Resultado Final', /^[1X2]$/)],
  [/^hipótese dupla$/, () => exact('Hipótese Dupla', /^(1X|X2|12)$/)],
  [/^marcam ambas as equipas$/, () => exact('Ambas as Equipas Marcam', /^(Sim|Não)$/)],
  [/^mais\/menos golos$/, () => totals('Total de Golos Mais/Menos')],
  [/^mais\/menos golos (local|visitante)$/, (m, n) => totals(`Total de Golos Mais/Menos - ${nameOfSide(side2(m[1]!), n)}`)],
  [/^empate anula aposta$/, (_m, n) => winnerNames('Empate Anula Aposta', n)],
  [/^handicap$/, (_m, n) => handicap('Handicap', n)],
  [/^1ª parte\/final$/, () => exact('Intervalo/Final', /^[1X2]\/[1X2]$/)],
  [/^([12])ª parte: 1-x-2$/, (m, n) => result3(`Resultado da ${m[1]}ª Parte`, n)],
  [/^([12])ª parte: mais\/menos golos$/, (m) => totals(`${m[1]}ª Parte - Total de Golos Mais/Menos`)],
  [/^([12])ª parte: hipótese dupla$/, (m) => exact(`${m[1]}ª Parte - Hipótese Dupla`, /^(1X|X2|12)$/)],
  [/^([12])ª parte: marcam ambas equipas$/, (m) => exact(`${m[1]}ª Parte - Ambas as Equipas Marcam`, /^(Sim|Não)$/)],
  [/^resultado exato$/, () => exact('Resultado Exato', /^\d+-\d+$/)],
];

const BASKETBALL: [RegExp, Builder][] = [
  [/^vencedor do jogo$/, (_m, n) => winnerNames('Vencedor (incl. prolongamento)', n)],
  [/^handicap$/, (_m, n) => handicap('Handicap', n)],
  [/^mais\/menos pontos$/, () => totals('Total de Pontos Mais/Menos')],
  [/^mais\/menos pontos (local|visitante)$/, (m, n) => totals(`Total de Pontos Mais/Menos - ${nameOfSide(side2(m[1]!), n)}`)],
  [/^([12])ª parte: mais\/menos pontos$/, (m) => totals(`${m[1]}ª Parte - Total de Pontos Mais/Menos`)],
  [/^([12])ª parte: handicap$/, (m, n) => handicap(`${m[1]}ª Parte - Handicap`, n)],
  [/^([1-4])º quarto: handicap$/, (m, n) => handicap(`${m[1]}º Quarto - Handicap`, n)],
  [/^([1-4])º quarto: mais\/menos pontos$/, (m) => totals(`${m[1]}º Quarto - Total de Pontos Mais/Menos`)],
];

const TENNIS: [RegExp, Builder][] = [
  [/^vencedor do encontro$/, (_m, n) => winnerNames('Vencedor', n)],
  [/^set ([1-5]): vencedor$/, (m, n) => winnerNames(`${m[1]}º Set - Vencedor`, n)],
  [/^mais\/menos jogos$/, () => totals('Total de Jogos Mais/Menos')],
  [/^handicap jogos$/, (_m, n) => handicap('Handicap de Jogos', n)],
  [/^resultado em sets$/, () => exact('Resultado Exato em Sets', /^\d-\d$/)],
  [/^mais\/menos sets no encontro$/, () => totals('Total de Sets Mais/Menos')],
];

const TABLES: Record<OddsSport, [RegExp, Builder][]> = { FOOTBALL, BASKETBALL, TENNIS };

function translatorFor(sport: OddsSport, effectiveName: string, names: Names): Translated | null {
  const name = norm(effectiveName);
  for (const [re, build] of TABLES[sport]) {
    const m = name.match(re);
    if (m) return build(m, names);
  }
  return null;
}

/**
 * Markets of a game (page + extra tabs, in any order) → `SourceMarket[]`. A market that appears on two tabs (same
 * `data-mid`) counts once. Rows of table-style markets are named by their own title ("1º quarto: handicap").
 */
export function mapMarkets(sport: OddsSport, names: Names, markets: PageMarket[]): SourceMarket[] {
  const out: SourceMarket[] = [];
  const seenMarkets = new Set<string>();
  const seenPairs = new Set<string>();
  for (const market of markets) {
    if (market.mid) {
      if (seenMarkets.has(market.mid)) continue;
      seenMarkets.add(market.mid);
    }
    const translated: SourceMarket[] = [];
    const raw: SourceMarket[] = [];
    for (const row of market.rows) {
      const effective = row.title || market.name;
      const tr = translatorFor(sport, effective, names);
      for (const o of row.options) {
        if (o.odds === null || !(o.odds > 1) || !o.label) continue;
        if (tr) {
          const pick = tr.pick(o);
          if (!pick) continue;
          const pair = `${tr.label}\u0000${pick.label}`;
          if (seenPairs.has(pair)) continue;
          seenPairs.add(pair);
          translated.push({ marketLabel: tr.label, selectionLabel: pick.label, line: pick.line ?? null, odds: o.odds, suspended: o.suspended });
        } else {
          raw.push({ marketLabel: effective, selectionLabel: o.label, line: null, odds: o.odds, suspended: o.suspended });
        }
      }
    }
    out.push(...translated);
    // Not translated: the house's own text. If that text alone would get a canonical key, drop it (a wrong key is worse than none).
    if (!raw.some((r) => canonicalKey(sport, r.marketLabel, r.selectionLabel, { home: names.home, away: names.away }) !== null)) out.push(...raw);
  }
  return out;
}
