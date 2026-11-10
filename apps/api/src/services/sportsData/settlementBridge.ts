// Converts a normalised match into the input of the market resolution engine.

import type { FixtureResult, GoalEvent, MatchPhase, PlayerLine } from '../marketResolutionEngine';
import type { MatchIncident, NormalizedMatch } from './types';

const STATUS_SHORT: Partial<Record<NormalizedMatch['status'], string>> = {
  CANCELLED: 'CANC',
  ABANDONED: 'ABD',
  POSTPONED: 'PST',
};

/** "45'+2'" → 47, "90'+4'" → 94, "67'" → 67. */
export function minuteOf(display: string): number {
  const m = display.match(/(\d+)'?\s*(?:\+\s*(\d+))?/);
  return m ? Number(m[1]) + Number(m[2] ?? 0) : 0;
}

const isRegularTime = (i: MatchIncident) => i.period == null || i.period <= 2;
const toSide = (s: 'home' | 'away' | null) => (s === 'home' ? 'H' : s === 'away' ? 'A' : null);

/** Goals in order, regular time only. null when the provider gave no events but there were goals. */
function goalsOf(m: NormalizedMatch): GoalEvent[] | null {
  const goals = m.incidents
    .filter((i) => (i.type === 'GOAL' || i.type === 'PENALTY_GOAL' || i.type === 'OWN_GOAL') && isRegularTime(i))
    .sort((a, b) => (a.clockSeconds ?? minuteOf(a.minute) * 60) - (b.clockSeconds ?? minuteOf(b.minute) * 60))
    .flatMap((i): GoalEvent[] => {
      const side = toSide(i.side);
      return side ? [{ side, player: i.player, assist: i.type === 'GOAL' ? i.assist : null, minute: minuteOf(i.minute), ownGoal: i.type === 'OWN_GOAL', penalty: i.type === 'PENALTY_GOAL' }] : [];
    });
  // Only trust the list when it accounts for every regular-time goal.
  const total = (m.regularTime ?? m.score);
  if (!total) return goals;
  return goals.length === total.home + total.away ? goals : null;
}

function cardsByHalf(m: NormalizedMatch): FixtureResult['cardsByHalf'] {
  const split = { first: { home: 0, away: 0 }, second: { home: 0, away: 0 } };
  let counted = 0;
  for (const i of m.incidents) {
    if (i.type !== 'YELLOW' && i.type !== 'SECOND_YELLOW' && i.type !== 'RED') continue;
    if (!i.side || i.period == null || i.period > 2) continue;
    (i.period === 1 ? split.first : split.second)[i.side]++;
    counted++;
  }
  const s = m.stats;
  if (!s) return null;
  const total = (s.home.yellowCards ?? 0) + (s.home.redCards ?? 0) + (s.away.yellowCards ?? 0) + (s.away.redCards ?? 0);
  return counted === total ? split : null;
}

function playersOf(m: NormalizedMatch): PlayerLine[] | null {
  if (!m.players) return null;
  return m.players.map((p) => ({
    name: p.name,
    side: p.side === 'home' ? 'H' : 'A',
    started: p.started,
    subbedIn: p.subbedIn,
    goals: p.goals,
    assists: p.assists,
    shots: p.shots,
    shotsOnTarget: p.shotsOnTarget,
    fouls: p.fouls,
    cards: p.yellowCards + p.redCards,
  }));
}

/** Everything the engine reads, from the match as it stands (final or in progress). */
function snapshot(m: NormalizedMatch, score: { home: number; away: number }): FixtureResult {
  const st = m.stats;
  const cards = (side: 'home' | 'away') => (st ? (st[side].yellowCards ?? 0) + (st[side].redCards ?? 0) : null);
  return {
    homeScore: score.home,
    awayScore: score.away,
    htHomeScore: m.halfTime?.home ?? null,
    htAwayScore: m.halfTime?.away ?? null,
    statusShort: m.wentToExtraTime ? 'AET' : 'FT',
    regularHomeScore: m.regularTime?.home ?? null,
    regularAwayScore: m.regularTime?.away ?? null,
    homeCorners: st?.home.corners ?? null,
    awayCorners: st?.away.corners ?? null,
    homeCards: cards('home'),
    awayCards: cards('away'),
    homeRedCards: st?.home.redCards ?? null,
    awayRedCards: st?.away.redCards ?? null,
    homeShots: st?.home.shots ?? null,
    awayShots: st?.away.shots ?? null,
    homeShotsOnTarget: st?.home.shotsOnTarget ?? null,
    awayShotsOnTarget: st?.away.shotsOnTarget ?? null,
    homeFouls: st?.home.fouls ?? null,
    awayFouls: st?.away.fouls ?? null,
    homeOffsides: st?.home.offsides ?? null,
    awayOffsides: st?.away.offsides ?? null,
    cornersByHalf: m.cornersByHalf ?? null,
    cardsByHalf: cardsByHalf(m),
    goals: goalsOf(m),
    subs: m.incidents.filter((i) => i.type === 'SUB' && i.player).map((i) => ({ playerIn: i.player!, playerOut: i.assist, minute: minuteOf(i.minute) })),
    players: playersOf(m),
  };
}

/** Returns the engine input for a finished/cancelled match, or null while the match is not settled. */
export function toFixtureResult(m: NormalizedMatch): FixtureResult | null {
  if (m.status !== 'FINISHED') {
    const short = STATUS_SHORT[m.status];
    return short ? { homeScore: 0, awayScore: 0, htHomeScore: null, htAwayScore: null, statusShort: short } : null;
  }
  if (!m.score) return null;
  return snapshot(m, m.score);
}

/** The match so far and how far it is, for live "a ganhar" / "já ganha" verdicts. */
export function toLiveSnapshot(m: NormalizedMatch): { fixture: FixtureResult; phase: MatchPhase } | null {
  if (!m.score) return null;
  const phase: MatchPhase = m.status === 'FINISHED' ? 'FINISHED'
    : m.status === 'HALFTIME' ? 'HALFTIME'
      : m.halfTime && m.status === 'LIVE' && /^(4[6-9]|[5-9]\d|1\d\d)|2nd|second/i.test(m.statusDetail) ? 'SECOND_HALF'
        : 'FIRST_HALF';
  return { fixture: { ...snapshot(m, m.score), statusShort: 'FT' }, phase };
}
