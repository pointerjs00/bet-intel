/**
 * Canonical selection keys: two houses' selections are only compared when they map to the
 * same key. Pure module (no I/O). Format: see PLANO_ODDS / global constraints.
 */
import { parseBet } from '../marketResolutionEngine';
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

/**
 * parseBet is lenient (built to settle the user's own bets). For comparison a wrong key is worse
 * than no key, so reject results the market/selection text contradicts.
 */
function contradicts(bet: ParsedBet, market: string, selection: string): boolean {
  const m = plain(market);
  const s = plain(selection);
  const allFt = bet.legs.every((l) => !('period' in l) || l.period === 'FT');
  if (HALF_RE.test(m) && !/intervalo\/final|ht\/ft/.test(m) && bet.legs.some((l) => 'period' in l && l.period === 'FT') && allFt) return true;
  if (/marcador|scorer|goalscorer/.test(m) && !bet.legs.every((l) => l.kind === 'SCORER')) return true;
  if (/dupla|duplo|double chance/.test(m) && !bet.legs.every((l) => l.kind === 'RESULT' && l.outcomes.length === 2)) return true;
  if (/corret|correct|exat|exact/.test(m) && !bet.legs.every((l) => l.kind === 'SCORE')) return true;
  // "X 2 golos de vantagem ou vence", "ganha sem sofrer"... only look like a plain result.
  if (bet.legs.every((l) => l.kind === 'RESULT') && /vantagem|vence|ganha|sem sofrer|a marcar|golo/.test(m)) return true;
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
  const mentionsHome = m.includes(plain(ctx.home));
  const mentionsAway = m.includes(plain(ctx.away));
  const legs = bet.legs.map((l): Leg => {
    if (l.kind === 'TOTAL' && !l.team && mentionsHome !== mentionsAway) {
      return { ...l, team: mentionsHome ? 'H' : 'A' };
    }
    return l;
  });
  if (legs.some((l) => l.kind === 'TOTAL') && mentionsHome && mentionsAway) return null;
  return betKey({ ...bet, legs });
}
