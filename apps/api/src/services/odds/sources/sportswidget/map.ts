/**
 * Pure mapping of the pt-vision model (Placard / Solverde) to `SourceEvent` / `SourceMarket`.
 *
 * Texts come from the house's (PT) dictionary. A selection text is `label|sign|code|order|…`, e.g. `{0}||1|1|`
 * (home), `Empate||X|2|`, `Mais de|+|O|0|`, `Sim||Y|1|`; `{0}` / `{1}` are the home / away names (also in market
 * texts: "{1} Total de cantos"). The line of a selection is the dictionary text of `handicap_dictionary_id` ("2.5",
 * "-1", "2.5 / 3" for asian quarter lines). The order of the selections in the feed is arbitrary, so the code is used.
 *
 * Markets are translated by their `MarketType` code (MRES, DBLC, BTSC, HCTG, H2HT, HTOH, …) into the labels
 * `canonicalKey` reads; the house's own texts are not reliable for that (some are English, some carry "(TR)").
 * A market that is not translated keeps the house's text and shows only for this house; if that raw text would
 * nevertheless get a canonical key the whole market is dropped: a wrong key is worse than none.
 *
 * There is no BetRadar id (the `VISUALISATION` "SS|…" value is a Statscore id) and none is invented.
 */
import { canonicalKey } from '../../canonical';
import type { HouseId, OddsSport, SourceEvent, SourceMarket } from '../../types';
import type { EventNode, ResultNode, SportsRepo } from './repo';

/** Main market of the calendar, by sport. */
export const MAIN_TYPE: Record<OddsSport, string> = { FOOTBALL: 'MRES', BASKETBALL: 'H2HT', TENNIS: 'HTOH' };

const clean = (s: string | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * A team name as the app shows it. Women's teams come as "Liverpool (F)", "(W)" or "BCC Derthona Women" (the two houses
 * do not always agree): all get the "Feminino" marker, which the matcher reads as a different team from the men's.
 */
export function teamName(raw: string | undefined): string {
  return clean(raw).replace(/\s*(?:\((?:F|W)\)|\bWomen)$/i, ' Feminino');
}

