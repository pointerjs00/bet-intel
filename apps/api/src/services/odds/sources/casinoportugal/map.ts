/* eslint-disable @typescript-eslint/no-explicit-any -- Casino Portugal (NSoft) JSON is untyped external data; `any` is confined to this boundary. */
/**
 * Pure mapping of the NSoft "AIO" offer API (the sportsbook behind casinoportugal.pt) to `SourceEvent` / `SourceMarket`.
 *
 * Shape of every answer: normalised tables (`sports`, `categories`, `tournaments`, `markets` = dictionary of the
 * markets present, `events`). An event carries `markets[]` of `{ marketId, specifiers?, outcomes[] }`, an outcome is
 * `{ outcomeId, odds, status, specifiers? }`. Odds are integers (÷ 10000); `status` 1 = open, anything else = suspended.
 * Names live in the dictionary: `markets[].eventMarketName` and `outcomes[].eventMarketOutcomeName` are templates with
 * placeholders (`{{E.C1.NAME}}` = home, `{{O.S.TOTAL}}` = the line of that outcome, `{{M.S.SET_NUMBER}}` = a market
 * specifier...). Competitors come in any order: `ordinal` 1 = home, 2 = away.
 *
 * Markets are translated by their (stable) `marketId` into the labels `canonicalKey` reads; line markets use the
 * `specifiers` values (never the free text). A market that is not translated keeps the house's rendered label and shows
 * only for this house; if that raw label would nevertheless get a canonical key it is dropped: a wrong key is worse than
 * none. Templates the renderer does not fully understand drop the market as well.
 *
 * There is no BetRadar id (the study found none): the internal NSoft ids are never put in `extraIds`.
 */
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceEvent, SourceMarket } from '../../types';

/** NSoft sport ids (`sports=` of the calendar request). */
export const SPORT_ID: Record<OddsSport, number> = { FOOTBALL: 69, BASKETBALL: 72, TENNIS: 75 };

const SPORT_OF_ID = new Map<number, OddsSport>((Object.keys(SPORT_ID) as OddsSport[]).map((s) => [SPORT_ID[s], s]));

/** ISO-3 code of the category (country) → ISO country used by the app. Unknown codes (and "INT") give no country. */
const COUNTRY: Record<string, string> = {
  AGO: 'AO', ARE: 'AE', ARG: 'AR', AUS: 'AU', AUT: 'AT', BEL: 'BE', BGR: 'BG', BIH: 'BA', BLR: 'BY', BRA: 'BR', CAN: 'CA', CHE: 'CH', CHL: 'CL',
  CRI: 'CR', CYP: 'CY', CZE: 'CZ', DEU: 'DE', DNK: 'DK', ECU: 'EC', ENG: 'GB-ENG', ESP: 'ES', FIN: 'FI', FRA: 'FR', GEO: 'GE', GRC: 'GR',
  GTM: 'GT', HRV: 'HR', HUN: 'HU', IND: 'IN', ISR: 'IL', ITA: 'IT', JAM: 'JM', JPN: 'JP', KOR: 'KR', LTU: 'LT', LUX: 'LU', MEX: 'MX', MKD: 'MK',
  MNE: 'ME', NIC: 'NI', NIR: 'GB-NIR', NLD: 'NL', NOR: 'NO', PER: 'PE', PHL: 'PH', POL: 'PL', PRT: 'PT', QAT: 'QA', ROU: 'RO', RUS: 'RU',
  SCO: 'GB-SCT', SRB: 'RS', SVK: 'SK', SVN: 'SI', SWE: 'SE', TUR: 'TR', UKR: 'UA', USA: 'US',
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fmt = (n: number) => String(n === 0 ? 0 : n);
const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const isHalfLine = (n: number) => Math.abs(n % 1) === 0.5;
const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);

// ─── Dictionary ──────────────────────────────────────────────────────────────

