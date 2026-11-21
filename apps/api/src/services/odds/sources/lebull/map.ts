/* eslint-disable @typescript-eslint/no-explicit-any -- Lebull JSON is untyped external data; `any` is confined to this boundary. */
/**
 * Pure mapping of the Lebull (sbteam "betting-platform") JSON to `SourceEvent` / `SourceMarket`.
 *
 * The API answers in English whatever `lang` says, so market and selection names are translated
 * here by `stakeTypeId` (stable) to the PT labels `canonicalKey` recognises. Types that are not
 * confidently translated keep the house's own label (English): they stay without a canonical key
 * and show only for Lebull. A wrong key is worse than none.
 */
import type { OddsSport, SourceEvent, SourceMarket } from '../../types';

/** Lebull sport ids. */
export const SPORT_ID: Record<OddsSport, number> = { FOOTBALL: 1, TENNIS: 3, BASKETBALL: 4 };

/**
 * `stakeTypes` requested with the calendar (the main market only):
 * football 1X2 (1); tennis winner (702); basketball winner incl. overtime (702) and 1X2 in regular time (1).
 */
export const MAIN_STAKE_TYPES: Record<OddsSport, number[]> = { FOOTBALL: [1], TENNIS: [702], BASKETBALL: [702, 1] };

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** ISO codes of the countries Lebull lists (flagcdn also takes the UK nations). */
const COUNTRY_CODE: Record<string, string> = {
  Austria: 'AT', Argentina: 'AR', Austraila: 'AU', Australia: 'AU', Belgium: 'BE', Belarus: 'BY', 'Bosnia-Herzegovina': 'BA', Brazil: 'BR',
  Bulgaria: 'BG', Chile: 'CL', Colombia: 'CO', 'Costa Rica': 'CR', Croatia: 'HR', Cyprus: 'CY', 'Czech Republic': 'CZ', Denmark: 'DK',
  Ecuador: 'EC', Egypt: 'EG', England: 'GB-ENG', Estonia: 'EE', Europe: 'EU', France: 'FR', Georgia: 'GE', Germany: 'DE', Greece: 'GR',
  Guatemala: 'GT', Hungary: 'HU', India: 'IN', Indonesia: 'ID', Iran: 'IR', Israel: 'IL', Italy: 'IT', Japan: 'JP', Malaysia: 'MY',
  Mexico: 'MX', Netherlands: 'NL', 'Northern Ireland': 'GB-NIR', Norway: 'NO', Paraguay: 'PY', Peru: 'PE', Poland: 'PL', Portugal: 'PT',
  Qatar: 'QA', Romania: 'RO', 'Saudi Arabia': 'SA', Scotland: 'GB-SCT', Serbia: 'RS', Singapore: 'SG', Slovakia: 'SK', Slovenia: 'SI',
  'South Africa': 'ZA', 'South Korea': 'KR', Spain: 'ES', Sweden: 'SE', Switzerland: 'CH', Thailand: 'TH', Tunisia: 'TN', Turkey: 'TR',
  USA: 'US', Ukraine: 'UA', Uruguay: 'UY', Wales: 'GB-WLS',
};

/** "England. Premier League" → "Premier League" (football and basketball only; tennis names keep the tour). */
export function competitionName(leagueName: string, sport: OddsSport): string {
  const name = clean(leagueName);
  if (sport === 'TENNIS') return name;
  const m = name.match(/^[^.]{2,40}\.\s+(.+)$/);
  return m ? m[1]!.trim() : name;
}

/** Start time: `timestamp` (ms, UTC). `date` carries the server's UTC+4 clock read as UTC (4 h behind) and must not be used. */
export function startsAtOf(raw: any): string | null {
  const ts = Number(raw?.timestamp);
  return Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : null;
}

interface Ctx {
  sport: OddsSport;
  home: string;
  away: string;
}

const num = (n: number) => String(n);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const isHalfLine = (n: number) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9 && Math.abs(n % 1) === 0.5;
const isQuarterLine = (n: number) => Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 && !isHalfLine(n) && n % 1 !== 0;

/** Side of a selection named after a participant: "1" / "2" / "X", or null. */
function sideOfName(name: string, ctx: Ctx): '1' | '2' | 'X' | null {
  const n = clean(name).toLowerCase();
  if (n === 'x' || n === 'draw') return 'X';
  if (n === clean(ctx.home).toLowerCase()) return '1';
  if (n === clean(ctx.away).toLowerCase()) return '2';
  return null;
}