/** `COUNTRY_ID` ("PT|Portugal", "EN|England") → the app's country code; anything else gives none. */
export function countryCodeOf(raw: string | undefined): string | undefined {
  const code = String(raw ?? '').split('|')[0] ?? '';
  if (code === 'EN') return 'GB-ENG';
  if (code === 'WA') return undefined; // "WA|WA": not a country
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

interface Names {
  home: string;
  away: string;
}

/** Calendar entry of one event, or null when it is hidden, unnamed or a tennis doubles match. */
export function mapEvent(repo: SportsRepo, e: EventNode, house: HouseId): SourceEvent | null {
  if (!e.displayed) return null;
  const home = teamName(repo.text(e.home));
  const away = teamName(repo.text(e.away));
  if (!home || !away || home === away) return null;
  if (e.sport === 'TENNIS' && (/\s\/\s/.test(home) || /\s\/\s/.test(away))) return null; // doubles are not compared
  const path = repo.path(e.parent);
  const competition = clean(path[path.length - 1]?.name) || clean(path[1]?.name);
  const countryCode = e.sport === 'TENNIS' ? undefined : countryCodeOf(repo.country(e.parent));
  const names = { home, away };
  const shown = repo.marketsOf(e.id).filter((m) => m.displayed);
  const main = shown.find((m) => repo.marketType(m.type) === MAIN_TYPE[e.sport]);
  const mainMarkets = main ? translateMarket(repo, e.sport, names, main.dict, main.active && e.active, MAIN_TYPE[e.sport], repo.resultsOf(main.id)) : [];
  const order = (s: string) => (s === '1' || s === home ? 0 : s === 'X' || s === 'Empate' ? 1 : 2);
  mainMarkets.sort((a, b) => order(a.selectionLabel) - order(b.selectionLabel));
  return {
    house,
    houseEventId: String(e.id),
    sport: e.sport,
    competition,
    home,
    away,
    startsAt: new Date(e.start * 1000).toISOString(),
    live: repo.isLive(e.id),
    ...(shown.length > 0 ? { marketCount: shown.length } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

// ─── Selections ──────────────────────────────────────────────────────────────

interface Sel {
  /** Label with the names filled in. */
  label: string;
  code: string;
  /** Line text ("2.5", "-1", "2.5 / 3"), '' when none. */
  lineText: string;
  /** Line as a number when it is a plain number. */
  line: number | null;
  odds: number;
}

function selectionOf(repo: SportsRepo, r: ResultNode, names: Names): Sel | null {
  const odds = repo.odds(r.odd);
  if (odds === null || !(odds > 1)) return null;
  const parts = (repo.text(r.dict) ?? '').split('|');
  const label = fill(parts[0] ?? '', names);
  const lineText = r.hcp ? clean(repo.text(r.hcp)) : '';
  const line = /^[+-]?\d+(?:\.\d+)?$/.test(lineText) ? Number(lineText) : null;
  return { label, code: clean(parts[2]), lineText, line, odds };
}

const fill = (text: string, n: Names) => clean(text.replace(/\{0\}/g, n.home).replace(/\{1\}/g, n.away));
const fmt = (n: number) => String(n === 0 ? 0 : n);
const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n));
const isHalf = (n: number) => Math.abs(n % 1) === 0.5;
const isWholeOrHalf = (n: number) => n % 1 === 0 || isHalf(n);

// ─── Translators by market code ──────────────────────────────────────────────

type Pick = (s: Sel, n: Names) => string | null;
interface Translator {
  label: (n: Names, marketText: string) => string | null;
  pick: Pick;
}

const sideName = (code: string, n: Names) => (code === '1' || code === 'P1' ? n.home : code === '2' || code === 'P2' ? n.away : null);

/** Codes kept as they are ("1"/"X"/"2", "1X"/"X2"/"12"). */
const codes = (allowed: RegExp): Pick => (s) => (allowed.test(s.code) ? s.code : null);
const yesNo: Pick = (s) => (s.code === 'Y' ? 'Sim' : s.code === 'N' ? 'Não' : null);
/** Over/under on the line; `lines` says which lines are comparable. */
const overUnder =
  (lines: (n: number) => boolean): Pick =>
  (s) =>
    s.line !== null && lines(s.line) && (s.code === 'O' || s.code === 'U') ? `${s.code === 'O' ? 'Mais' : 'Menos'} de ${fmt(s.line)}` : null;
/** Two-way winner by name. */
const winner: Pick = (s, n) => sideName(s.code, n);
/** Home / draw / away by name ("Empate" for the draw). */
const result3Names: Pick = (s, n) => (s.code === 'X' ? 'Empate' : sideName(s.code, n));
/** Team + signed line ("Benfica -1.5"); `wrap` puts the line in parentheses (3-way football handicap). */
const handicap =
  (lines: (n: number) => boolean, wrap = false): Pick =>
  (s, n) => {
    const name = sideName(s.code, n);
    if (!name || s.line === null || !lines(s.line)) return null;
    return wrap ? `${name} (${signed(s.line)})` : `${name} ${signed(s.line)}`;
  };
/** Score "1 - 0" → "1-0". */
const score: Pick = (s) => {
  const m = s.label.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : null;
};
const htft: Pick = (s) => (/^[12X]\/[12X]$/.test(s.label) ? s.label : null);

const fixed = (label: string, pick: Pick): Translator => ({ label: () => label, pick });
const half = isHalf;

const FOOTBALL: Record<string, Translator> = {
  MRES: fixed('Resultado Final', codes(/^[1X2]$/)),
  DBLC: fixed('Hipótese Dupla', codes(/^(1X|X2|12)$/)),
  BTSC: fixed('Ambas as Equipas Marcam', yesNo),
  HCTG: fixed('Total de Golos Mais/Menos', overUnder(half)),
  OUHG: { label: (n) => `Total de Golos Mais/Menos - ${n.home}`, pick: overUnder(half) },
  OUAG: { label: (n) => `Total de Golos Mais/Menos - ${n.away}`, pick: overUnder(half) },
  DNOB: fixed('Empate Anula Aposta', winner),
  HCMR: fixed('Resultado handicap', handicap((n) => n % 1 === 0, true)),
  HTFT: fixed('Intervalo/Final', htft),
  CSFT: fixed('Resultado Exato', score),
  H1RS: fixed('Resultado da 1ª Parte', codes(/^[1X2]$/)),
  H2RS: fixed('Resultado da 2ª Parte', codes(/^[1X2]$/)),
  OUH1: fixed('1ª Parte - Total de Golos Mais/Menos', overUnder(half)),
  OUH2: fixed('2ª Parte - Total de Golos Mais/Menos', overUnder(half)),
  BTS1: fixed('1ª Parte - Ambas as Equipas Marcam', yesNo),
  BTS2: fixed('2ª Parte - Ambas as Equipas Marcam', yesNo),
  '1DBC': fixed('1ª Parte - Hipótese Dupla', codes(/^(1X|X2|12)$/)),
};

const points = overUnder(isWholeOrHalf);
const pointsHcp = handicap(isWholeOrHalf);
const BASKETBALL: Record<string, Translator> = {
  H2HT: fixed('Vencedor (incl. prolongamento)', winner),
  MRES: fixed('Resultado Final (tempo regulamentar)', result3Names),
  TPOT: fixed('Total de Pontos Mais/Menos', points),
  FTPO: fixed('Total de Pontos Mais/Menos', points),
  CTPO: fixed('Total de Pontos Mais/Menos', points),
  HCOT: fixed('Handicap', pointsHcp),
  FHOT: fixed('Handicap', pointsHcp),
  CHCO: fixed('Handicap', pointsHcp),
  OUHP: { label: (n) => `Total de Pontos Mais/Menos - ${n.home}`, pick: points },
  COUH: { label: (n) => `Total de Pontos Mais/Menos - ${n.home}`, pick: points },
  TPHO: { label: (n) => `Total de Pontos Mais/Menos - ${n.home}`, pick: points },
  OUAP: { label: (n) => `Total de Pontos Mais/Menos - ${n.away}`, pick: points },
  COUA: { label: (n) => `Total de Pontos Mais/Menos - ${n.away}`, pick: points },
  TPAO: { label: (n) => `Total de Pontos Mais/Menos - ${n.away}`, pick: points },
  OH1M: fixed('1ª Parte - Total de Pontos Mais/Menos', points),
  COH1: fixed('1ª Parte - Total de Pontos Mais/Menos', points),
  AHHT: fixed('1ª Parte - Handicap', pointsHcp),
  CAHH: fixed('1ª Parte - Handicap', pointsHcp),
  OU2E: fixed('2ª Parte - Total de Pontos Mais/Menos', points),
  AH2O: fixed('2ª Parte - Handicap', pointsHcp),
  ...Object.fromEntries(
    [1, 2, 3, 4].flatMap((q) => [
      [`P${q}OU`, fixed(`${q}º Quarto - Total de Pontos Mais/Menos`, points)],
      [`T${q}HC`, fixed(`${q}º Quarto - Handicap`, pointsHcp)],
    ]),
  ),
};

const TENNIS: Record<string, Translator> = {
  HTOH: fixed('Vencedor', winner),
  STWN: {
    // "Vencedor do set  (Set 1)": the set number is in the market text.
    label: (_n, text) => {
      const m = text.match(/\(Set ([1-5])\)\s*$/);
      return m ? `${m[1]}º Set - Vencedor` : null;
    },
    pick: winner,
  },
  FTGO: fixed('Total de Jogos Mais/Menos', overUnder(isWholeOrHalf)),
  TGHC: fixed('Handicap de Jogos', handicap(isWholeOrHalf)),
  BTOF: fixed('Resultado Exato em Sets', score),
};

const TABLES: Record<OddsSport, Record<string, Translator>> = { FOOTBALL, BASKETBALL, TENNIS };

/** Selections of one market: translated by code, else the house's text (dropped if that text would key). */
function translateMarket(repo: SportsRepo, sport: OddsSport, names: Names, marketDict: number, active: boolean, code: string, results: ResultNode[]): SourceMarket[] {
  const marketText = clean(repo.text(marketDict));
  const tr = TABLES[sport][code];
  const sels = results.map((r) => selectionOf(repo, r, names)).filter((s): s is Sel => s !== null);
  const out: SourceMarket[] = [];
  const seen = new Set<string>();
  const push = (marketLabel: string, selectionLabel: string, line: number | null, odds: number) => {
    const pair = `${marketLabel}\u0000${selectionLabel}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    out.push({ marketLabel, selectionLabel, line, odds, suspended: !active });
  };
  const label = tr?.label(names, marketText);
  if (tr && label) {
    for (const s of sels) {
      const pick = tr.pick(s, names);
      if (pick) push(label, pick, s.line, s.odds);
    }
    return out;
  }
  const rawLabel = fill(marketText, names);
  if (!rawLabel) return [];
  for (const s of sels) {
    if (!s.label) continue;
    push(rawLabel, s.lineText ? `${s.label} ${s.lineText}` : s.label, s.line, s.odds);
  }
  // Not translated: if the house's text alone would get a canonical key, drop the market (a wrong key is worse than none).
  if (out.some((m) => canonicalKey(sport, m.marketLabel, m.selectionLabel, names) !== null)) return [];
  return out;
}

/** All shown markets of one event, mapped. */
export function mapMarkets(repo: SportsRepo, eventId: number): SourceMarket[] {
  const e = repo.event(eventId);
  if (!e) return [];
  const names = { home: teamName(repo.text(e.home)), away: teamName(repo.text(e.away)) };
  const out: SourceMarket[] = [];
  for (const m of repo.marketsOf(eventId)) {
    if (!m.displayed) continue;
    out.push(...translateMarket(repo, e.sport, names, m.dict, m.active && e.active, repo.marketType(m.type) ?? '', repo.resultsOf(m.id)));
  }
  return out;
}