interface DictOutcome {
  tpl: string;
  /** `displayId` → specifier id of this outcome (`TOTAL` → 2, `HANDICAP_VALUE` → 3). */
  specs: Map<string, number>;
}

interface DictMarket {
  id: number;
  tpl: string;
  specs: Map<string, number>;
  outcomes: Map<number, DictOutcome>;
}

function specMap(list: unknown): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of arr(list)) if (typeof s?.displayId === 'string' && Number.isInteger(s?.id)) out.set(s.displayId, s.id);
  return out;
}

/** The response's market dictionary by `marketId`. */
/** Market dictionary of a response by `marketId`. */
export type Dictionary = Map<number, DictMarket>;

function dictionary(body: any): Dictionary {
  const out = new Map<number, DictMarket>();
  for (const m of arr(body?.markets)) {
    if (!Number.isInteger(m?.id)) continue;
    const outcomes = new Map<number, DictOutcome>();
    for (const o of arr(m.outcomes)) {
      if (Number.isInteger(o?.id)) outcomes.set(o.id, { tpl: clean(o.eventMarketOutcomeName ?? o.name), specs: specMap(o.specifiers) });
    }
    out.set(m.id, { id: m.id, tpl: clean(m.eventMarketName ?? m.name), specs: specMap(m.specifiers), outcomes });
  }
  return out;
}

// ─── Template renderer ───────────────────────────────────────────────────────

interface Names {
  home: string;
  away: string;
}

/** Looks up a specifier value by its `displayId` on the market or the outcome. */
type SpecLookup = (scope: 'M' | 'O', displayId: string) => string | undefined;

function term(expr: string, lookup: SpecLookup): number | null {
  const m = expr.trim().match(/^([MO])\.S\.([A-Z_]+)(\*-1)?$/);
  if (!m) return null;
  const v = Number(lookup(m[1] as 'M' | 'O', m[2]!));
  if (!Number.isFinite(v)) return null;
  return m[3] ? -v : v;
}

/** One `{{ ... }}` expression → text, or null when the renderer does not know it. */
function evalExpr(expr: string, names: Names, lookup: SpecLookup): string | null {
  const e = expr.trim();
  const name = e.match(/^E\.C([12])\.(?:T\.)?NAME$/);
  if (name) return name[1] === '1' ? names.home : names.away;
  const cond = e.match(/^DISPLAY_IF\(\((.+?)>=0\),\s*"\+"\)$/);
  if (cond) {
    const v = term(cond[1]!, lookup);
    return v === null ? null : v >= 0 ? '+' : '';
  }
  const digits = e.match(/^FORMAT_NUMBER_DIGITS\((.+?),\s*\d+\)$/);
  const v = term(digits ? digits[1]! : e, lookup);
  return v === null ? null : fmt(v);
}

/** Renders a dictionary template; null when any placeholder is unknown/unresolved (the market is then not shown). */
function render(tpl: string, names: Names, lookup: SpecLookup): string | null {
  let ok = true;
  const text = tpl.replace(/\{\{(.*?)\}\}/g, (_all, expr: string) => {
    const r = evalExpr(expr, names, lookup);
    if (r === null) ok = false;
    return r ?? '';
  });
  return ok ? clean(text) : null;
}

// ─── Event model ─────────────────────────────────────────────────────────────

/** "Apelido, Nome" (tennis singles) → "Nome Apelido"; anything else is only whitespace-cleaned. */
export function playerName(raw: string): string {
  const s = clean(raw);
  const m = s.match(/^([^,/]+),\s*([^,/]+)$/);
  return m ? `${m[2]!.trim()} ${m[1]!.trim()}` : s;
}

