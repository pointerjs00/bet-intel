// Converts a normalised match into the input of the market resolution engine.

import type { FixtureResult } from '../marketResolutionEngine';
import type { NormalizedMatch } from './types';

const STATUS_SHORT: Partial<Record<NormalizedMatch['status'], string>> = {
  CANCELLED: 'CANC',
  ABANDONED: 'ABD',
  POSTPONED: 'PST',
};

/** Returns the engine input for a finished/cancelled match, or null while the match is not settled. */
export function toFixtureResult(m: NormalizedMatch): FixtureResult | null {
  if (m.status !== 'FINISHED') {
    const short = STATUS_SHORT[m.status];
    return short ? { homeScore: 0, awayScore: 0, htHomeScore: null, htAwayScore: null, statusShort: short } : null;
  }
  if (!m.score) return null;
  return {
    homeScore: m.score.home,
    awayScore: m.score.away,
    htHomeScore: m.halfTime?.home ?? null,
    htAwayScore: m.halfTime?.away ?? null,
    statusShort: m.wentToExtraTime ? 'AET' : 'FT',
    regularHomeScore: m.regularTime?.home ?? null,
    regularAwayScore: m.regularTime?.away ?? null,
    homeCorners: m.stats?.home.corners ?? null,
    awayCorners: m.stats?.away.corners ?? null,
  };
}
