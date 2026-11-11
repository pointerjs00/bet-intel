// apps/api/src/services/marketResolutionEngine.ts
//
// Resolves a football BoletinItem (market + selection) against a fixture result.
//
// The market/selection pair is parsed into one or more "legs" (match result, double chance,
// totals, both-teams-to-score, HT/FT, correct score, draw-no-bet). Combined Betclic markets
// such as "FC Porto vence ou empata e Acima de 1,5 golos" become several legs that must all win.
//
// Returns WON / LOST / VOID, or null when the bet cannot be settled with certainty
// (unknown market, unrecognised team name, missing data such as corners). Null means
// "flag for manual review" — never guess.

import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveAlias } from '../utils/teamAliases';
import { COUNTRY_PT_TO_EN } from '../utils/countryNames';

export type Resolution = 'WON' | 'LOST' | 'VOID';

/** Final state of the fixture. Scores are the official 90-minute result unless stated otherwise. */
export interface FixtureResult {
  homeScore: number;
  awayScore: number;
  htHomeScore: number | null;
  htAwayScore: number | null;
  /** "FT" | "AET" | "PEN" | "CANC" | "PST" | "ABD" | ... */
  statusShort: string;
  /** Regular-time (90') score. Required to settle FT markets when the match went to extra time. */
  regularHomeScore?: number | null;
  regularAwayScore?: number | null;
  /** Total corners per team, when known. */
  homeCorners?: number | null;
  awayCorners?: number | null;
  /** Cards per team (yellow and red count 1 each). */
  homeCards?: number | null;
  awayCards?: number | null;
  /** Red cards per team: used to send close card totals to review (booking rules differ). */
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  homeShots?: number | null;
  awayShots?: number | null;
  homeShotsOnTarget?: number | null;
  awayShotsOnTarget?: number | null;
  homeFouls?: number | null;
  awayFouls?: number | null;
  homeOffsides?: number | null;
  awayOffsides?: number | null;
  /** Corners / cards split by half, when known. */
  cornersByHalf?: { first: { home: number; away: number }; second: { home: number; away: number } } | null;
  cardsByHalf?: { first: { home: number; away: number }; second: { home: number; away: number } } | null;
  /** Goals in order (regular time). null = the provider gave no event list. */
  goals?: GoalEvent[] | null;
  /** Substitutions, for "scorer or his substitute" and late-entry rules. */
  subs?: Array<{ playerIn: string; playerOut: string | null; minute: number }> | null;
  /** Players who took part (started or came on) and their stats. null = no line-ups. */
  players?: PlayerLine[] | null;
}

export interface GoalEvent {
  side: 'H' | 'A';
  player: string | null;
  assist: string | null;
  /** Minute of the match (stoppage time folded in: 45'+2 → 47). */
  minute: number;
  ownGoal: boolean;
  penalty: boolean;
}

export interface PlayerLine {
  name: string;
  side: 'H' | 'A';
  started: boolean;
  subbedIn: boolean;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  cards: number;
}

/** How far the match is, for deciding whether a bet is already settled mid-match. */
export type MatchPhase = 'FIRST_HALF' | 'HALFTIME' | 'SECOND_HALF' | 'FINISHED';

/** Names that identify each side, used to map selections such as "SL Benfica vence". */
export interface MatchContext {
  homeNames: string[];
  awayNames: string[];
}

type Side = 'H' | 'D' | 'A';
type Period = 'FT' | '1H' | '2H';

type TeamStat = 'goals' | 'corners' | 'cards' | 'shots' | 'shotsOnTarget' | 'fouls' | 'offsides';
type PlayerStat = 'goals' | 'assists' | 'shots' | 'shotsOnTarget' | 'fouls';
type ScorerMode = 'ANY' | 'FIRST' | 'LAST' | 'NTH' | 'COUNT';

type Leg =
  | { kind: 'RESULT'; period: Period; outcomes: Side[] }
  | { kind: 'TOTAL'; period: Period; stat: TeamStat; over: boolean; line: number; team?: 'H' | 'A' }
  | { kind: 'BTTS'; period: Period; yes: boolean }
  | { kind: 'HTFT'; ht: Side; ft: Side }
  | { kind: 'SCORE'; home: number; away: number }
  | { kind: 'DNB'; side: 'H' | 'A' }
  /** European handicap (a draw after the handicap is a separate outcome) or Asian (whole line pushes). */
  | { kind: 'HANDICAP'; side: 'H' | 'A'; line: number; asian: boolean; period: Period }
  /** player null = "no goal". n: goal number (NTH) or minimum goals (COUNT). */
  | { kind: 'SCORER'; mode: ScorerMode; player: string | null; n?: number; orAssist?: boolean; orSub?: boolean }
  | { kind: 'PLAYER_STAT'; player: string; stat: PlayerStat; over: boolean; line: number }
  | { kind: 'PLAYER_CARD'; player: string }
  /** First team to score; side null = no goal. */
  | { kind: 'FIRST_GOAL'; side: 'H' | 'A' | null }
  | { kind: 'PARITY'; period: Period; even: boolean };