function namesOf(event: any, sport: OddsSport): Names | null {
  const comps = arr(event?.competitors);
  const one = comps.find((c) => c?.ordinal === 1);
  const two = comps.find((c) => c?.ordinal === 2);
  const home = sport === 'TENNIS' ? playerName(one?.teamName) : clean(one?.teamName);
  const away = sport === 'TENNIS' ? playerName(two?.teamName) : clean(two?.teamName);
  if (!home || !away || home === away || comps.length !== 2) return null;
  if (sport === 'TENNIS' && (/\s\/\s/.test(home) || /\s\/\s/.test(away))) return null; // doubles are not compared
  return { home, away };
}

type Side = 'H' | 'A' | 'D';

/** Role of an outcome from its template: the home/away competitor, or the draw. */
function roleOf(tpl: string): Side | null {
  const m = tpl.match(/^\{\{E\.C([12])\.(?:T\.)?NAME\}\}$/);
  if (m) return m[1] === '1' ? 'H' : 'A';
  return /^(empate|draw|x)$/i.test(tpl) ? 'D' : null;
}

/** Home/away competitor named at the start of a template (`{{E.C1.NAME}} {{...handicap...}}`). */
function leadingRole(tpl: string): Side | null {
  const m = tpl.match(/^{{E.C([12]).(?:T.)?NAME}}/);
  return m ? (m[1] === '1' ? 'H' : 'A') : null;
}

/** What a translator gets for one market instance of an event. */
interface Ctx {
  names: Names;
  dict: DictMarket;
  /** Specifier value of the market instance by displayId (`SET_NUMBER`...). */
  marketSpec: (displayId: string) => string | undefined;
}

interface OutcomeView {
  dict: DictOutcome;
  /** Specifier value of this outcome by displayId (`TOTAL`, `HANDICAP_VALUE`). */
  spec: (displayId: string) => string | undefined;
}

interface Pick {
  label: string;
  line?: number | null;
}
interface Translated {
  label: string;
  pick: (o: OutcomeView) => Pick | null;
}
type Translator = (c: Ctx) => Translated | null;

const specValue = (list: unknown, ids: Map<string, number>) => (displayId: string): string | undefined => {
  const id = ids.get(displayId);
  const hit = id === undefined ? undefined : arr(list).find((s) => s?.id === id);
  return hit === undefined ? undefined : clean(hit.value);
};

const nameOf = (side: Side, n: Names) => (side === 'H' ? n.home : n.away);

// ─── Translators (by marketId) ───────────────────────────────────────────────

const result3 = (label: string): Translator => () => ({
  label,
  pick: (o) => {
    const r = roleOf(o.dict.tpl);
    return r ? { label: r === 'H' ? '1' : r === 'A' ? '2' : 'X' } : null;
  },
});

const result3Named = (label: string): Translator => (c) => ({
  label,
  pick: (o) => {
    const r = roleOf(o.dict.tpl);
    return r ? { label: r === 'D' ? 'Empate' : nameOf(r, c.names) } : null;
  },
});

const doubleChance = (label: string): Translator => () => ({
  label,
  pick: (o) => {
    const t = o.dict.tpl.replace(/\{\{E\.C([12])\.(?:T\.)?NAME\}\}/g, 'C$1');
    return t === 'C1 ou Empate' ? { label: '1X' } : t === 'Empate ou C2' ? { label: 'X2' } : t === 'C1 ou C2' ? { label: '12' } : null;
  },
});

const bothScore = (label: string): Translator => () => ({
  label,
  pick: (o) => (o.dict.tpl === 'Sim' || o.dict.tpl === 'Não' ? { label: o.dict.tpl } : null),
});

const drawNoBet = (label: string): Translator => (c) => ({
  label,
  pick: (o) => {
    const r = roleOf(o.dict.tpl);
    return r === 'H' || r === 'A' ? { label: nameOf(r, c.names) } : null;
  },
});

/** Over/under on the outcome's `TOTAL` specifier, half lines only. */
function overUnder(o: OutcomeView): Pick | null {
  const side = /^Acima\b/.test(o.dict.tpl) ? 'Mais' : /^Abaixo\b/.test(o.dict.tpl) ? 'Menos' : null;
  const line = Number(o.spec('TOTAL'));
  if (!side || !Number.isFinite(line) || !isHalfLine(line)) return null;
  return { label: `${side} de ${fmt(line)}`, line };
}

