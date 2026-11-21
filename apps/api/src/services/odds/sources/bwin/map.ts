/* eslint-disable @typescript-eslint/no-explicit-any -- Bwin JSON is untyped external data; `any` is confined to this boundary. */
/**
 * Pure mapping of the Bwin (Entain "CDS") JSON to `SourceEvent` / `SourceMarket`.
 *
 * Labels are already PT, but a few need rewriting to the text `canonicalKey` reads (the 1X2 selections
 * are the team names, "Mais 2.5" lacks the "de", basketball options carry the house's abbreviations,
 * tennis players carry a country suffix). Rewriting is done by market type and period, never by loose
 * text. Markets that are not confidently translated keep the house's label and show only for Bwin; if
 * such a market would nevertheless get a canonical key, it is dropped: a wrong key is worse than none
 * (e.g. "Equipa que marca o 1º golo" read as "team scores").
 *
 * The "Resultado do Jogo - 2GV" market (pays out early with a 2-goal lead) is not a 1X2: it is never
 * translated, so it never gets an `FT.1X2.*` key and is not offered as `mainMarkets`.
 */
import { canonicalKey } from '../../canonical';
import type { OddsSport, SourceEvent, SourceMarket } from '../../types';

/** Bwin sport ids. */
export const SPORT_ID: Record<OddsSport, number> = { FOOTBALL: 4, TENNIS: 5, BASKETBALL: 7 };

