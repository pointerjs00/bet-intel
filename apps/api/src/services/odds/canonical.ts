/**
 * Canonical selection keys: two houses' selections are only compared when they map to the
 * same key. Pure module (no I/O). Format: see PLANO_ODDS / global constraints.
 */
import { parseBet, sideOf } from '../marketResolutionEngine';
import type { Leg, MatchContext, ParsedBet, Side } from '../marketResolutionEngine';

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

const HALF_RE = /\b(1a parte|2a parte|1\.a parte|2\.a parte|primeira parte|segunda parte|1st half|2nd half|first half|second half|1o tempo|2o tempo|intervalo)\b/;
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
  const after = m.match(/\bgolos\s+(?:da|do)\s+(.+)$/)?.[1]?.trim() ?? '';
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
  // A half-restricted market needs every leg explicitly tied to that half.
  if (HALF_RE.test(m) && !/intervalo\/final|ht\/ft/.test(m)) {
    if (bet.legs.some((l) => l.kind !== 'HTFT' && (!('period' in l) || l.period === 'FT'))) return true;
  }
  if (/marcador|scorer|goalscorer/.test(m) && !bet.legs.every((l) => l.kind === 'SCORER')) return true;
  if (/dupla|duplo|double chance/.test(m) && !bet.legs.every((l) => l.kind === 'RESULT' && l.outcomes.length === 2)) return true;
  if (/corret|correct|exat|exact/.test(m) && !bet.legs.every((l) => l.kind === 'SCORE')) return true;
  // Result legs: only plain full-time 1X2 / double-chance markets, not "Cantos 1X2", "resto do jogo"...
  if (bet.legs.some((l) => l.kind === 'RESULT')) {
    if (NOT_PLAIN_RESULT.test(m) || NOT_PLAIN_RESULT_SELECTION.test(s)) return true;
    const stripped = m
      .replace(/tempo regulamentar|tempo reg\.?|1x2|do jogo|\bfinal\b|[()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!PLAIN_RESULT_MARKET.test(stripped)) return true;
  }
  // A combo market ("X vence e Total de golos") with a single parsed leg lost a leg.
  if (/\s(e|\+|&)\s/.test(m) && bet.legs.length === 1) return true;
  // Draw leg of a 3-way handicap has no key in the format.
  if (bet.legs.some((l) => l.kind === 'HANDICAP') && /^(empate|draw|x)\b/.test(s)) return true;
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