const totals = (label: string): Translator => () => ({ label, pick: (o) => overUnder(o) });

/** Total of one team: the team is the one named by the market's own template (`{{E.C1.NAME}} ...`). */
const teamTotals = (label: string): Translator => (c) => {
  const m = c.dict.tpl.match(/^\{\{E\.C([12])\.(?:T\.)?NAME\}\}/);
  if (!m) return null;
  const team = m[1] === '1' ? c.names.home : c.names.away;
  return { label: `${label} - ${team}`, pick: (o) => overUnder(o) };
};

/** Two-way handicap: the outcome specifier is the home handicap; the away selection is its negation. */
const handicap = (label: string): Translator => (c) => ({
  label,
  pick: (o) => {
    const r = leadingRole(o.dict.tpl);
    const v = Number(o.spec('HANDICAP_VALUE'));
    if ((r !== 'H' && r !== 'A') || !Number.isFinite(v)) return null;
    const line = r === 'H' ? v : -v;
    return isHalfLine(line) ? { label: `${nameOf(r, c.names)} ${signed(line)}`, line } : null;
  },
});

const halfTimeFullTime = (label: string): Translator => () => ({
  label,
  pick: (o) => (/^[1X2]\/[1X2]$/.test(o.dict.tpl) ? { label: o.dict.tpl } : null),
});

const winnerNames = (label: string | ((c: Ctx) => string | null)): Translator => (c) => {
  const l = typeof label === 'string' ? label : label(c);
  if (!l) return null;
  return {
    label: l,
    pick: (o) => {
      const r = roleOf(o.dict.tpl);
      return r === 'H' || r === 'A' ? { label: nameOf(r, c.names) } : null;
    },
  };
};

const exactSetScore: Translator = () => ({
  label: 'Resultado Exato em Sets',
  pick: (o) => {
    const m = o.dict.tpl.match(/^(\d):(\d)$/);
    return m ? { label: `${m[1]}-${m[2]}` } : null;
  },
});

/** "1º Quarto - " from the market specifier `QUARTER_NUMBER`; null when it is not 1-4. */
function quarterScope(c: Ctx): string | null {
  const q = Number(c.marketSpec('QUARTER_NUMBER'));
  return Number.isInteger(q) && q >= 1 && q <= 4 ? `${q}º Quarto - ` : null;
}

const scoped = (scope: (c: Ctx) => string | null, inner: (label: string) => Translator, base: string): Translator => (c) => {
  const s = scope(c);
  return s === null ? null : inner(`${s}${base}`)(c);
};

const FOOTBALL: Record<number, Translator> = {
  1708: result3('Resultado Final'),
  1409: doubleChance('Hipótese Dupla'),
  1411: bothScore('Ambas as Equipas Marcam'),
  1682: totals('Total de Golos Mais/Menos'),
  172: drawNoBet('Empate Anula Aposta'),
  1589: teamTotals('Total de Golos Mais/Menos'),
  1616: teamTotals('Total de Golos Mais/Menos'),
  1625: handicap('Handicap'),
  1018: halfTimeFullTime('Intervalo/Final'),
  177: result3('Resultado da 1ª Parte'),
  296: doubleChance('1ª Parte - Hipótese Dupla'),
  1642: totals('1ª Parte - Total de Golos Mais/Menos'),
  391: bothScore('1ª Parte - Ambas as Equipas Marcam'),
  1304: result3('Resultado da 2ª Parte'),
  209: doubleChance('2ª Parte - Hipótese Dupla'),
  1629: totals('2ª Parte - Total de Golos Mais/Menos'),
  1163: bothScore('2ª Parte - Ambas as Equipas Marcam'),
};