interface ParsedBet { legs: Leg[]; mode: 'ALL' | 'ANY'; extraTimeIncluded: boolean }

// ─── Text helpers ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC_TOKENS = new Set(['fc', 'sc', 'sl', 'cd', 'cf', 'ac', 'afc', 'sad', 'de', 'da', 'do', 'the', 'sk', 'bk', 'fk', 'ssc', 'as', 'us', 'cp', 'ud', 'rc', 'rcd', 'vfb', 'vfl', 'tsg', 'sv', 'futebol', 'football']);

/** Portuguese names used by Betclic and similar sites → international names. Keys are normalised. */
const PT_TEAM_NAMES: Record<string, string> = {
  estugarda: 'vfb stuttgart', 'bayern munique': 'bayern munich', hamburgo: 'hamburger sv', colonia: 'koln',
  friburgo: 'freiburg', moguncia: 'mainz', 'borussia monchengladbach': 'monchengladbach',
  napoles: 'napoli', 'inter milao': 'inter', milao: 'milan', 'ac milao': 'milan', turim: 'torino', genova: 'genoa',
  florenca: 'fiorentina', 'atletico madrid': 'atletico madrid', sevilha: 'sevilla', valencia: 'valencia',
  corunha: 'deportivo la coruna', 'paris sg': 'paris saint germain', psg: 'paris saint germain', marselha: 'marseille', liao: 'lyon', bordeus: 'bordeaux', estrasburgo: 'strasbourg',
  bruges: 'club brugge', copenhaga: 'copenhagen', basileia: 'basel', zurique: 'zurich', eindhoven: 'psv',
  'estrela vermelha': 'crvena zvezda', 'dinamo zagreb': 'dinamo zagreb', atenas: 'aek athens',
};

// National teams: Portuguese country names → the English names ESPN uses (normalised).
const PT_COUNTRY_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_PT_TO_EN).map(([pt, en]) => [normaliseTeamName(pt), normaliseTeamName(en)]),
);

function teamKey(name: string): string {
  // Hyphens as spaces: "Paris Saint-Germain" must equal "Paris Saint Germain" (and "Paris SG").
  const n = normaliseTeamName(name.replace(/[-–]/g, ' '));
  return resolveAlias(PT_TEAM_NAMES[n] ?? PT_COUNTRY_KEYS[n] ?? n);
}

