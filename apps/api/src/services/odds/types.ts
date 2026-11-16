/** Sports covered by the odds comparator. */
export type OddsSport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';

/** Betting houses the comparator can read from. */
export type HouseId = 'betclic' | 'betano' | 'lebull' | 'placard' | 'solverde';

/** An event as listed by one house (calendar entry). */
export interface SourceEvent {
  house: HouseId;
  houseEventId: string;
  sport: OddsSport;
  competition: string;
  home: string;
  away: string;
  /** ISO 8601, UTC. */
  startsAt: string;
  live: boolean;
  extraIds?: { betRadarId?: string };
  /** Main market (1X2 / winner / moneyline) as carried by the house's calendar response, when it has one. */
  mainMarkets?: SourceMarket[];
  /** Página do evento na casa, quando é preciso abri-la para os mercados. */
  pageUrl?: string;
  /** ISO country of the competition when the house gives one (Betclic: "PT"). */
  countryCode?: string;
}

/** One selection of one market, with the house's own labels. */
export interface SourceMarket {
  marketLabel: string;
  selectionLabel: string;
  line?: number | null;
  odds: number;
  suspended: boolean;
}

/** Adapter contract: every house implements this and is isolated from the others. */
export interface OddsSource {
  house: HouseId;
  listEvents(sport: OddsSport, fromIso: string, toIso: string): Promise<SourceEvent[]>;
  getMarkets(houseEventId: string, hint?: { pageUrl?: string }): Promise<SourceMarket[]>;
}

/** A house selection plus its canonical key (null = not comparable, shown only for its own house). */
export interface CanonicalSelection {
  key: string | null;
  house: HouseId;
  marketLabel: string;
  selectionLabel: string;
  odds: number;
  suspended: boolean;
}
