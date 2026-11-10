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
}

/** Names that identify each side, used to map selections such as "SL Benfica vence". */
export interface MatchContext {
  homeNames: string[];
  awayNames: string[];
}

type Side = 'H' | 'D' | 'A';
type Period = 'FT' | '1H' | '2H';

type Leg =
  | { kind: 'RESULT'; period: Period; outcomes: Side[] }
  | { kind: 'TOTAL'; period: Period; stat: 'goals' | 'corners' | 'cards'; over: boolean; line: number; team?: 'H' | 'A' }
  | { kind: 'BTTS'; period: Period; yes: boolean }
  | { kind: 'HTFT'; ht: Side; ft: Side }
  | { kind: 'SCORE'; home: number; away: number }
  | { kind: 'DNB'; side: 'H' | 'A' };

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

function teamKey(name: string): string {
  const n = normaliseTeamName(name);
  return resolveAlias(PT_TEAM_NAMES[n] ?? n);
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
  return ta.length > 0 && ta.every((t) => tb.has(t));
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

const UNSUPPORTED = /\b(jogador|marcador|marca|marcar|handicap|eliminatoria|qualifica|proximo|primeiro|ultimo|touchdown|pontos|ressaltos|assistencias|remates|minuto|impar|intervalos|mais cantos|metade|exato de cantos|exacto)\b/;

function periodOf(raw: string): Period {
  const text = raw.replace(/intervalo\/final|ht\/ft/g, ' ');
  if (/\b(primeira parte|1a parte|1\.a parte|1st half|first half|intervalo)\b/.test(text)) return '1H';
  if (/\b(segunda parte|2a parte|2\.a parte|2nd half|second half)\b/.test(text)) return '2H';
  return 'FT';
}

function statOf(text: string): 'goals' | 'corners' | 'cards' {
  if (/\bcanto/.test(text)) return 'corners';
  if (/\bcart(ao|oes)\b|\bcards?\b/.test(text)) return 'cards';
  return 'goals';
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
  const before = m ? text.slice(0, m.index).trim() : '';
  const team = before ? sideOf(before, ctx) : null;
  if (before && !team) return null; // e.g. a player name: not a team total
  return { kind: 'TOTAL', period: periodOf(context), stat: statOf(context), over, line, ...(team ? { team } : {}) };
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

  if (TOTAL_RE.test(t) || /^(mais|acima|over|menos|abaixo|under)$/.test(t)) return parseTotal(t, market, ctx);

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

function sideFromScore(h: number, a: number): Side {
  return h > a ? 'H' : h < a ? 'A' : 'D';
}

function goalsFor(period: Period, f: FixtureResult, ft: { h: number; a: number }): { h: number; a: number } | null {
  if (period === 'FT') return ft;
  if (f.htHomeScore === null || f.htAwayScore === null) return null;
  if (period === '1H') return { h: f.htHomeScore, a: f.htAwayScore };
  return { h: ft.h - f.htHomeScore, a: ft.a - f.htAwayScore };
}

function overUnder(value: number, line: number, over: boolean): Resolution | null {
  if (value === line) return Number.isInteger(line) ? null : over ? 'WON' : 'LOST'; // whole lines: push rules vary
  return value > line === over ? 'WON' : 'LOST';
}

function evaluateLeg(leg: Leg, f: FixtureResult, ft: { h: number; a: number }): Resolution | null {
  switch (leg.kind) {
    case 'RESULT': {
      const g = goalsFor(leg.period, f, ft);
      return g ? (leg.outcomes.includes(sideFromScore(g.h, g.a)) ? 'WON' : 'LOST') : null;
    }
    case 'TOTAL': {
      if (leg.stat === 'cards') return null; // booking rules differ per bookmaker
      if (leg.stat === 'corners') {
        if (leg.period !== 'FT' || f.homeCorners == null || f.awayCorners == null) return null;
        const v = leg.team === 'H' ? f.homeCorners : leg.team === 'A' ? f.awayCorners : f.homeCorners + f.awayCorners;
        return overUnder(v, leg.line, leg.over);
      }
      const g = goalsFor(leg.period, f, ft);
      if (!g) return null;
      const v = leg.team === 'H' ? g.h : leg.team === 'A' ? g.a : g.h + g.a;
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
  }
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
  }

  const results = bet.legs.map((leg) => evaluateLeg(leg, fixture, ft));
  if (bet.mode === 'ANY') {
    if (results.includes('WON')) return 'WON';
    return results.every((r) => r === 'LOST') ? 'LOST' : null;
  }
  if (results.includes('LOST')) return 'LOST';
  if (results.some((r) => r === null)) return null;
  if (results.every((r) => r === 'WON')) return 'WON';
  return bet.legs.length === 1 ? results[0]! : null; // VOID inside a combo: bookmaker-specific
}