/** "Over"/"Under" → "Mais de"/"Menos de" (null when it is neither). */
function overUnderWord(name: string): 'Mais de' | 'Menos de' | null {
  const n = clean(name).toLowerCase();
  if (n === 'over') return 'Mais de';
  if (n === 'under') return 'Menos de';
  return null;
}

const YES_NO: Record<string, string> = { yes: 'Sim', no: 'Não' };

interface Row {
  market: string;
  selection: string;
  line?: number | null;
}

type StakeMapper = (stake: any, ctx: Ctx) => Row | null;

const arg = (stake: any): number | null => {
  const a = stake?.stakeArgument;
  if (a === null || a === undefined || a === '') return null;
  const n = Number(a);
  return Number.isFinite(n) ? n : null;
};

/** "Over 2.5" / "Under 2.5" under `market`; null when it is not an over/under stake. */
function overUnder(market: string, stake: any): Row | null {
  const word = overUnderWord(stake.stakeName);
  const line = arg(stake);
  if (!word || line === null) return null;
  return { market, selection: `${word} ${num(line)}`, line };
}

/** Participant-named handicap: "<name> (-1.5)". Whole and quarter lines are 2-way (push) markets: not the 3-way handicap. */
function handicap(market: string, asian: string, stake: any, ctx: Ctx): Row | null {
  const line = arg(stake);
  const side = /^handicap 1$/i.test(clean(stake.stakeName)) ? ctx.home : /^handicap 2$/i.test(clean(stake.stakeName)) ? ctx.away : null;
  if (line === null || !side) return null;
  return { market: isHalfLine(line) ? market : asian, selection: `${side} (${signed(line)})`, line };
}

// ─── Football ────────────────────────────────────────────────────────────────

const HTFT_SIDE: Record<string, string> = { win1: '1', win2: '2', x: 'X', draw: 'X' };

const FOOTBALL: Record<number, StakeMapper> = {
  1: (s, c) => {
    const side = sideOfName(s.stakeName, c);
    return side ? { market: 'Resultado Final', selection: side } : null;
  },
  3: (s) => {
    const line = arg(s);
    if (line !== null && isQuarterLine(line)) return overUnder('Total de Golos Asiático', s);
    return overUnder('Total de Golos Mais/Menos', s);
  },
  2: (s, c) => handicap('Handicap', 'Handicap Asiático', s, c),
  26: (s) => (YES_NO[clean(s.stakeName).toLowerCase()] ? { market: 'Ambas as Equipas Marcam', selection: YES_NO[clean(s.stakeName).toLowerCase()]! } : null),
  37: (s) => (/^(1x|12|x2)$/i.test(clean(s.stakeName)) ? { market: 'Hipótese Dupla', selection: clean(s.stakeName).toUpperCase() } : null),
  274556: (s, c) => {
    const side = sideOfName(s.stakeName, c);
    return side === '1' || side === '2' ? { market: 'Empate Anula Aposta', selection: side === '1' ? c.home : c.away } : null;
  },
  69: (s, c) => overUnder(`Total de Golos - ${c.home}`, s),
  75: (s, c) => overUnder(`Total de Golos - ${c.away}`, s),
  4: (s) => {
    const parts = clean(s.stakeName).toLowerCase().split('/');
    const [a, b] = [HTFT_SIDE[parts[0] ?? ''], HTFT_SIDE[parts[1] ?? '']];
    return parts.length === 2 && a && b ? { market: 'Intervalo/Final', selection: `${a}/${b}` } : null;
  },
  682: (s) => (/^\d+:\d+$/.test(clean(s.stakeName)) ? { market: 'Resultado Exato', selection: clean(s.stakeName).replace(':', '-') } : null),
};

// ─── Basketball ──────────────────────────────────────────────────────────────

const BASKETBALL: Record<number, StakeMapper> = {
  702: (s, c) => (sideOfName(s.stakeName, c) === '1' || sideOfName(s.stakeName, c) === '2' ? { market: 'Vencedor (incl. prolongamento)', selection: clean(s.stakeName) } : null),
  1: (s, c) => (sideOfName(s.stakeName, c) ? { market: 'Resultado 1X2 (sem prolongamento)', selection: sideOfName(s.stakeName, c) === 'X' ? 'X' : clean(s.stakeName) } : null),
  2: (s, c) => handicap('Handicap', 'Handicap Asiático', s, c),
  3: (s) => overUnder('Total de Pontos Mais/Menos', s),
  69: (s, c) => overUnder(`Total de Pontos - ${c.home}`, s),
  75: (s, c) => overUnder(`Total de Pontos - ${c.away}`, s),
};

