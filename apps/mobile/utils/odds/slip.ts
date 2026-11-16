import type { ComparedSelection, OddsEventView, OddsSport } from './types';

/** One selection of the odds multiple. */
export interface SlipLeg {
  eventKey: string;
  selectionKey: string;
  label: string;
  market: string;
  home: string;
  away: string;
  startsAt: string;
  sport: OddsSport;
  competition: string;
}

export const MAX_LEGS = 30;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export type AddResult = { legs: SlipLeg[]; outcome: 'added' | 'replaced' | 'full' | 'invalid' };

/** Adds a leg; same event replaces in place, a 31st event is refused. */
export function addLeg(legs: SlipLeg[], leg: SlipLeg): AddResult {
  const idx = legs.findIndex((l) => l.eventKey === leg.eventKey);
  if (idx >= 0) {
    const next = legs.slice();
    next[idx] = leg;
    return { legs: next, outcome: 'replaced' };
  }
  if (legs.length >= MAX_LEGS) return { legs, outcome: 'full' };
  return { legs: [...legs, leg], outcome: 'added' };
}

/** Removes the exact selection if present, otherwise adds it. */
export function toggleLeg(legs: SlipLeg[], leg: SlipLeg): AddResult & { removed?: boolean } {
  if (legs.some((l) => l.eventKey === leg.eventKey && l.selectionKey === leg.selectionKey)) {
    return { legs: legs.filter((l) => l.eventKey !== leg.eventKey), outcome: 'added', removed: true };
  }
  return addLeg(legs, leg);
}

/** Drops legs whose event started more than 3 h before `now`. */
export function pruneLegs(legs: SlipLeg[], now: number): SlipLeg[] {
  return legs.filter((l) => {
    const t = Date.parse(l.startsAt);
    return Number.isNaN(t) || t >= now - STALE_AFTER_MS;
  });
}

/** Builds a leg from a compared row; null when the row has no canonical key. */
export function legFromRow(view: Pick<OddsEventView, 'eventKey' | 'sport' | 'event'>, row: ComparedSelection): SlipLeg | null {
  if (row.key === null) return null;
  return {
    eventKey: view.eventKey,
    selectionKey: row.key,
    label: row.label,
    market: row.market,
    home: view.event.home,
    away: view.event.away,
    startsAt: view.event.startsAt,
    sport: view.sport,
    competition: view.event.competition,
  };
}