function significantTokens(s: string): string[] {
  return teamKey(s).split(' ').filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

/** True when two team names refer to the same club (aliases, Portuguese names, "FC"/"SL" prefixes). */
export function teamNamesMatch(a: string, b: string): boolean {
  return nameMatches(a, b) || nameMatches(b, a);
}

function nameMatches(text: string, name: string): boolean {
  const a = teamKey(text);
  const b = teamKey(name);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const ta = significantTokens(text);
  const tb = new Set(significantTokens(name));
  return (ta.length > 0 && ta.every((t) => tb.has(t))) || sameTransliteratedPerson(a, b);
}

/** "Alexander Shevchenko" = "Aleksandr Shevchenko": same surname, first names alike in their first 3 letters. */
export function sameTransliteratedPerson(a: string, b: string): boolean {
  const x = a.split(' ').filter(Boolean);
  const y = b.split(' ').filter(Boolean);
  if (x.length < 2 || y.length < 2) return false;
  const lx = x[x.length - 1], ly = y[y.length - 1];
  return lx.length >= 4 && lx === ly && x[0].length >= 3 && y[0].length >= 3 && x[0].slice(0, 3) === y[0].slice(0, 3);
}

/**
 * How strongly two names denote the same team, for picking ONE team among many (search, history):
 * 3 = same name (after aliases / PT names), 2 = same significant words, 1 = loose match
 * (one contained in the other, e.g. "Sporting" in "Sporting Gijón"), 0 = different.
 */
export function teamMatchScore(a: string, b: string): number {
  const ka = teamKey(a);
  const kb = teamKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 3;
  const ta = [...new Set(significantTokens(a))].sort().join(' ');
  const tb = [...new Set(significantTokens(b))].sort().join(' ');
  if (ta && ta === tb) return 2;
  return teamNamesMatch(a, b) ? 1 : 0;
}

/** Maps a team name found in a selection to the home or away side; null when ambiguous or unknown. */
function sideOf(text: string, ctx?: MatchContext): 'H' | 'A' | null {
  if (!ctx || !text.trim()) return null;
  const key = teamKey(text);
  const exactHome = ctx.homeNames.some((n) => teamKey(n) === key);
  const exactAway = ctx.awayNames.some((n) => teamKey(n) === key);
  if (exactHome !== exactAway) return exactHome ? 'H' : 'A';
  const home = ctx.homeNames.some((n) => nameMatches(text, n));
  const away = ctx.awayNames.some((n) => nameMatches(text, n));
  if (home === away) return null;
  return home ? 'H' : 'A';
}

const DRAW_WORDS = new Set(['x', 'empate', 'draw']);
const HOME_WORDS = new Set(['1', 'casa', 'home']);
const AWAY_WORDS = new Set(['2', 'fora', 'away']);

/** Parses one outcome token ("1", "X", "empate", "SL Benfica", "SL Benfica vence"). */
function outcomeOf(raw: string, ctx?: MatchContext): Side | null {
  const t = raw.replace(/\b(vence|ganha|vitoria|win|wins)\b/g, '').trim();
  if (DRAW_WORDS.has(t)) return 'D';
  if (HOME_WORDS.has(t)) return 'H';
  if (AWAY_WORDS.has(t)) return 'A';
  return sideOf(t, ctx);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

// Markets that need data we don't have (aggregate over two legs, goal minute, which half has more
// goals, exact corner count, other sports' props). They go to review.
const UNSUPPORTED = /\b(eliminatoria|qualifica|touchdown|ressaltos|minuto|intervalos|mais cantos|metade|exato de cantos|exacto|cabeca|fora da area|livre direto|substituto do)\b/;

function periodOf(raw: string): Period {
  const text = raw.replace(/intervalo\/final|ht\/ft/g, ' ');
  if (/\b(primeira parte|1a parte|1\.a parte|1st half|first half|intervalo)\b/.test(text)) return '1H';
  if (/\b(segunda parte|2a parte|2\.a parte|2nd half|second half)\b/.test(text)) return '2H';
  return 'FT';
}

function statOf(text: string): TeamStat {
  if (/\bcanto/.test(text)) return 'corners';
  if (/\bcart(ao|oes)\b|\bcards?\b/.test(text)) return 'cards';
  if (/remates? (a|na) baliza|remates? enquadrados?|shots? on target/.test(text)) return 'shotsOnTarget';
  if (/\bremates?\b|\bshots?\b/.test(text)) return 'shots';
  if (/\bfaltas?\b|\bfouls?\b/.test(text)) return 'fouls';
  if (/foras? de jogo|offsides?/.test(text)) return 'offsides';
  return 'goals';
}

/** Player stat named by a player-prop market ("Remates à baliza do jogador", "Assistências"). */
function playerStatOf(text: string): PlayerStat {
  if (/assistenc/.test(text)) return 'assists';
  const s = statOf(text);
  return s === 'shots' || s === 'shotsOnTarget' || s === 'fouls' ? s : 'goals';
}

const TOTAL_RE = /\b(mais de|acima de|over|menos de|abaixo de|under)\s*(\d+(?:\.\d+)?)/;

function parseTotal(text: string, market: string, ctx?: MatchContext): Leg | null {
  let m = text.match(TOTAL_RE);
  let line: number | null = m ? parseFloat(m[2]!) : null;
  let dir = m?.[1] ?? null;
  if (!m) {
    // Selection is just "Over"/"Mais"/"Under": take the line from the market.
    const bare = text.match(/^(mais|acima|over|menos|abaixo|under)$/);
    const mm = market.match(/(\d+(?:\.\d+)?)/);
    if (!bare || !mm) return null;
    dir = bare[1]!;
    line = parseFloat(mm[1]!);
  }
  if (line === null || dir === null) return null;
  const over = /mais|acima|over/.test(dir);
  const context = `${market} ${text}`;
  const before = m ? text.slice(0, m.index).replace(/[-–:]\s*$/, '').replace(/\b(marca|faz|tem|regista)$/, '').trim() : '';
  const team = before ? sideOf(before, ctx) : null;
  if (before && !team) {
    // "Gyökeres Mais de 1,5" in a player market: a player stat, never a team total.
    if (!/jogador|player|remate|assistenc|marcador|faltas? cometidas/.test(context)) return null;
    return { kind: 'PLAYER_STAT', player: before, stat: playerStatOf(context), over, line };
  }
  return { kind: 'TOTAL', period: periodOf(context), stat: statOf(context), over, line, ...(team ? { team } : {}) };
}

/** "Galatasaray (+4)", "Galatasaray +1.5", "FC Porto -1" in a handicap market. */
function parseHandicap(text: string, market: string, ctx?: MatchContext): Leg | null {
  const m = text.match(/^(.+?)\s*\(?\s*([+-]\d+(?:\.\d+)?)\s*\)?$/);
  if (!m) return null;
  const side = sideOf(m[1]!.replace(/\bvence\b/, '').trim(), ctx);
  if (!side) return null;
  return { kind: 'HANDICAP', side, line: parseFloat(m[2]!), asian: /asiatic|asian/.test(market), period: periodOf(market) };
}

const NO_GOAL = /^(nenhum|sem) (golo|golos|marcador)$|^nenhum$|^no goal(scorer)?$/;

/** Scorer markets: anytime, first, last, Nth goal, 2+/hat-trick, "scores or assists", "or his substitute". */
function parseScorer(text: string, market: string, ctx?: MatchContext): Leg | null {
  let mode: ScorerMode = 'ANY';
  let n: number | undefined;
  if (/primeiro (marcador|golo|a marcar)|first (goal)?scorer/.test(market)) mode = 'FIRST';
  else if (/ultimo (marcador|golo|a marcar)|last (goal)?scorer/.test(market)) mode = 'LAST';
  const nth = market.match(/proximo marcador.*?golo\s*(\d+)|golo\s*(\d+)\s*-?\s*marcador/);
  if (nth) { mode = 'NTH'; n = Number(nth[1] ?? nth[2]); }
  const count = `${market} ${text}`.match(/marca (\d|dois|tres) ou mais|pelo menos (\d) golos|\bbis\b|hat-?trick/);
  if (count && mode === 'ANY') {
    mode = 'COUNT';
    n = /hat-?trick|tres|3/.test(count[0]) ? 3 : 2;
  }
  const orAssist = /marca ou assiste|golo ou assistencia/.test(`${market} ${text}`);
  const orSub = /ou o seu substituto/.test(market);

  let name = text
    .replace(/\b(marca|marcar|marcador|a qualquer momento|em qualquer momento|ou assiste|(dois|tres|\d) ou mais( golos)?|um golo|golo)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (NO_GOAL.test(name) || NO_GOAL.test(text)) {
    return mode === 'ANY' || mode === 'COUNT' ? null : { kind: 'SCORER', mode, player: null, n };
  }
  if (!name) return null;
  // "Benfica marca": a team to score, not a player.
  const team = sideOf(name, ctx);
  if (team) return mode === 'ANY' ? { kind: 'TOTAL', period: periodOf(market), stat: 'goals', over: true, line: 0.5, team } : null;
  name = name.replace(/\bvence$/, '').trim();
  return { kind: 'SCORER', mode, player: name, n, orAssist, orSub };
}

function isBttsMarket(market: string): boolean {
  return /\b(ambas|as duas equipas marcam|duas equipas marcam|btts|both teams)\b/.test(market);
}

function isResultMarket(market: string): boolean {
  return /\b(resultado|1x2|vencedor|dupla|hipotese|double chance|vence)\b/.test(market);
}

/** Parses one leg of a selection, using the market text as context. */
function parseLeg(text: string, market: string, ctx?: MatchContext): Leg | null {
  let t = text.replace(/\btempo reg(ulamentar)?\.?/g, '').trim();
  // Bet-builder shorthand: "+1.5 Golos" / "-2.5 Golos" (Betclic "X vence & +1.5 Golos").
  // Only with the "golos" suffix, so handicap lines like "+1" are never read as totals.
  const shortTotal = t.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*golos?$/);
  if (shortTotal) t = `${shortTotal[1] === '+' ? 'mais de' : 'menos de'} ${shortTotal[2]}`;
  t = t.replace(/\bgolos?$/, '').trim();
  if (!t) return null;

  // HT/FT: "SL Benfica vence intervalo/final", "Empate / Arsenal", "1/1"
  if (/intervalo\/final|ht\/ft/.test(market) || /intervalo\/final/.test(t)) {
    const both = t.match(/^(.+?)\s+vence\s+intervalo\/final$/);
    if (both) {
      const s = outcomeOf(both[1]!, ctx);
      return s ? { kind: 'HTFT', ht: s, ft: s } : null;
    }
    const pair = t.split(/\s*\/\s*/);
    if (pair.length === 2) {
      const ht = outcomeOf(pair[0]!, ctx);
      const ft = outcomeOf(pair[1]!, ctx);
      if (ht && ft) return { kind: 'HTFT', ht, ft };
    }
    if (/intervalo\/final|ht\/ft/.test(market) && !TOTAL_RE.test(t)) return null;
  }

  if (/handicap/.test(market) && !TOTAL_RE.test(t)) return parseHandicap(t, market, ctx);

  // Player to be booked: "Pepe recebe um cartão", market "Jogador a ver cartão".
  if (/(recebe|ver|mostrado|leva)( um)? cart(ao|oes)|jogador.*cart(ao|oes)|cart(ao|oes).*jogador/.test(`${market} ${t}`) && !TOTAL_RE.test(t)) {
    const name = t.replace(/\b(recebe|ver|a ver|mostrado|leva|um|cartao|cartoes|amarelo|vermelho)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return name && !sideOf(name, ctx) ? { kind: 'PLAYER_CARD', player: name } : null;
  }

  // First team to score
  if (/primeira equipa a marcar|equipa a marcar primeiro|marca primeiro|first team to score/.test(market)) {
    if (NO_GOAL.test(t) || /^(nenhuma|nenhum golo|sem golos)$/.test(t)) return { kind: 'FIRST_GOAL', side: null };
    const s = sideOf(t.replace(/\b(marca primeiro|vence)\b/g, '').trim(), ctx);
    return s ? { kind: 'FIRST_GOAL', side: s } : null;
  }

  // Odd / even goals
  if (/\bimpar\b|odd\/even|par\/|\/par\b/.test(market) && /^(par|impar|even|odd)$/.test(t)) {
    return { kind: 'PARITY', period: periodOf(market), even: /^(par|even)$/.test(t) };
  }

  if (TOTAL_RE.test(t) || /^(mais|acima|over|menos|abaixo|under)$/.test(t)) return parseTotal(t, market, ctx);

  // Scorers: "Luis Suárez marca", market "Marcador a qualquer momento", "Primeiro marcador"…
  // (In "Jogador marca e Equipa vence" the "Sporting CP vence" piece is a result leg, not a scorer.)
  const resultPiece = /\bvence\b|^(x|1|2|empate)$/.test(t) && !/\bmarca\b/.test(t);
  if (!resultPiece && !isBttsMarket(market) && (/\bmarcador|\bmarca\b|marcar|scorer|hat-?trick/.test(market) || /\bmarca\b/.test(t))) {
    return parseScorer(t, market, ctx);
  }

  // Both teams to score
  if (/^(sim|yes|s)$/.test(t) && isBttsMarket(market)) return { kind: 'BTTS', period: periodOf(market), yes: true };
  if (/^(nao|no|n)$/.test(t) && isBttsMarket(market)) return { kind: 'BTTS', period: periodOf(market), yes: false };
  if (/^(ambas|as duas equipas) marcam$/.test(t)) return { kind: 'BTTS', period: periodOf(market), yes: true };

  // Correct score
  const sc = t.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (sc && /\b(resultado corret|resultado exat|marcador corret|correct score)/.test(market)) {
    return { kind: 'SCORE', home: parseInt(sc[1]!, 10), away: parseInt(sc[2]!, 10) };
  }

  // Draw no bet
  if (/\b(empate anula|draw no bet|sem empate)\b/.test(market)) {
    const s = sideOf(t, ctx);
    return s ? { kind: 'DNB', side: s } : null;
  }

  const period = periodOf(market);
  if (/\b(dupla|duplo|hipotese|double)\b/.test(market)) t = t.replace(/\s*\/\s*/, ' ou ');

  // Double chance codes
  const dc: Record<string, Side[]> = { '1x': ['H', 'D'], x1: ['H', 'D'], '12': ['H', 'A'], '21': ['H', 'A'], x2: ['D', 'A'], '2x': ['D', 'A'] };
  if (dc[t] && /\b(dupla|hipotese|double|resultado duplo)\b/.test(market)) return { kind: 'RESULT', period, outcomes: dc[t]! };

  // "<team> vence ou empata" / "<team> ou empate" / "empate ou <team>" / "<a> ou <b> vence"
  const vOuE = t.match(/^(.+?)\s+vence ou empata$/);
  if (vOuE) {
    const s = outcomeOf(vOuE[1]!, ctx);
    return s && s !== 'D' ? { kind: 'RESULT', period, outcomes: [s, 'D'] } : null;
  }
  if (/\sou\s/.test(t)) {
    const parts = t.replace(/\s+vence$/, '').split(/\s+ou\s+/);
    if (parts.length !== 2) return null;
    const a = outcomeOf(parts[0]!, ctx);
    const b = outcomeOf(parts[1]!, ctx);
    if (!a || !b || a === b) return null;
    return { kind: 'RESULT', period, outcomes: [a, b] };
  }

  // Single outcome: "1", "X", "Empate", "SL Benfica", "SL Benfica vence"
  if (isResultMarket(market) || /\bvence\b/.test(t)) {
    const s = outcomeOf(t, ctx);
    return s ? { kind: 'RESULT', period, outcomes: [s] } : null;
  }
  return null;
}

/** Splits a selection/market into leg texts. Returns null when the bet cannot be parsed. */
export function parseBet(market: string, selection: string, ctx?: MatchContext): ParsedBet | null {
  const m = norm(market);
  let s = norm(selection);
  if (UNSUPPORTED.test(m) || UNSUPPORTED.test(s)) return null;

  const extraTimeIncluded = /prolongamento incluido|incl\.? prolongamento|extra time included/.test(`${m} ${s}`);
  s = s.replace(/\b(prolongamento incluido|incl\.? prolongamento)\b/g, '').trim();
  // Keep HT/FT phrases intact before splitting on " e ".
  s = s.replace(/\s+vence ao intervalo e no final\b/, ' vence intervalo/final').replace(/\s+vence intervalo e final\b/, ' vence intervalo/final');

  // "X ou Y" combinations of two different markets (e.g. "As duas equipas marcam ou Acima de 2,5")
  if (/marcam ou (mais|acima)/.test(m) && /^(sim|yes)$/.test(s)) {
    const total = parseTotal(m.slice(m.search(/(mais|acima) de/)), m, ctx);
    if (!total) return null;
    return { legs: [{ kind: 'BTTS', period: periodOf(m), yes: true }, total], mode: 'ANY', extraTimeIncluded };
  }

  // Market encodes the combination and the selection only says "Sim" (e.g. "Ambas equipas marcam e Acima de 2,5 golos")
  if (/^(sim|yes)$/.test(s) && isBttsMarket(m) && TOTAL_RE.test(m)) {
    const total = parseTotal(m.slice(m.search(TOTAL_RE)), m, ctx);
    if (!total) return null;
    return { legs: [{ kind: 'BTTS', period: periodOf(m), yes: true }, total], mode: 'ALL', extraTimeIncluded };
  }

  const pieces = s.split(/\s+e\s+|\s*&\s*|\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  const legs: Leg[] = [];
  for (const piece of pieces) {
    const leg = parseLeg(piece, m, ctx);
    if (!leg) return null;
    legs.push(leg);
  }
  return legs.length ? { legs, mode: 'ALL', extraTimeIncluded } : null;
}


// ─── Evaluation ──────────────────────────────────────────────────────────────

type Count = { h: number; a: number };

function sideFromScore(h: number, a: number): Side {
  return h > a ? 'H' : h < a ? 'A' : 'D';
}

function goalsFor(period: Period, f: FixtureResult, ft: Count): Count | null {
  if (period === 'FT') return ft;
  if (f.htHomeScore === null || f.htAwayScore === null) return null;
  if (period === '1H') return { h: f.htHomeScore, a: f.htAwayScore };
  return { h: ft.h - f.htHomeScore, a: ft.a - f.htAwayScore };
}

function overUnder(value: number, line: number, over: boolean): Resolution | null {
  if (value === line) return Number.isInteger(line) ? null : over ? 'WON' : 'LOST'; // whole lines: push rules vary
  return value > line === over ? 'WON' : 'LOST';
}

/** A team statistic for a period, or null when the provider did not give it. */
function teamStat(stat: TeamStat, period: Period, f: FixtureResult, ft: Count): Count | null {
  if (stat === 'goals') return goalsFor(period, f, ft);
  if (period !== 'FT') {
    const split = stat === 'corners' ? f.cornersByHalf : stat === 'cards' ? f.cardsByHalf : null;
    if (!split) return null;
    const half = period === '1H' ? split.first : split.second;
    return { h: half.home, a: half.away };
  }
  const pairs: Record<Exclude<TeamStat, 'goals'>, [number | null | undefined, number | null | undefined]> = {
    corners: [f.homeCorners, f.awayCorners],
    cards: [f.homeCards, f.awayCards],
    shots: [f.homeShots, f.awayShots],
    shotsOnTarget: [f.homeShotsOnTarget, f.awayShotsOnTarget],
    fouls: [f.homeFouls, f.awayFouls],
    offsides: [f.homeOffsides, f.awayOffsides],
  };
  const [h, a] = pairs[stat];
  return h == null || a == null ? null : { h, a };
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The player a selection names, among the match squads ("Pavlidis" → "Vangelis Pavlidis",
 * "L. Suárez" → "Luis Suárez"). 'AMBIGUOUS' when two players fit; null when none does.
 */
export function findPlayer<P extends { name: string }>(query: string, players: P[]): P | 'AMBIGUOUS' | null {
  const q = normName(query);
  if (!q) return null;
  const exact = players.filter((p) => normName(p.name) === q);
  if (exact.length === 1) return exact[0]!;
  const qt = q.split(' ');
  const hits = players.filter((p) => {
    const t = normName(p.name).split(' ');
    return qt.every((x) => (x.length === 1 ? t.some((y) => y.startsWith(x)) : t.includes(x)));
  });
  if (hits.length === 1) return hits[0]!;
  return hits.length > 1 || exact.length > 1 ? 'AMBIGUOUS' : null;
}

const samePlayer = (a: string | null | undefined, b: string) => Boolean(a) && normName(a!) === normName(b);

function evaluateScorer(leg: Extract<Leg, { kind: 'SCORER' }>, f: FixtureResult): Resolution | null {
  const goals = f.goals;
  if (!goals) return null;
  if (leg.player === null) {
    // "Nenhum golo" in first/last/next-scorer markets.
    if (leg.mode === 'NTH') return goals.length < (leg.n ?? 1) ? 'WON' : 'LOST';
    return goals.length === 0 ? 'WON' : 'LOST';
  }
  if (!f.players) return null;
  const p = findPlayer(leg.player, f.players);
  if (!p || p === 'AMBIGUOUS') return null;
  const played = p.started || p.subbedIn;
  const scored = goals.filter((g) => !g.ownGoal && samePlayer(g.player, p.name));

  if (leg.mode === 'ANY') {
    if (scored.length > 0) return 'WON';
    if (leg.orAssist && goals.some((g) => !g.ownGoal && samePlayer(g.assist, p.name))) return 'WON';
    if (!played) return 'VOID';
    if (leg.orSub) {
      const sub = f.subs?.find((s) => samePlayer(s.playerOut, p.name));
      if (sub) return goals.some((g) => !g.ownGoal && samePlayer(g.player, sub.playerIn)) ? 'WON' : 'LOST';
    }
    return 'LOST';
  }
  if (leg.mode === 'COUNT') return scored.length >= (leg.n ?? 2) ? 'WON' : played ? 'LOST' : 'VOID';

  if (!played) return 'VOID';
  const idx = leg.mode === 'FIRST' ? 0 : leg.mode === 'LAST' ? goals.length - 1 : (leg.n ?? 1) - 1;
  const g = goals[idx];
  if (!g) return 'LOST';
  if (g.ownGoal) return null; // own-goal rules differ per bookmaker
  // A substitute who came on after that goal: some bookmakers void, others settle as lost.
  if (!p.started && leg.mode !== 'LAST') {
    const sub = f.subs?.find((s) => samePlayer(s.playerIn, p.name));
    if (!sub || sub.minute > g.minute) return null;
  }
  return samePlayer(g.player, p.name) ? 'WON' : 'LOST';
}

function evaluateLeg(leg: Leg, f: FixtureResult, ft: Count): Resolution | null {
  switch (leg.kind) {
    case 'RESULT': {
      const g = goalsFor(leg.period, f, ft);
      return g ? (leg.outcomes.includes(sideFromScore(g.h, g.a)) ? 'WON' : 'LOST') : null;
    }
    case 'TOTAL': {
      const c = teamStat(leg.stat, leg.period, f, ft);
      if (!c) return null;
      const v = leg.team === 'H' ? c.h : leg.team === 'A' ? c.a : c.h + c.a;
      // A red card counts 1 here, but some bookmakers count a second yellow twice: close calls go to review.
      if (leg.stat === 'cards' && ((f.homeRedCards ?? 0) + (f.awayRedCards ?? 0)) > 0 && Math.abs(v - leg.line) < 1.5) return null;
      return overUnder(v, leg.line, leg.over);
    }
    case 'BTTS': {
      const g = goalsFor(leg.period, f, ft);
      return g ? ((g.h > 0 && g.a > 0) === leg.yes ? 'WON' : 'LOST') : null;
    }
    case 'HTFT': {
      const ht = goalsFor('1H', f, ft);
      if (!ht) return null;
      return sideFromScore(ht.h, ht.a) === leg.ht && sideFromScore(ft.h, ft.a) === leg.ft ? 'WON' : 'LOST';
    }
    case 'SCORE':
      return ft.h === leg.home && ft.a === leg.away ? 'WON' : 'LOST';
    case 'DNB': {
      const s = sideFromScore(ft.h, ft.a);
      return s === 'D' ? 'VOID' : s === leg.side ? 'WON' : 'LOST';
    }
    case 'HANDICAP': {
      const g = goalsFor(leg.period, f, ft);
      if (!g) return null;
      if (leg.asian && Math.round(leg.line * 4) % 2 !== 0) return null; // quarter lines split the stake
      const adj = (leg.side === 'H' ? g.h - g.a : g.a - g.h) + leg.line;
      if (adj === 0) return leg.asian ? 'VOID' : 'LOST'; // European: the handicap draw is its own outcome
      return adj > 0 ? 'WON' : 'LOST';
    }
    case 'SCORER':
      return evaluateScorer(leg, f);
    case 'PLAYER_STAT': {
      if (!f.players) return null;
      const p = findPlayer(leg.player, f.players);
      if (!p || p === 'AMBIGUOUS') return null;
      if (!p.started && !p.subbedIn) return 'VOID';
      return overUnder(p[leg.stat], leg.line, leg.over);
    }
    case 'PLAYER_CARD': {
      if (!f.players) return null;
      const p = findPlayer(leg.player, f.players);
      if (!p || p === 'AMBIGUOUS') return null;
      if (p.cards > 0) return 'WON';
      return p.started || p.subbedIn ? 'LOST' : 'VOID';
    }
    case 'FIRST_GOAL': {
      if (!f.goals) return ft.h + ft.a === 0 ? (leg.side === null ? 'WON' : 'LOST') : null;
      const first = f.goals[0];
      if (!first) return leg.side === null ? 'WON' : 'LOST';
      return first.side === leg.side ? 'WON' : 'LOST';
    }
    case 'PARITY': {
      const g = goalsFor(leg.period, f, ft);
      return g ? (((g.h + g.a) % 2 === 0) === leg.even ? 'WON' : 'LOST') : null;
    }
  }
}

function combine(results: Array<Resolution | null>, mode: ParsedBet['mode']): Resolution | null {
  if (mode === 'ANY') {
    if (results.includes('WON')) return 'WON';
    return results.length > 0 && results.every((r) => r === 'LOST') ? 'LOST' : null;
  }
  if (results.includes('LOST')) return 'LOST';
  if (results.some((r) => r === null)) return null;
  if (results.every((r) => r === 'WON')) return 'WON';
  return results.length === 1 ? results[0]! : null; // VOID inside a combo: bookmaker-specific
}

/**
 * Resolves a football bet against a finished fixture.
 * @param ctx names of the home/away teams (bet item names and fixture names) used to read selections like "SL Benfica vence".
 */
export function resolveMarket(
  market: string,
  selection: string,
  fixture: FixtureResult,
  ctx?: MatchContext,
): Resolution | null {
  const status = fixture.statusShort.toLowerCase();
  if (status === 'canc') return 'VOID';
  if (!['ft', 'aet', 'pen'].includes(status)) return null; // abandoned, postponed, awarded: review

  const bet = parseBet(market, selection, ctx);
  if (!bet) return null;

  let ft = { h: fixture.homeScore, a: fixture.awayScore };
  if (status !== 'ft' && !bet.extraTimeIncluded) {
    if (fixture.regularHomeScore == null || fixture.regularAwayScore == null) return null;
    ft = { h: fixture.regularHomeScore, a: fixture.regularAwayScore };
    // Player and team stats from the provider include extra time.
    if (bet.legs.some((l) => l.kind === 'PLAYER_STAT' || (l.kind === 'TOTAL' && l.stat !== 'goals'))) return null;
  }
  return combine(bet.legs.map((leg) => evaluateLeg(leg, fixture, ft)), bet.mode);
}

// ─── Live ────────────────────────────────────────────────────────────────────

export interface LiveAssessment {
  /** What the bet would be if the match ended now ("a ganhar" / "a perder"). */
  ifEndedNow: Resolution | null;
  /** Set when nothing left in the match can change the outcome (over line passed, scorer scored…). */
  decided: Resolution | null;
}

/** Whether one leg can no longer change, given that counters (goals, corners, cards…) only go up. */
function decidedLeg(leg: Leg, f: FixtureResult, ft: Count, phase: MatchPhase): Resolution | null {
  if (phase === 'FINISHED') return evaluateLeg(leg, f, ft);
  const firstHalfDone = phase !== 'FIRST_HALF';
  const monotone = (value: number, line: number, over: boolean): Resolution | null => (value > line ? (over ? 'WON' : 'LOST') : null);
  switch (leg.kind) {
    case 'RESULT':
      return leg.period === '1H' && firstHalfDone ? evaluateLeg(leg, f, ft) : null;
    case 'TOTAL': {
      if (leg.period === '1H' && firstHalfDone) return evaluateLeg(leg, f, ft);
      if (leg.period === '2H' && !firstHalfDone) return null;
      const c = teamStat(leg.stat, leg.period, f, ft);
      if (!c) return null;
      const v = leg.team === 'H' ? c.h : leg.team === 'A' ? c.a : c.h + c.a;
      if (leg.stat === 'cards' && ((f.homeRedCards ?? 0) + (f.awayRedCards ?? 0)) > 0 && Math.abs(v - leg.line) < 1.5) return null;
      return monotone(v, leg.line, leg.over);
    }
    case 'BTTS': {
      if (leg.period === '1H' && firstHalfDone) return evaluateLeg(leg, f, ft);
      if (leg.period === '2H' && !firstHalfDone) return null;
      const g = goalsFor(leg.period, f, ft);
      return g && g.h > 0 && g.a > 0 ? (leg.yes ? 'WON' : 'LOST') : null;
    }
    case 'HTFT': {
      if (!firstHalfDone) return null;
      const ht = goalsFor('1H', f, ft);
      return ht && sideFromScore(ht.h, ht.a) !== leg.ht ? 'LOST' : null;
    }
    case 'SCORE':
      return ft.h > leg.home || ft.a > leg.away ? 'LOST' : null;
    case 'SCORER': {
      if (!f.goals) return null;
      if (leg.mode === 'ANY' || leg.mode === 'COUNT') {
        const r = evaluateScorer(leg, f);
        return r === 'WON' ? 'WON' : null; // can still score later
      }
      if (leg.mode === 'FIRST') return f.goals.length > 0 ? evaluateScorer(leg, f) : null;
      if (leg.mode === 'NTH') return f.goals.length >= (leg.n ?? 1) ? evaluateScorer(leg, f) : null;
      return null; // LAST: only at the end
    }
    case 'PLAYER_STAT': {
      if (!f.players) return null;
      const p = findPlayer(leg.player, f.players);
      return p && p !== 'AMBIGUOUS' ? monotone(p[leg.stat], leg.line, leg.over) : null;
    }
    case 'PLAYER_CARD': {
      if (!f.players) return null;
      const p = findPlayer(leg.player, f.players);
      return p && p !== 'AMBIGUOUS' && p.cards > 0 ? 'WON' : null;
    }
    case 'FIRST_GOAL':
      return f.goals && f.goals.length > 0 ? evaluateLeg(leg, f, ft) : null;
    default:
      return null;
  }
}

/** Live state of a football bet from the current match snapshot (score, stats, events so far). */
export function assessLive(market: string, selection: string, snapshot: FixtureResult, phase: MatchPhase, ctx?: MatchContext): LiveAssessment {
  const bet = parseBet(market, selection, ctx);
  if (!bet) return { ifEndedNow: null, decided: null };
  const ft = { h: snapshot.homeScore, a: snapshot.awayScore };
  const asFinal = { ...snapshot, statusShort: 'FT' };
  return {
    ifEndedNow: combine(bet.legs.map((l) => evaluateLeg(l, asFinal, ft)), bet.mode),
    decided: combine(bet.legs.map((l) => decidedLeg(l, asFinal, ft, phase)), bet.mode),
  };
}
