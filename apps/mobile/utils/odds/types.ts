/** Mirrors the odds comparator API payloads (apps/api/src/services/odds). */
export type HouseId = 'betclic' | 'lebull' | 'betano' | 'placard' | 'solverde';
export type OddsSport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';

export const HOUSE_ORDER: HouseId[] = ['betclic', 'lebull', 'betano', 'placard', 'solverde'];

export interface HousePrice {
  odds: number;
  suspended: boolean;
}

export interface ComparedSelection {
  key: string | null;
  label: string;
  /** Market text of the house that created the row. */
  market: string;
  prices: Partial<Record<HouseId, HousePrice>>;
  best: HouseId | null;
  /** Original market/selection text per house. */
  labels: Partial<Record<HouseId, { market: string; selection: string }>>;
}

export interface OddsEventInfo {
  home: string;
  away: string;
  startsAt: string;
  competition: string;
  live: boolean;
}

export interface OddsEventView {
  eventKey: string;
  sport: OddsSport;
  event: OddsEventInfo;
  houses: HouseId[];
  rows: ComparedSelection[];
  /** Each house's own participant names (what its market text was keyed with). */
  names?: Partial<Record<HouseId, { home: string; away: string }>>;
}

export interface OddsEventListItem {
  eventKey: string;
  sport: OddsSport;
  event: OddsEventInfo;
  houses: HouseId[];
  houseCount: number;
  main: ComparedSelection[];
}

export interface MultipleResult {
  perHouse: Partial<Record<HouseId, { total: number | null; missing: number }>>;
  best: HouseId | null;
}