/** Scoped basketball types ("1st Half: Total", "3rd Quarter: Result"): by the house name, which carries the scope. */
const BASKETBALL_SCOPE: Record<string, string> = {
  '1st half': '1ª Parte', '2nd half': '2ª Parte',
  '1st quarter': '1º Quarto', '2nd quarter': '2º Quarto', '3rd quarter': '3º Quarto', '4th quarter': '4º Quarto',
};

function basketballScoped(typeName: string, stake: any, ctx: Ctx): Row | null {
  const m = clean(typeName).toLowerCase().match(/^(1st half|2nd half|1st quarter|2nd quarter|3rd quarter|4th quarter): (.+)$/);
  if (!m) return null;
  const scope = BASKETBALL_SCOPE[m[1]!]!;
  const what = m[2]!;
  const side = sideOfName(stake.stakeName, ctx);
  switch (what) {
    case 'result':
      return side ? { market: `${scope} - Resultado 1X2`, selection: side === 'X' ? 'X' : clean(stake.stakeName) } : null;
    case 'result (without draw)':
      return side === '1' || side === '2' ? { market: `${scope} - Vencedor (sem empate)`, selection: clean(stake.stakeName) } : null;
    case 'handicap':
      return handicap(`${scope} - Handicap`, `${scope} - Handicap Asiático`, stake, ctx);
    case 'total':
      return overUnder(`${scope} - Total de Pontos`, stake);
    case 'total team 1':
      return overUnder(`${scope} - Total de Pontos - ${ctx.home}`, stake);
    case 'total team 2':
      return overUnder(`${scope} - Total de Pontos - ${ctx.away}`, stake);
    default:
      return null;
  }
}

// ─── Tennis ──────────────────────────────────────────────────────────────────

const TENNIS: Record<number, StakeMapper> = {
  702: (s, c) => (sideOfName(s.stakeName, c) === '1' || sideOfName(s.stakeName, c) === '2' ? { market: 'Vencedor', selection: clean(s.stakeName) } : null),
  2: (s, c) => handicap('Handicap de Jogos', 'Handicap de Jogos Asiático', s, c),
  3: (s) => overUnder('Total de Jogos', s),
  5: (s) => {
    const m = clean(s.stakeName).match(/^(\d):(\d)$/);
    return m ? { market: 'Resultado Exato em Sets', selection: `${m[1]}-${m[2]}` } : null;
  },
};

const TENNIS_SET: Record<string, string> = { '1st': '1.º', '2nd': '2.º', '3rd': '3.º', '4th': '4.º', '5th': '5.º' };

function tennisScoped(typeName: string, stake: any, ctx: Ctx): Row | null {
  const m = clean(typeName).toLowerCase().match(/^(1st|2nd|3rd|4th|5th) set: (.+)$/);
  if (!m) return null;
  const set = TENNIS_SET[m[1]!]!;
  if (m[2] === 'winner') {
    const side = sideOfName(stake.stakeName, ctx);
    return side === '1' || side === '2' ? { market: `${set} Set - Vencedor`, selection: clean(stake.stakeName) } : null;
  }
  return null;
}

const MAPPERS: Record<OddsSport, Record<number, StakeMapper>> = { FOOTBALL: FOOTBALL, BASKETBALL: BASKETBALL, TENNIS: TENNIS };

/** House labels for the types that are not translated: the name as sent, plus the line when there is one. */
function fallback(typeName: string, stake: any): Row | null {
  const name = clean(stake.stakeName);
  const line = arg(stake);
  if (!typeName || !name) return null;
  return { market: typeName, selection: line === null ? name : `${name} ${num(line)}`, line };
}

// ─── Markets ─────────────────────────────────────────────────────────────────