const BASKETBALL: Record<number, Translator> = {
  1566: winnerNames('Vencedor (incl. prolongamento)'),
  1574: totals('Total de Pontos Mais/Menos'),
  1595: handicap('Handicap'),
  1597: teamTotals('Total de Pontos Mais/Menos'),
  1599: teamTotals('Total de Pontos Mais/Menos'),
  1704: result3Named('1x2 (tempo regulamentar)'),
  1684: totals('1ª Parte - Total de Pontos Mais/Menos'),
  1594: handicap('1ª Parte - Handicap'),
  1512: result3Named('1ª Parte - 1x2'),
  1606: totals('2ª Parte - Total de Pontos Mais/Menos'),
  1471: handicap('2ª Parte - Handicap'),
  1554: result3Named('2ª Parte - 1x2'),
  1652: scoped(quarterScope, totals, 'Total de Pontos Mais/Menos'),
  1598: scoped(quarterScope, handicap, 'Handicap'),
  1459: scoped(quarterScope, result3Named, '1x2'),
};

const TENNIS: Record<number, Translator> = {
  1713: winnerNames('Vencedor'),
  1353: winnerNames((c) => {
    const n = Number(c.marketSpec('SET_NUMBER'));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? `${n}º Set - Vencedor` : null;
  }),
  1663: totals('Total de Jogos Mais/Menos'),
  1611: handicap('Handicap de Jogos'),
  79: exactSetScore,
};

const TRANSLATORS: Record<OddsSport, Record<number, Translator>> = { FOOTBALL, BASKETBALL, TENNIS };

// ─── Markets of an event ─────────────────────────────────────────────────────

/** Labels of the main market (1X2 / winner / moneyline) kept as `mainMarkets` of the calendar. */
const MAIN_LABELS = new Set(['Resultado Final', 'Vencedor (incl. prolongamento)', 'Vencedor']);

/** The markets of one event (calendar entry or event page) → `SourceMarket[]`, using the response's dictionary. */
function mapEventMarkets(event: any, dict: Map<number, DictMarket>, sport: OddsSport): SourceMarket[] {
  const names = namesOf(event, sport);
  if (!names) return [];
  const ctx = { home: names.home, away: names.away };
  const out: SourceMarket[] = [];
  for (const m of arr(event?.markets)) {
    const d = dict.get(m?.marketId);
    if (!d) continue;
    const marketSpec = specValue(m.specifiers, d.specs);
    const c: Ctx = { names, dict: d, marketSpec };
    const translated = TRANSLATORS[sport][d.id]?.(c) ?? null;

    const rows: { marketLabel: string; selectionLabel: string; line: number | null; odds: number; suspended: boolean }[] = [];
    let raw = false;
    let rawLabel: string | null = null;
    if (!translated) {
      raw = true;
      rawLabel = render(d.tpl, names, (scope, id) => (scope === 'M' ? marketSpec(id) : undefined));
      if (!rawLabel) continue;
    }
    for (const o of arr(m.outcomes)) {
      const od = d.outcomes.get(o?.outcomeId);
      const odds = Number(o?.odds) / 10000;
      if (!od || !Number.isFinite(odds) || odds <= 1) continue;
      const outcomeSpec = specValue(o.specifiers, od.specs);
      const view: OutcomeView = { dict: od, spec: outcomeSpec };
      let marketLabel: string;
      let selection: Pick | null;
      if (translated) {
        marketLabel = translated.label;
        selection = translated.pick(view);
      } else {
        marketLabel = rawLabel!;
        const text = render(od.tpl, names, (scope, id) => (scope === 'M' ? marketSpec(id) : outcomeSpec(id)));
        selection = text ? { label: text, line: null } : null;
      }
      if (!selection) continue;
      rows.push({ marketLabel, selectionLabel: selection.label, line: selection.line ?? null, odds, suspended: o?.status !== 1 });
    }
    // Not translated: the house's own label. Drop it if that label alone would get a canonical key.
    if (raw && rows.some((r) => canonicalKey(sport, r.marketLabel, r.selectionLabel, ctx) !== null)) continue;
    for (const r of rows) out.push(r);
  }
  return out;
}

