/**
 * Canonical selection keys: two houses' selections are only compared when they map to the
 * same key. Pure module (no I/O). Format: see PLANO_ODDS / global constraints.
 */
import { parseBet, sideOf } from '../marketResolutionEngine';
import type { Leg, MatchContext, ParsedBet, Side } from '../marketResolutionEngine';
import { playerOf } from '../tennisMarketEngine';
import { PLAYER_MARKET, lineIn, overUnder, scopeOf, sideOf as basketSideOf } from '../basketballMarketEngine';

const SIDE_ORDER: Side[] = ['H', 'D', 'A'];

/** Lowercase, no accents, single spaces. */
function plain(s: string): string {
  return s
    .toLowerCase()
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal-decimals number; `signed` forces a leading + for non-negative values. */
function num(n: number, signed = false): string {
  const s = String(n);
  return signed && n >= 0 ? `+${s}` : s;
}

/**
 * Key of a single leg, or null when the leg is not comparable in v1
 * (player stats and cards).
 */
export function legKey(leg: Leg): string | null {
  switch (leg.kind) {
    case 'RESULT': {
      const outs = SIDE_ORDER.filter((s) => leg.outcomes.includes(s));
      if (outs.length === 1) return `${leg.period}.1X2.${outs[0]}`;
      if (outs.length === 2) return `${leg.period}.DC.${outs.join('')}`;
      return null;
    }
    case 'TOTAL': {
      const team = leg.team ? `${leg.team}.` : '';
      return `${leg.period}.TOTAL.${leg.stat}.${team}${leg.over ? 'O' : 'U'}.${num(leg.line)}`;
    }
    case 'BTTS':
      return `${leg.period}.BTTS.${leg.yes ? 'Y' : 'N'}`;
    case 'HTFT':
      return `HTFT.${leg.ht}${leg.ft}`;
    case 'SCORE':
      return `FT.SCORE.${leg.home}-${leg.away}`;
    case 'DNB':
      return `FT.DNB.${leg.side}`;
    case 'HANDICAP':
      return `${leg.period}.HCP.${leg.asian ? 'AS' : 'EU'}.${leg.side}.${num(leg.line, true)}`;
    case 'SCORER': {
      const nth = leg.n !== undefined && (leg.mode === 'NTH' || leg.mode === 'COUNT') ? `.${leg.n}` : '';
      const suffix = `${leg.orAssist ? '.OA' : ''}${leg.orSub ? '.OS' : ''}`;
      return `SCORER.${leg.mode}${nth}.${leg.player === null ? 'NONE' : plain(leg.player)}${suffix}`;
    }
    case 'FIRST_GOAL':
      return `FT.FIRSTGOAL.${leg.side ?? 'NONE'}`;
    case 'PARITY':
      return `${leg.period}.PARITY.${leg.even ? 'EVEN' : 'ODD'}`;
    case 'PLAYER_STAT':
    case 'PLAYER_CARD':
      return null;
  }
}

/** Serialises a parsed bet: leg keys sorted and joined by "+", ANY wrapped, extra time prefixed. */
function betKey(bet: ParsedBet): string | null {
  const keys: string[] = [];
  for (const leg of bet.legs) {
    const k = legKey(leg);
    if (k === null) return null;
    keys.push(k);
  }
  keys.sort();
  const joined = keys.join('+');
  const body = bet.mode === 'ANY' ? `ANY(${joined})` : joined;
  return bet.extraTimeIncluded ? `ET:${body}` : body;
}

const NOT_PLAIN_RESULT = /\b(cantos?|cart\w*|remates?|faltas?|minutos?|resto|prolongamento|penalt\w*|vantagem|vence|ganha|sem sofrer|a marcar|golos?)\b/;
const NOT_PLAIN_RESULT_SELECTION = /\b(golos?|diferenca|margem|por)\b/;
const PLAIN_RESULT_MARKET = /^(resultado|resultado duplo|resultado final|dupla hipotese|chance dupla|double chance|duplo|vencedor|match result|result|1x2|)$/;

/** Side named by a team-total market label, or null when not resolvable; `qualified` = label talks about a team. */
function teamOfMarket(m: string, ctx: MatchContext): { side: 'H' | 'A' | null; qualified: boolean } {
  // 1. Explicit "equipa da casa / visitante" phrasing.
  if (/\b(equipa da casa|equipa de casa|home team)\b/.test(m)) return { side: 'H', qualified: true };
  if (/\b(equipa visitante|equipa de fora|equipa fora|away team|visitante|visitor)\b/.test(m)) return { side: 'A', qualified: true };
  // 2. Team names win over generic words ("Total de golos da Casa Pia" is not "da casa").
  const sep = m.indexOf(' - ');
  const prefix = sep > 0 ? m.slice(0, sep).trim() : '';
  const named = /^(total|golos|resultado|mais|menos)\b/.test(prefix) ? '' : prefix;
  const afterGolos = m.match(/\bgolos\s+(?:da|do)\s+(.+)$/)?.[1]?.trim() ?? '';
  // "Total de golos do jogo / da partida / do encontro" is the match total.
  const after = /^(jogo|partida|encontro)$/.test(afterGolos) ? '' : afterGolos;
  for (const candidate of [named, after]) {
    if (!candidate) continue;
    const side = sideOf(candidate, ctx);
    if (side) return { side, qualified: true };
    if (candidate === named) return { side: null, qualified: true };
  }
  if (after) {
    // "da casa" / "de fora" only when nothing else follows.
    if (/^(casa|home)$/.test(after)) return { side: 'H', qualified: true };
    if (/^(fora|away)$/.test(after)) return { side: 'A', qualified: true };
    return { side: null, qualified: true };
  }
  if (/\b(home|away)\b/.test(m)) return { side: /\bhome\b/.test(m) ? 'H' : 'A', qualified: true };
  return { side: null, qualified: /\b(equipa|team|casa|fora)\b/.test(m) };
}

/**
 * parseBet is lenient (built to settle the user's own bets). For comparison a wrong key is worse
 * than no key, so reject results the market/selection text contradicts.
 */
function contradicts(bet: ParsedBet, market: string, selection: string): boolean {
  const m = plain(market);
  const s = plain(selection);
  if (/asiatic|asian/.test(m)) return true;
  // (Half-restricted markets: parseBet reads the half itself and returns null for kinds it can only
  // settle on the full match, so no half guard is needed here.)
  if (/marcador|scorer|goalscorer/.test(m) && !bet.legs.every((l) => l.kind === 'SCORER')) return true;
  if (/dupla|duplo|double chance/.test(m) && !bet.legs.every((l) => l.kind === 'RESULT' && l.outcomes.length === 2)) return true;
  if (/corret|correct|exat|exact/.test(m) && !bet.legs.every((l) => l.kind === 'SCORE')) return true;
  // Result legs: only plain full-time 1X2 / double-chance markets, not "Cantos 1X2", "resto do jogo"...
  if (bet.legs.some((l) => l.kind === 'RESULT')) {
    // A selection can name its own half ("Leixões vence ao intervalo"): plain results are full time only.
    if (bet.legs.some((l) => l.kind === 'RESULT' && l.period !== 'FT')) return true;
    if (NOT_PLAIN_RESULT.test(m) || NOT_PLAIN_RESULT_SELECTION.test(s)) return true;
    const stripped = m
      .replace(/tempo regulamentar|tempo reg\.?|1x2|do jogo|\bfinal\b|[()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!PLAIN_RESULT_MARKET.test(stripped)) return true;
  }
  // A combo market ("X vence e Total de golos") with a single parsed leg lost a leg.
  if (/\s(e|\+|&)\s/.test(m) && bet.legs.length === 1) return true;
  // (Draw leg of a 3-way handicap: parseBet returns null for it.)
  return false;
}

/**
 * Canonical key for a football selection, or null when the label is not recognised
 * (or recognised ambiguously). Totals whose market label names a team become team totals.
 */
export function footballKey(
  marketLabel: string,
  selectionLabel: string,
  ctx: { home: string; away: string },
): string | null {
  const matchCtx: MatchContext = { homeNames: [ctx.home], awayNames: [ctx.away] };
  const bet = parseBet(marketLabel, selectionLabel, matchCtx);
  if (!bet || bet.legs.length === 0) return null;
  if (contradicts(bet, marketLabel, selectionLabel)) return null;

  const m = plain(marketLabel);
  const team = teamOfMarket(m, matchCtx);
  const legs: Leg[] = [];
  for (const l of bet.legs) {
    if (l.kind === 'TOTAL' && !l.team && team.qualified) {
      if (!team.side) return null;
      legs.push({ ...l, team: team.side });
    } else {
      legs.push(l);
    }
  }
  return betKey({ ...bet, legs });
}

// ---------------------------------------------------------------------------------------------
// Shared text helpers for tennis and basketball
// ---------------------------------------------------------------------------------------------

/** `plain` plus decimal commas turned into points ("21,5" -> "21.5"). */
function dec(s: string): string {
  return plain(s).replace(/(\d),(\d)/g, '$1.$2');
}

/** Tokens of `text` that are not in `allowed`; empty = the label says nothing beyond the allowed words. */
function leftover(text: string, allowed: ReadonlySet<string>): string[] {
  return text.split(/[^a-z0-9]+/).filter((t) => t && !allowed.has(t));
}

const words = (s: string): Set<string> => new Set(s.split(' '));

/** Over/under selection: "Mais de 21.5", "Under 21.5", "Menos 22.5"; `prefix` = text before the word (a team/player). */
const OU_SELECTION = /^(.*?)\s*\b(mais de|acima de|over|menos de|abaixo de|under|mais|menos|acima|abaixo)\s*(\d+(?:\.\d+)?)\s*(?:jogos|games|sets|pontos|points)?$/;

function parseOverUnder(s: string): { prefix: string; over: boolean; line: number } | null {
  const m = s.match(OU_SELECTION);
  if (!m) return null;
  return { prefix: m[1]!.replace(/[-:(]+$/, '').trim(), over: /^(mais|acima|over)/.test(m[2]!), line: parseFloat(m[3]!) };
}

// ---------------------------------------------------------------------------------------------
// Tennis
// ---------------------------------------------------------------------------------------------

const TENNIS_REJECT =
  /aces|dupla|double fault|break|tie-?break|exat\w* de jogos|pelo menos|at least|par.?impar|odd.?even|primeiro (jogo|ponto)|first (game|point)|ambos|both|jogador|player|handicap e |\s(e|and|\+|&)\s|\bou\b/;
const TENNIS_ORDINALS: Record<string, number> = { primeiro: 1, first: 1, segundo: 2, second: 2, terceiro: 3, third: 3 };
const TENNIS_SET_EXPR = [
  /\b([1-5])\.?\s*o?\s*set\b/g,
  /\bset\s*([1-5])\b/g,
  /\b([1-5])(?:st|nd|rd|th)\s+set\b/g,
  /\b(primeiro|segundo|terceiro|first|second|third)\s+set\b/g,
];
const TENNIS_WINNER_WORDS = words('vencedor winner result resultado do of o the set encontro jogo match partida final to win');
const TENNIS_TOTAL_WORDS = words('total de mais menos over under do o jogos games encontro jogo match partida');
const TENNIS_SETTOTAL_WORDS = words('total de mais menos over under do o sets set encontro jogo match partida');
const TENNIS_HCP_WORDS = words('handicap de do o jogos games game encontro match');

/**
 * Canonical key for a tennis selection (A = first player of the event, B = second), or null when
 * the label is not recognised. Set-scoped games markets, set handicaps, player totals and props
 * are not comparable in v1.
 */
export function tennisKey(
  marketLabel: string,
  selectionLabel: string,
  ctx: { playerA: string; playerB: string },
): string | null {
  const m = dec(marketLabel);
  const s = dec(selectionLabel);
  if (!m || !s || TENNIS_REJECT.test(m)) return null;
  const pc = { playerA: [ctx.playerA], playerB: [ctx.playerB] };

  // Set scope: exactly one set number, captured in the key (winner only).
  const setNos = new Set<number>();
  let rest = m;
  for (const re of TENNIS_SET_EXPR) {
    for (const x of m.matchAll(re)) setNos.add(TENNIS_ORDINALS[x[1]!] ?? Number(x[1]));
    rest = rest.replace(re, ' ');
  }
  const winnerSide = (): 'A' | 'B' | null => (/\d|vence|ganha|wins?/.test(s) ? null : playerOf(s, pc));
  if (setNos.size > 1) return null;
  if (setNos.size === 1) {
    if (leftover(rest, TENNIS_WINNER_WORDS).length > 0) return null; // set games/handicap/score: not comparable
    const p = winnerSide();
    return p ? `T.SET${[...setNos][0]}.WIN.${p}` : null;
  }
  if (/\bset\b/.test(m)) return null; // a set market whose number we could not read

  const isSets = /\bsets?\b/.test(m);
  const isGames = /\b(jogos|games?)\b/.test(m);

  if (/handicap/.test(m)) {
    if (isSets || !isGames || leftover(m, TENNIS_HCP_WORDS).length > 0) return null;
    const hm = s.match(/^(.+?)\s*\(?\s*([+-]\d+(?:\.\d+)?)\s*\)?$/);
    if (!hm) return null;
    const name = hm[1]!.trim();
    const h = name.match(/^handicap ([12])$/);
    const p = h ? (h[1] === '1' ? 'A' : 'B') : playerOf(name, pc);
    return p ? `T.GAMES.HCP.${p}.${num(parseFloat(hm[2]!), true)}` : null;
  }

  if (/resultado corre[ct]+o|resultado exa[ct]+o|correct score|resultado em sets|sets? exa[ct]+os?/.test(m)) {
    const sc = s.match(/(\d)\s*[-:]\s*(\d)/);
    if (!sc) return null;
    const name = s.replace(sc[0], ' ').replace(/\b(vence|ganha|wins?)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const [x, y] = [sc[1]!, sc[2]!];
    if (!name) return `T.SETS.${x}-${y}`;
    const p = playerOf(name, pc);
    return p ? (p === 'A' ? `T.SETS.${x}-${y}` : `T.SETS.${y}-${x}`) : null;
  }

  if (/\btotal\b|mais|menos|over|under/.test(m) && (isGames || isSets)) {
    if (isGames && isSets) return null;
    if (leftover(m, isSets ? TENNIS_SETTOTAL_WORDS : TENNIS_TOTAL_WORDS).length > 0) return null;
    const ou = parseOverUnder(s);
    if (!ou || ou.prefix) return null;
    return `${isSets ? 'T.SETSTOTAL' : 'T.GAMES'}.${ou.over ? 'O' : 'U'}.${num(ou.line)}`;
  }

  if (leftover(m, TENNIS_WINNER_WORDS).length === 0) {
    const p = winnerSide();
    return p ? `T.WIN.${p}` : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Basketball
// ---------------------------------------------------------------------------------------------

const BASKETBALL_REJECT =
  /par.?impar|odd.?even|primeir[oa]s? (pontos|ponto|cesto)|first (to|basket|score)|ultimo|last (basket|score)|margem|margin|race|corrida|mais pontos|most points|asiatic|asian|duplo|double|triplo|triple|combo|\bou\b|\s(e|and|\+|&)\s/;
const BASKETBALL_REGULATION = /\b(sem prolongamento|sem overtime|excl\w*|regulamentar|regular time|regulation|no overtime|without overtime|1x2)\b/;
const BASKETBALL_SCOPE_PHRASES = [
  /\b[1-4]\.?\s*[ºo°]?\s*(quarto|periodo|parte)\b/g,
  /\b(primeiro|segundo|terceiro|quarto|primeira|segunda) (quarto|periodo|parte)\b/g,
  /\b[1-4]\.?\s*[ªa]?\s*parte\b/g,
  /\b(1st|2nd|3rd|4th|first|second) (half|quarter|period)\b/g,
  /\b(quarter|period) [1-4]\b/g,
  /\bq[1-4]\b/g,
];
const BASKETBALL_WORDS = words(
  'total pontos points mais menos over under acima abaixo de do da jogo game match encontro incl incluindo inclui including inc com with prolongamento overtime ot equipa team por each handicap spread hcp a o',
);
const BASKETBALL_WINNER_WORDS = words('vencedor winner result resultado moneyline money line do da de jogo game match encontro final incl incluindo inclui including inc com with prolongamento overtime ot');
const BASKETBALL_1X2_WORDS = words('vencedor winner result resultado do da de jogo game match encontro final 1x2 tempo regulamentar regulation regular time sem without no excl exclui excluindo normal prolongamento overtime ot 3 way vias via');

/** Quarter/half scope of a market ("Q1:" / "H2:" prefix), '' for the whole game, or null when a scope word is not understood. */
function basketballScope(m: string): string | null {
  const sc = scopeOf(m);
  if (sc?.quarter) return `Q${sc.quarter}:`;
  if (sc?.half) return `H${sc.half}:`;
  const en = m.match(/\b([1-4])(?:st|nd|rd|th)\s+(?:quarter|period)\b|\b(?:quarter|period)\s+([1-4])\b|\bq([1-4])\b/);
  if (en) return `Q${en[1] ?? en[2] ?? en[3]}:`;
  const bare = m.replace(/tempo regulamentar|tempo regular|regular time/g, ' ');
  return /quarto|periodo|quarter|period|parte|half|intervalo|\bh[12]\b|\b[1-4](st|nd|rd|th)\b|primeir|segund|terceir|\bfirst\b|\bsecond\b/.test(bare) ? null : '';
}

function withoutScope(m: string): string {
  let t = m;
  for (const re of BASKETBALL_SCOPE_PHRASES) t = t.replace(re, ' ');
  return t;
}

/** Market label without its scope phrases, decimal lines and the generic words; what is left names a team (or is unknown). */
function basketballRemainder(m: string): string {
  let t = withoutScope(m);
  t = t.replace(/[+-]?\d+\.\d+/g, ' ');
  return t.split(/[^a-z0-9]+/).filter((x) => x && !BASKETBALL_WORDS.has(x)).join(' ');
}

/** Side named by a basketball label ("Handicap 1" = home, "Handicap 2" = away), or null. */
function basketballSide(text: string, ctx: { home: string; away: string }): 'H' | 'A' | null {
  const h = text.match(/^handicap ([12])$/);
  if (h) return h[1] === '1' ? 'H' : 'A';
  return basketSideOf(text, ctx);
}

/**
 * Canonical key for a basketball selection, or null when the label is not recognised. Quarter and
 * half markets carry a Q{n}:/H{n}: prefix; player props, odd/even, "first to score" style markets
 * and results whose 2-way/3-way shape is unknown are not comparable in v1.
 */
export function basketballKey(
  marketLabel: string,
  selectionLabel: string,
  ctx: { home: string; away: string },
): string | null {
  const m = dec(marketLabel);
  const s = dec(selectionLabel);
  if (!m || !s) return null;
  if (BASKETBALL_REJECT.test(m) || BASKETBALL_REJECT.test(s) || PLAYER_MARKET.test(m)) return null;
  const scope = basketballScope(m);
  if (scope === null || /quarto|quarter|half|parte|periodo/.test(s)) return null;
  const regulation = BASKETBALL_REGULATION.test(m);

  // Handicap
  if (/handicap|spread|hcp/.test(m)) {
    if (regulation || basketballRemainder(m)) return null;
    const side = basketballSide(s.replace(/\s*\(?[+-]\d+(?:\.\d+)?\)?\s*$/, '').trim(), ctx);
    const line = lineIn(s);
    if (!side || line === null) return null;
    if (line !== 0 && !/[+-]\s*\d+(?:\.\d+)?\s*\)?\s*$/.test(s)) return null; // handicaps are always signed
    return `${scope}B.HCP.${side}.${num(line, true)}`;
  }

  // Totals (game or one team)
  if (/\b(total|mais|menos|over|under)\b/.test(m) || /\b(mais|menos|over|under|acima|abaixo)\b/.test(s)) {
    if (regulation) return null;
    const ou = parseOverUnder(s);
    if (!ou || overUnder(s) !== ou.over) return null;
    const fromSel = ou.prefix ? basketSideOf(ou.prefix, ctx) : null;
    if (ou.prefix && !fromSel) return null;
    const rem = basketballRemainder(m);
    const fromMkt = rem ? basketSideOf(rem, ctx) : null;
    if (rem && !fromMkt) return null;
    if (fromSel && fromMkt && fromSel !== fromMkt) return null;
    const team = fromSel ?? fromMkt;
    if (!team && /\b(equipa|team|each)\b/.test(m)) return null; // "team total" without a team
    const ouKey = `${ou.over ? 'O' : 'U'}.${num(ou.line)}`;
    return `${scope}${team ? `B.TEAMTOTAL.${team}.${ouKey}` : `B.TOTAL.${ouKey}`}`;
  }

  // Results: regulation-time 1X2 (3-way) or moneyline (overtime included).
  if (/[+-]\s*\d|\d+\.\d+/.test(s)) return null; // a line inside a result selection: not a plain result
  const isDraw = /^(x|empate|draw)$/.test(s);
  const side = isDraw ? 'D' : /^handicap/.test(s) ? null : basketballSide(s, ctx);
  if (!side) return null;
  if (regulation) {
    if (leftover(withoutScope(m), BASKETBALL_1X2_WORDS).length > 0) return null;
    return `${scope}B.1X2.${side}`;
  }
  if (scope) return null; // 2-way quarter/half winner (a tie is void) vs 3-way 1X2: indistinguishable here
  if (side === 'D' || leftover(m, BASKETBALL_WINNER_WORDS).length > 0) return null;
  return `B.ML.${side}`;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * Canonical key for a selection of any supported sport, or null (unsupported sport or label not
 * recognised). `ctx` is the event's participants in the event's order: for tennis `home` is the
 * first player and `away` the second.
 */
export function canonicalKey(
  sport: string,
  marketLabel: string,
  selectionLabel: string,
  ctx: { home: string; away: string },
): string | null {
  switch (sport.toUpperCase()) {
    case 'FOOTBALL':
      return footballKey(marketLabel, selectionLabel, ctx);
    case 'TENNIS':
      return tennisKey(marketLabel, selectionLabel, { playerA: ctx.home, playerB: ctx.away });
    case 'BASKETBALL':
      return basketballKey(marketLabel, selectionLabel, ctx);
    default:
      return null;
  }
}