/** Sport of a Bwin sport id, or null when it is not covered. */
export function sportOfId(id: unknown): OddsSport | null {
  const n = Number(id);
  return (Object.keys(SPORT_ID) as OddsSport[]).find((s) => SPORT_ID[s] === n) ?? null;
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** "Roger Federer (SUI)" → "Roger Federer". */
export function stripCountry(s: string): string {
  return clean(s.replace(/\s*\((?:[A-Za-z]{2,3})\)/g, ''));
}

/** ISO-3 region codes Bwin sends → ISO-2 (flagcdn also takes the UK nations). Unknown codes give no country. */
const COUNTRY_CODE: Record<string, string> = {
  ARG: 'AR', AUS: 'AU', AUT: 'AT', BEL: 'BE', BIH: 'BA', BOL: 'BO', BRA: 'BR', BGR: 'BG', BLR: 'BY', CAN: 'CA', CHE: 'CH', CHL: 'CL', CHN: 'CN',
  COL: 'CO', CRC: 'CR', CRI: 'CR', CRO: 'HR', HRV: 'HR', CYP: 'CY', CZE: 'CZ', DEN: 'DK', DNK: 'DK', DEU: 'DE', GER: 'DE', ECU: 'EC', EGY: 'EG',
  ENG: 'GB-ENG', ESP: 'ES', EST: 'EE', FIN: 'FI', FRA: 'FR', GBR: 'GB', GEO: 'GE', GRC: 'GR', GRE: 'GR', GTM: 'GT', HUN: 'HU', IDN: 'ID',
  IND: 'IN', IRL: 'IE', IRN: 'IR', ISL: 'IS', ISR: 'IL', ITA: 'IT', JPN: 'JP', KOR: 'KR', LTU: 'LT', LUX: 'LU', LVA: 'LV', MAR: 'MA', MEX: 'MX',
  MYS: 'MY', NIR: 'GB-NIR', NLD: 'NL', NED: 'NL', NOR: 'NO', NZL: 'NZ', PAR: 'PY', PRY: 'PY', PER: 'PE', POL: 'PL', POR: 'PT', PRT: 'PT',
  QAT: 'QA', ROU: 'RO', ROM: 'RO', RUS: 'RU', SAU: 'SA', SCO: 'GB-SCT', SGP: 'SG', SRB: 'RS', SVK: 'SK', SVN: 'SI', SWE: 'SE', THA: 'TH',
  TUN: 'TN', TUR: 'TR', UKR: 'UA', URU: 'UY', URY: 'UY', USA: 'US', VEN: 'VE', WAL: 'GB-WLS', ZAF: 'ZA', RSA: 'ZA',
};

// ─── Normalised view of a fixture ────────────────────────────────────────────

interface Opt {
  name: string;
  source: string;
  odds: number;
  visible: boolean;
  types: string[];
  /** Ids that can point at a participant (fixtureParticipant / participantId / playerId). */
  refs: number[];
}

interface Mkt {
  name: string;
  isMain: boolean;
  params: Record<string, string>;
  visible: boolean;
  options: Opt[];
}

interface Roles {
  sport: OddsSport;
  home: string;
  away: string;
  /** Normalised names (full and short) per side. */
  homeNames: Set<string>;
  awayNames: Set<string>;
  homeIds: Set<number>;
  awayIds: Set<number>;
}

const isPlayer = (p: any) => p?.properties?.type === 'Player';

function ids(p: any): number[] {
  return [p?.id, p?.participantId].map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

function side(p: any, sport: OddsSport) {
  const value = clean(p?.name?.value);
  const name = sport === 'TENNIS' ? stripCountry(value) : value;
  const names = new Set([norm(name), norm(value), norm(clean(p?.name?.short)), norm(stripCountry(clean(p?.name?.short)))].filter(Boolean));
  return { name, names, ids: new Set(ids(p)) };
}

/**
 * Home and away of a fixture. Football: the typed HomeTeam/AwayTeam. Basketball ("X em casa dos Y"):
 * the first participant is the visitor X and the second the home team Y, so "1" is the visitor.
 * Tennis: the first player is A (home), the second B (away).
 */
export function rolesOf(fixture: any, sport: OddsSport): Roles | null {
  const all: any[] = Array.isArray(fixture?.participants) ? fixture.participants : [];
  const nonPlayers = all.filter((p) => !isPlayer(p));
  const typed = (t: string) => nonPlayers.find((p) => p?.properties?.type === t);
  const untyped = nonPlayers.filter((p) => !p?.properties?.type);
  let h: any;
  let a: any;
  if (sport === 'BASKETBALL') {
    // American naming ("X em casa dos Y") lists the visitor first; other basketball fixtures ("A - B") list the home team first.
    const american = / em casa d[oa]s? /i.test(clean(fixture?.name?.value));
    if (untyped.length === 2) [h, a] = american ? [untyped[1], untyped[0]] : untyped;
    else [h, a] = [typed('HomeTeam'), typed('AwayTeam')];
  } else if (sport === 'FOOTBALL') {
    [h, a] = typed('HomeTeam') && typed('AwayTeam') ? [typed('HomeTeam'), typed('AwayTeam')] : nonPlayers.length === 2 ? [nonPlayers[0], nonPlayers[1]] : [];
  } else {
    [h, a] = nonPlayers.length === 2 ? [nonPlayers[0], nonPlayers[1]] : [];
  }
  if (!h || !a) return null;
  const hs = side(h, sport);
  const as = side(a, sport);
  if (!hs.name || !as.name) return null;
  // Basketball: the typed participants share the V1 names; let their ids resolve too.
  if (sport === 'BASKETBALL') {
    for (const p of nonPlayers.filter((x) => x?.properties?.type)) {
      const s = side(p, sport);
      const target = hs.names.has(norm(s.name)) ? hs : as.names.has(norm(s.name)) ? as : null;
      if (target) s.ids.forEach((i) => target.ids.add(i));
    }
  }
  return { sport, home: hs.name, away: as.name, homeNames: hs.names, awayNames: as.names, homeIds: hs.ids, awayIds: as.ids };
}

function normalise(fixture: any): Mkt[] {
  const out: Mkt[] = [];
  for (const m of Array.isArray(fixture?.optionMarkets) ? fixture.optionMarkets : []) {
    const params: Record<string, string> = {};
    for (const p of Array.isArray(m?.parameters) ? m.parameters : []) params[clean(p?.key)] = clean(p?.value);
    out.push({
      name: clean(m?.name?.value),
      isMain: m?.isMain === true,
      params,
      visible: m?.status === undefined || m.status === 'Visible',
      options: (Array.isArray(m?.options) ? m.options : []).map((o: any): Opt => ({
        name: clean(o?.name?.value),
        source: clean(o?.sourceName?.value),
        odds: Number(o?.price?.odds),
        visible: o?.status === undefined || o.status === 'Visible',
        types: Array.isArray(o?.parameters?.optionTypes) ? o.parameters.optionTypes.map(String) : [],
        refs: [o?.parameters?.fixtureParticipant, o?.participantId].map(Number).filter((n) => Number.isFinite(n) && n > 0),
      })),
    });
  }
  for (const g of Array.isArray(fixture?.games) ? fixture.games : []) {
    out.push({
      name: clean(g?.name?.value),
      isMain: g?.isMain === true,
      params: g?.attr !== undefined ? { attr: clean(g.attr) } : {},
      visible: g?.visibility === undefined || g.visibility === 'Visible',
      options: (Array.isArray(g?.results) ? g.results : []).map((r: any): Opt => ({
        name: clean(r?.name?.value),
        source: clean(r?.sourceName?.value),
        odds: Number(r?.odds),
        visible: r?.visibility === undefined || r.visibility === 'Visible',
        types: [],
        refs: [r?.playerId, r?.participantId].map(Number).filter((n) => Number.isFinite(n) && n > 0),
      })),
    });
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Side of an option: by participant id, then by (full or short) name. */
function sideOf(o: Opt, r: Roles, nameOverride?: string): 'H' | 'A' | null {
  for (const ref of o.refs) {
    if (r.homeIds.has(ref)) return 'H';
    if (r.awayIds.has(ref)) return 'A';
  }
  const n = norm(stripCountry(nameOverride ?? o.name));
  if (!n) return null;
  const h = r.homeNames.has(n);
  const a = r.awayNames.has(n);
  return h !== a ? (h ? 'H' : 'A') : null;
}

const nameOfSide = (s: 'H' | 'A', r: Roles) => (s === 'H' ? r.home : r.away);

/** "21,5" / "+19.5" → number. */
function numberOf(s: string): number | null {
  const n = Number(clean(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const fmt = (n: number) => String(n);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

type Rows = { label: string; selections: { label: string; odds: number; suspended: boolean; line?: number | null }[] };

/** A market's options → rows; options the translator could not read are dropped. */
function rows(m: Mkt, label: string, pick: (o: Opt) => { label: string; line?: number | null } | null): Rows {
  const selections: Rows['selections'] = [];
  for (const o of m.options) {
    if (!Number.isFinite(o.odds) || o.odds <= 1) continue;
    const s = pick(o);
    if (!s) continue;
    selections.push({ label: s.label, odds: o.odds, suspended: !m.visible || !o.visible, ...(s.line !== undefined ? { line: s.line } : {}) });
  }
  return { label, selections };
}

const SET_PREFIX: Record<string, string> = { FirstHalf: '1ª Parte - ', SecondHalf: '2ª Parte - ', RegularTime: '' };

// ─── Football ────────────────────────────────────────────────────────────────

function footballMarket(m: Mkt, r: Roles): Rows | null {
  const type = m.params.MarketType;
  const period = m.params.Period ?? '';
  const pre = SET_PREFIX[period];
  if (pre === undefined) return null;
  const n = norm(m.name);

  if (type === '3way') {
    let label: string | null = null;
    if (period === 'RegularTime' && n === 'resultado do jogo') label = 'Resultado Final';
    else if (period === 'FirstHalf' && n === '1a parte - resultado') label = 'Resultado da 1ª Parte';
    else if (period === 'SecondHalf' && n === 'resultado da 2a parte') label = 'Resultado da 2ª Parte';
    if (!label) return null;
    return rows(m, label, (o) => {
      if (o.types.includes('Draw')) return { label: 'X' };
      const s = sideOf(o, r);
      return s ? { label: s === 'H' ? '1' : '2' } : null;
    });
  }

  if (type === 'DoubleChance') {
    const half = period === 'FirstHalf' ? '1' : '2';
    if (!(n === 'hipotese dupla' || (pre && n === `${half}a parte - hipotese dupla`))) return null;
    return rows(m, `${pre}Hipótese Dupla`, (o) => {
      if (!o.types.includes('Draw')) return { label: '12' };
      const s = sideOf({ ...o, name: '' }, r);
      return s ? { label: s === 'H' ? '1X' : 'X2' } : null;
    });
  }

  if (type === 'BTTS') {
    if (!/^ambas (as equipas )?marcam( - [12]a parte)?$/.test(n)) return null;
    return rows(m, `${pre}Ambas as Equipas Marcam`, (o) => (o.name === 'Sim' || o.name === 'Não' ? { label: o.name } : null));
  }

  if (type === 'Over/Under' && (m.params.Happening === 'Goal' || m.params.Happening === 'Corner')) {
    const what = m.params.Happening === 'Goal' ? 'Golos' : 'Cantos';
    const line = numberOf(m.params.DecimalValue ?? '');
    if (line === null) return null;
    let label: string | null = null;
    if (new RegExp(`^(?:[12]a parte - )?total ${what.toLowerCase()}$`).test(n)) label = `${pre}Total de ${what} Mais/Menos`;
    else if (what === 'Golos' && period === 'RegularTime') {
      const t = clean(m.name).match(/^(.+?) - total golos$/i);
      const s = t ? sideOf({ name: t[1]!, refs: [] } as unknown as Opt, r) : null;
      if (s) label = `Total de Golos Mais/Menos - ${nameOfSide(s, r)}`;
    }
    if (!label) return null;
    return rows(m, label, (o) => {
      const over = o.types.includes('Over') ? true : o.types.includes('Under') ? false : /^mais/i.test(o.name) ? true : /^menos/i.test(o.name) ? false : null;
      return over === null ? null : { label: `${over ? 'Mais' : 'Menos'} de ${fmt(line)}`, line };
    });
  }

  if (type === 'DrawNoBet' && period === 'RegularTime' && n === 'empate anula aposta') {
    return rows(m, 'Empate Anula Aposta', (o) => {
      const s = sideOf(o, r);
      return s ? { label: nameOfSide(s, r) } : null;
    });
  }

  if (type === 'HTandFTV2' && period === 'RegularTime' && n === 'intervalo/tempo regulamentar') {
    const one = (t: string): string | null => {
      const x = norm(t);
      if (x === 'empate' || x === 'x') return 'X';
      return x === norm(r.home) ? '1' : x === norm(r.away) ? '2' : null;
    };
    return rows(m, 'Intervalo/Final', (o) => {
      const parts = o.name.split(' / ');
      const [ht, ft] = parts.length === 2 ? [one(parts[0]!), one(parts[1]!)] : [null, null];
      return ht && ft ? { label: `${ht}/${ft}` } : null;
    });
  }

  if (type === 'DynamicCorrectScore' && period === 'RegularTime' && n === 'resultado exato') {
    return rows(m, 'Resultado Exato', (o) => {
      const sc = o.name.match(/^(\d+):(\d+)$/);
      return sc ? { label: `${sc[1]}-${sc[2]}` } : null;
    });
  }
  return null;
}

// ─── Basketball ──────────────────────────────────────────────────────────────

/** "1º Tempo" / "2ª parte" / "Primeiro Quarto" / "3º trimestre" → label prefix, '' for none, null when not understood. */
function basketballScope(s: string): string | null {
  const t = norm(s);
  if (!t) return '';
  const ord: Record<string, number> = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4 };
  let m = t.match(/^(\d)o tempo$/) ?? t.match(/^(\d)a parte$/);
  if (m) return Number(m[1]) === 1 || Number(m[1]) === 2 ? `${m[1]}ª Parte - ` : null;
  m = t.match(/^(\d)o (?:quarto|trimestre|periodo)$/) ?? t.match(/^(primeiro|segundo|terceiro|quarto) (?:quarto|trimestre|periodo)$/);
  if (m) {
    const n = ord[m[1]!] ?? Number(m[1]);
    return n >= 1 && n <= 4 ? `${n}º Quarto - ` : null;
  }
  return null;
}

function basketballMarket(m: Mkt, r: Roles): Rows | null {
  const n = clean(m.name);
  if (/^(?:money line(?: \(eua\))?|vencedor)$/i.test(n) && m.isMain) {
    return rows(m, 'Vencedor (incl. prolongamento)', (o) => {
      const s = sideOf(o, r);
      return s ? { label: nameOfSide(s, r) } : null;
    });
  }
  const t = n.match(/^(Totais|Diferença de pontos|Diferencial|Handicap)(?: (?:do|da) (.+?))?(?:\s*\(.*\))?$/i);
  if (!t) return null;
  const scope = basketballScope(t[2] ?? '');
  if (scope === null) return null;
  if (/^totais$/i.test(t[1]!)) {
    return rows(m, `${scope}Total de Pontos Mais/Menos`, (o) => {
      const x = o.name.match(/^(mais|menos) de ([\d.,]+)$/i);
      const line = x ? numberOf(x[2]!) : null;
      return x && line !== null ? { label: `${/^mais/i.test(x[1]!) ? 'Mais' : 'Menos'} de ${fmt(line)}`, line } : null;
    });
  }
  return rows(m, `${scope}Handicap`, (o) => {
    const x = o.name.match(/^(.+?)\s*([+-]\d+(?:[.,]\d+)?)$/);
    const line = x ? numberOf(x[2]!) : null;
    const s = x ? sideOf(o, r, x[1]!) : null;
    return x && s && line !== null ? { label: `${nameOfSide(s, r)} ${signed(line)}`, line } : null;
  });
}

// ─── Tennis ──────────────────────────────────────────────────────────────────

function tennisMarket(m: Mkt, r: Roles): Rows | null {
  const n = clean(m.name);
  const player = (o: Opt): string | null => {
    const s = sideOf(o, r);
    return s ? nameOfSide(s, r) : null;
  };
  if (/^vencedor do jogo$/i.test(n)) {
    return rows(m, 'Vencedor', (o) => {
      const p = player(o);
      return p ? { label: p } : null;
    });
  }
  const set = n.match(/^([1-5])[º°] set - vencedor$/i);
  if (set) {
    return rows(m, `${set[1]}º Set - Vencedor`, (o) => {
      const p = player(o);
      return p ? { label: p } : null;
    });
  }
  if (/^total jogos$/i.test(n)) {
    return rows(m, 'Total de Jogos Mais/Menos', (o) => {
      const x = o.name.match(/^(mais|menos) de ([\d.,]+)$/i);
      const line = x ? numberOf(x[2]!) : null;
      return x && line !== null ? { label: `${/^mais/i.test(x[1]!) ? 'Mais' : 'Menos'} de ${fmt(line)}`, line } : null;
    });
  }
  if (/^quem vencerá mais jogos na partida\? \(handicap de jogador\)$/i.test(n)) {
    return rows(m, 'Handicap de Jogos', (o) => {
      const x = stripCountry(o.name).match(/^(.+?)\s*([+-]\d+(?:[.,]\d+)?)$/);
      const line = x ? numberOf(x[2]!) : null;
      const p = player(o);
      return x && p && line !== null ? { label: `${p} ${signed(line)}`, line } : null;
    });
  }
  if (/^aposta no set$/i.test(n)) {
    return rows(m, 'Resultado Exato em Sets', (o) => {
      const sc = o.name.match(/^(\d):(\d)$/);
      return sc ? { label: `${sc[1]}-${sc[2]}` } : null;
    });
  }
  return null;
}

// ─── Markets of a fixture ────────────────────────────────────────────────────

const MAIN_LABELS = new Set(['Resultado Final', 'Vencedor (incl. prolongamento)', 'Vencedor']);

/** The markets of a fixture (calendar entry or fixture-view) → `SourceMarket[]`. */
export function mapFixtureMarkets(fixture: any, sport: OddsSport): SourceMarket[] {
  const r = rolesOf(fixture, sport);
  if (!r) return [];
  const ctx = { home: r.home, away: r.away };
  const out: SourceMarket[] = [];
  for (const m of normalise(fixture)) {
    const handler = sport === 'FOOTBALL' ? footballMarket : sport === 'BASKETBALL' ? basketballMarket : tennisMarket;
    let handled = handler(m, r);
    if (!handled) {
      // Not translated: the house's own label. Drop it if that label alone would get a canonical key.
      handled = rows(m, m.name, (o) => ({ label: sport === 'TENNIS' ? stripCountry(o.name) : o.name }));
      if (handled.selections.some((s) => canonicalKey(sport, handled!.label, s.label, ctx) !== null)) continue;
    }
    for (const s of handled.selections) {
      out.push({ marketLabel: handled.label, selectionLabel: s.label, line: s.line ?? null, odds: s.odds, suspended: s.suspended });
    }
  }
  return out;
}

/** Body of `fixture-view` → sport and markets; null when the fixture is not one of the covered sports. */
export function mapFixtureView(body: any): { sport: OddsSport; markets: SourceMarket[] } | null {
  const fixture = body?.fixture;
  const sport = sportOfId(fixture?.sport?.id ?? fixture?.sportId);
  if (!fixture || !sport) return null;
  return { sport, markets: mapFixtureMarkets(fixture, sport) };
}

// ─── Events ──────────────────────────────────────────────────────────────────

/** One fixture of the calendar → `SourceEvent`; null when it is not a two-sided, open, pre-match or live game of `sport`. */
export function mapEvent(f: any, sport: OddsSport): SourceEvent | null {
  const id = clean(f?.id);
  const stage = clean(f?.stage);
  const t = Date.parse(clean(f?.startDate));
  if (!/^[\d:]+$/.test(id) || (stage !== 'PreMatch' && stage !== 'Live') || !Number.isFinite(t) || f?.isOpenForBetting === false) return null;
  if (sportOfId(f?.sport?.id ?? f?.sportId) !== sport) return null;
  const r = rolesOf(f, sport);
  if (!r) return null;
  const betRadar = clean(f?.addons?.betRadar);
  const marketCount = Number(f?.totalMarketsCount);
  const countryCode = COUNTRY_CODE[clean(f?.region?.code).toUpperCase()];
  const mainMarkets = mapFixtureMarkets(f, sport).filter((m) => MAIN_LABELS.has(m.marketLabel));
  return {
    house: 'bwin',
    houseEventId: id,
    sport,
    competition: clean(f?.competition?.name?.value),
    home: r.home,
    away: r.away,
    startsAt: new Date(t).toISOString(),
    live: stage === 'Live',
    ...(/^[1-9]\d*$/.test(betRadar) ? { extraIds: { betRadarId: betRadar } } : {}),
    ...(Number.isFinite(marketCount) && marketCount > 0 ? { marketCount } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

/** A calendar page (`{ fixtures }`) → events. */
export function mapCalendar(body: any, sport: OddsSport): SourceEvent[] {
  const out: SourceEvent[] = [];
  for (const f of Array.isArray(body?.fixtures) ? body.fixtures : []) {
    const ev = mapEvent(f, sport);
    if (ev) out.push(ev);
  }
  return out;
}

/** `publicAccessId` and the CDS base URL of the public `clientconfig`; null when the shape is not recognised. */
export function parseClientConfig(body: any): { accessId: string; cdsUrl: string } | null {
  const accessId = clean(body?.msConnection?.publicAccessId ?? body?.msApp?.publicAccessId);
  const cdsUrl = clean(body?.msConnection?.cdsFrontendUrl).replace(/\/$/, '');
  return /^[\w-]{16,128}={0,2}$/.test(accessId) && /^https:\/\/[\w.-]+(\/[\w-]+)*$/.test(cdsUrl) ? { accessId, cdsUrl } : null;
}