/** Sport of an event-page / calendar response: the one sport in `sports`, or null. */
function sportOf(body: any): OddsSport | null {
  const sports = arr(body?.sports);
  return sports.length === 1 ? (SPORT_OF_ID.get(sports[0]?.id) ?? null) : null;
}

/** `offer/events/{id}` answer → the markets of the (first) event and its sport; null when it is not a covered sport. */
export function mapEventMarketsResponse(body: any): { sport: OddsSport; markets: SourceMarket[] } | null {
  const sport = sportOf(body);
  const event = arr(body?.events)[0];
  if (!sport || !event) return null;
  return { sport, markets: mapEventMarkets(event, dictionary(body), sport) };
}

// ─── Calendar ────────────────────────────────────────────────────────────────

/**
 * A calendar page (`offer/cursors`) → pre-match events of `sport` (any start time: the caller filters the window).
 * `known` accumulates the market dictionary across the pages of one listing: only the first page carries it.
 */
export function mapCalendarPage(body: any, sport: OddsSport, known: Dictionary = new Map()): SourceEvent[] {
  // Continuation pages (`offer/cursors/{cursorId}`) carry neither `sports` nor the market dictionary: the first page did.
  const declared = arr(body?.sports).length === 0 ? sport : sportOf(body);
  if (declared !== sport) return [];
  for (const [id, m] of dictionary(body)) known.set(id, m);
  const dict = known;
  const tournaments = new Map<number, any>(arr(body?.tournaments).map((t) => [t?.id, t]));
  const categories = new Map<number, any>(arr(body?.categories).map((c) => [c?.id, c]));
  const out: SourceEvent[] = [];
  for (const e of arr(body?.events)) {
    const id = String(e?.id ?? '');
    const t = Date.parse(String(e?.startsAt ?? ''));
    if (!/^\d+$/.test(id) || !Number.isFinite(t) || e?.type !== 1 || e?.playStatus !== 1) continue;
    const names = namesOf(e, sport);
    if (!names) continue;
    const tournament = tournaments.get(e?.tournamentId);
    const category = categories.get(tournament?.categoryId);
    const competition = clean(tournament?.name);
    const countryCode = sport === 'TENNIS' ? undefined : COUNTRY[clean(category?.code)];
    const marketCount = Number(e?.totalMarketCount);
    const mainMarkets = mapEventMarkets(e, dict, sport).filter((m) => MAIN_LABELS.has(m.marketLabel));
    out.push({
      house: 'casinoportugal',
      houseEventId: id,
      sport,
      competition,
      home: names.home,
      away: names.away,
      startsAt: new Date(t).toISOString(),
      live: false,
      ...(Number.isFinite(marketCount) && marketCount > 0 ? { marketCount } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(mainMarkets.length ? { mainMarkets } : {}),
    });
  }
  return out;
}

/** Cursor of the next calendar page, or null when this page is empty/short (the last one). */
export function nextCursor(body: any, pageSize: number): string | null {
  const events = arr(body?.events).length;
  const cursor = clean(body?.cursorId);
  return events >= pageSize && /^[\w.~-]{20,4000}$/.test(cursor) ? cursor : null;
}

/** Public config (tenant id, API host) from the HTML of `/desporto`; null when absent or malformed. */
export function parseConfig(html: string): { tenantId: string; apiUrl: string } | null {
  const block = html.match(/sportsWidget\s*:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const tenantId = block.match(/tenantId\s*:\s*['"]([0-9a-f-]{36})['"]/i)?.[1];
  const apiUrl = block.match(/statisticsDomain\s*:\s*['"](https:\/\/[\w.-]+)\/?['"]/)?.[1];
  return tenantId && apiUrl ? { tenantId, apiUrl } : null;
}