/** `stakeTypes` of a Lebull event (calendar or `/games/{id}/prematch`) → `SourceMarket[]`. */
export function mapStakeTypes(stakeTypes: any[] | undefined, ctx: Ctx): SourceMarket[] {
  const out: SourceMarket[] = [];
  const seen = new Set<string>();
  for (const type of stakeTypes ?? []) {
    const typeName = clean(type?.stakeTypeName);
    const id = Number(type?.stakeTypeId);
    const mapper = MAPPERS[ctx.sport][id];
    for (const stake of Array.isArray(type?.stakes) ? type.stakes : []) {
      const odds = Number(stake?.betFactor);
      if (!Number.isFinite(odds) || odds <= 0 || stake?.isDeleted === true || stake?.isDuplicate === true) continue;
      let row: Row | null = mapper ? mapper(stake, ctx) : null;
      if (!row && ctx.sport === 'BASKETBALL') row = basketballScoped(typeName, stake, ctx);
      if (!row && ctx.sport === 'TENNIS') row = tennisScoped(typeName, stake, ctx);
      row ??= fallback(typeName, stake);
      if (!row) continue;
      const k = `${row.market}\u0000${row.selection}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        marketLabel: row.market,
        selectionLabel: row.selection,
        line: row.line ?? null,
        odds,
        suspended: stake.isActive === false || odds <= 1,
      });
    }
  }
  return out;
}

/** Sport of a Lebull `sportId`, or null when the comparator does not cover it. */
export function sportOfId(sportId: unknown): OddsSport | null {
  return (Object.keys(SPORT_ID) as OddsSport[]).find((s) => SPORT_ID[s] === Number(sportId)) ?? null;
}

/** Body of `/games/{id}/prematch` (or `/live`) → markets; the sport comes from the body unless given. */
export function mapPrematch(body: any, sportHint?: OddsSport): SourceMarket[] {
  const sport = sportHint ?? sportOfId(body?.sportId);
  if (!sport) return [];
  const home = clean(body?.teamA);
  const away = clean(body?.teamB);
  if (!home || !away) return [];
  return mapStakeTypes(body?.stakeTypes, { sport, home, away });
}

// ─── Events ──────────────────────────────────────────────────────────────────

/** One game of a league listing → `SourceEvent`; null when it is not a two-sided game with a valid start. */
export function mapEvent(raw: any, sport: OddsSport): SourceEvent | null {
  const id = clean(raw?.eventId);
  const home = clean(raw?.teamA);
  const away = clean(raw?.teamB);
  const startsAt = startsAtOf(raw);
  if (!/^\d+$/.test(id) || !home || !away || !startsAt || raw?.isOutright === true) return null;
  const marketCount = Number(raw.oddsCount);
  const countryCode = COUNTRY_CODE[clean(raw.countryName)];
  const mainMarkets = mapStakeTypes(raw.stakeTypes, { sport, home, away });
  return {
    house: 'lebull',
    houseEventId: id,
    sport,
    competition: competitionName(raw.leagueName, sport),
    home,
    away,
    startsAt,
    live: raw.isLive === true,
    ...(Number.isFinite(marketCount) && marketCount > 0 ? { marketCount } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(mainMarkets.length ? { mainMarkets } : {}),
  };
}

/** A league listing (`/leagues/{id}/upcoming` → `[{ games }]`) → events. */
export function mapLeagueGames(body: any, sport: OddsSport): SourceEvent[] {
  const leagues: any[] = Array.isArray(body) ? body : [];
  const out: SourceEvent[] = [];
  for (const league of leagues) {
    for (const game of Array.isArray(league?.games) ? league.games : []) {
      const ev = mapEvent({ countryName: league.countryName, leagueName: league.leagueName, ...game }, sport);
      if (ev) out.push(ev);
    }
  }
  return out;
}

/** A league of the `/sports` tree that has events. */
export interface TreeLeague {
  leagueId: number;
  leagueName: string;
  eventsCount: number;
  inplayEventsCount: number;
}

/** The leagues of one sport in the `/sports` tree, those with events, most events first. */
export function treeLeagues(tree: any, sport: OddsSport): TreeLeague[] {
  const entry = (tree?.sports ?? []).find((s: any) => Number(s?.sportId) === SPORT_ID[sport]);
  const out: TreeLeague[] = [];
  for (const country of entry?.countries ?? []) {
    for (const l of country?.leagues ?? []) {
      const eventsCount = Number(l?.eventsCount);
      const leagueId = Number(l?.leagueId);
      if (Number.isFinite(leagueId) && leagueId > 0 && eventsCount > 0) {
        out.push({ leagueId, leagueName: clean(l.leagueName), eventsCount, inplayEventsCount: Number(l.inplayEventsCount) || 0 });
      }
    }
  }
  return out.sort((a, b) => b.eventsCount - a.eventsCount || a.leagueId - b.leagueId);
}
