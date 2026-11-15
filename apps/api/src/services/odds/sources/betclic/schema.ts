/**
 * Minimal protobuf schema for Betclic's public offering API (gRPC-web,
 * `offering.access.api.MatchService`).
 *
 * Field numbers come from the protobuf-ts descriptors in the public bundle of
 * https://www.betclic.pt (main-JJSWCVBE.js, front 10.7.x, read on 2026-11-15)
 * and were checked against recorded payloads in `__fixtures__/betclic/`.
 * Only the fields the comparator reads are declared; the decoder skips the rest.
 * Field names follow the protobuf-ts JSON names (camelCase); names do not
 * affect the wire format.
 *
 * The schema is a protobufjs JSON descriptor in TypeScript (not a .proto file)
 * so `tsc` ships it in `dist` without a copy step.
 */
import * as protobuf from 'protobufjs';

/** `offering.access.api.SelectionStatus`. */
export const SelectionStatus = { UNSPECIFIED: 0, ONLINE: 1, SUSPENDED: 2, CLOSED: 3 } as const;
export type SelectionStatusValue = (typeof SelectionStatus)[keyof typeof SelectionStatus];

/** `offering.access.api.MarketLayoutType`: where a market keeps its selections. */
export const MarketLayout = {
  UNSPECIFIED: 0,
  MATRIX: 1, // selectionMatrix rows
  SPLIT_CARD: 2, // splitCardGroups (e.g. scorers per team)
  GROUP: 3, // groupMarkets (e.g. 1st half / 2nd half)
  SPACED_BLOCK: 4, // selectionMatrix rows (e.g. 3-way handicap)
  MULTI_CHOICE: 5, // selectionMatrix rows
  TABS: 6, // tabs[].tabMarkets
  SLIDER: 7, // sliders[].sliderValues
  SIMPLE_MARKET: 8, // mainSelections
} as const;

/** `offering.access.api.ScoreboardStatus`. */
export const ScoreboardStatus = { UNSPECIFIED: 0, NOT_STARTED: 1, RUNNING: 2, ENDED: 3, ABANDONED: 4, INTERRUPTED: 5 } as const;

const f = (id: number, type: string, repeated = false) => ({ id, type, ...(repeated ? { rule: 'repeated' } : {}) });

const DESCRIPTOR = {
  nested: {
    GetMatchBySportRequest: {
      fields: {
        sportCode: f(1, 'string'),
        marketTypeCode: f(2, 'string'),
        language: f(3, 'string'),
        offset: f(4, 'int32'),
        limit: f(5, 'int32'),
      },
    },
    GetMatchRequest: {
      fields: { matchId: f(1, 'int64'), language: f(2, 'string'), categoryId: f(3, 'string') },
    },
    // Response oneof `response`: 1 payload (snapshot), 2 notifications (odds updates, not declared).
    GetMatchesBySportResponse: { fields: { payload: f(1, 'GetMatchBySportPayload') } },
    GetMatchBySportPayload: {
      fields: { defaultMarketTypeCode: f(1, 'string'), matches: f(3, 'Match', true), totalCount: f(5, 'int32') },
    },
    GetMatchResponse: { fields: { payload: f(1, 'GetMatchPayload') } },
    GetMatchPayload: { fields: { match: f(1, 'Match') } },
    Match: {
      fields: {
        matchId: f(1, 'int64'),
        name: f(2, 'string'),
        matchDateUtc: f(3, 'string'),
        isLive: f(4, 'bool'),
        openMarketCount: f(7, 'int32'),
        competition: f(8, 'Competition'),
        market: f(9, 'Market'),
        categories: f(10, 'Category', true),
        subCategories: f(11, 'SubCategoryWithMarkets', true),
        contestants: f(12, 'Contestant', true),
        scoreboard: f(13, 'Scoreboard'),
        widgets: f(17, 'Widget', true),
      },
    },
    Competition: {
      fields: { id: f(1, 'int64'), name: f(2, 'string'), sport: f(3, 'Sport'), countryCode: f(5, 'string') },
    },
    Sport: { fields: { code: f(1, 'string'), name: f(2, 'string') } },
    Category: { fields: { id: f(2, 'string'), name: f(3, 'string') } },
    SubCategoryWithMarkets: { fields: { id: f(1, 'string'), name: f(2, 'string'), markets: f(3, 'Market', true) } },
    Contestant: { fields: { contestantId: f(2, 'int64'), name: f(3, 'string'), shortName: f(4, 'string') } },
    Scoreboard: {
      fields: {
        liveDisplayStatus: f(3, 'int32'),
        currentScore: f(7, 'ScoreString'),
        currentPeriodScore: f(8, 'Period'),
        endedPeriodScore: f(9, 'Period', true),
      },
    },
    ScoreString: { fields: { contestant1: f(1, 'string'), contestant2: f(2, 'string') } },
    Period: { fields: { periodIndex: f(1, 'int32'), periodType: f(2, 'string'), score: f(3, 'ScoreString') } },
    // Oneof `widget`; only the Sportradar variant is declared.
    Widget: { fields: { sportradarWidget: f(1, 'SportradarWidget') } },
    SportradarWidget: { fields: { externalMatchRef: f(3, 'string') } },
    Market: {
      fields: {
        id: f(1, 'int64'),
        name: f(2, 'string'),
        betslipName: f(3, 'string'),
        layout: f(9, 'int32'),
        selectionMatrix: f(10, 'NullableSelections', true),
        splitCardGroups: f(11, 'SplitCard', true),
        groupMarkets: f(13, 'Market', true),
        tabs: f(14, 'Tab', true),
        sliders: f(15, 'Slider', true),
        mainSelections: f(16, 'Selection', true),
        position: f(17, 'int32'),
      },
    },
    NullableSelections: { fields: { selections: f(1, 'NullableSelection', true) } },
    // Oneof `selectionOneof`: 1 selection, 2 null_selection (an empty cell in the matrix).
    NullableSelection: { fields: { selection: f(1, 'Selection') } },
    SplitCard: { fields: { name: f(1, 'string'), selections: f(2, 'Selection', true) } },
    Tab: { fields: { name: f(1, 'string'), tabMarkets: f(2, 'Market', true) } },
    Slider: { fields: { name: f(1, 'string'), sliderValues: f(3, 'SliderValue', true) } },
    SliderValue: { fields: { value: f(1, 'double'), selections: f(2, 'NullableSelection', true) } },
    Selection: {
      fields: {
        id: f(1, 'int64'),
        name: f(10, 'string'),
        betslipName: f(11, 'string'),
        odds: f(12, 'double'),
        status: f(14, 'int32'),
        betslipMarketId: f(15, 'int64'),
      },
    },
  },
};

const root = protobuf.Root.fromJSON(DESCRIPTOR);
const T = {
  sportRequest: root.lookupType('GetMatchBySportRequest'),
  matchRequest: root.lookupType('GetMatchRequest'),
  sportResponse: root.lookupType('GetMatchesBySportResponse'),
  matchResponse: root.lookupType('GetMatchResponse'),
};

/** int64 ids come out as decimal strings; repeated fields as [] when absent; scalars keep proto3 defaults. */
const TO_OBJECT: protobuf.IConversionOptions = { longs: String, enums: Number, arrays: true, defaults: true };

export interface BetclicScore {
  contestant1: string;
  contestant2: string;
}
export interface BetclicPeriod {
  periodIndex: number;
  periodType: string; // e.g. "ftb_first_half", "bkb_fourth_quarter", "ten_second_set"
  score: BetclicScore | null;
}
export interface BetclicSelection {
  id: string;
  /** Label as shown, in PT. Lines and handicaps are only in this text ("Acima de 2,5", "Estónia (-1)"). */
  name: string;
  betslipName: string;
  odds: number;
  status: SelectionStatusValue;
  /** Market id of this line (each total/handicap line is its own betslip market). */
  betslipMarketId: string;
}
export interface BetclicMarket {
  id: string;
  name: string;
  betslipName: string;
  layout: number;
  position: number;
  mainSelections: BetclicSelection[];
  selectionMatrix: { selections: { selection: BetclicSelection | null }[] }[];
  splitCardGroups: { name: string; selections: BetclicSelection[] }[];
  groupMarkets: BetclicMarket[];
  tabs: { name: string; tabMarkets: BetclicMarket[] }[];
  sliders: { name: string; sliderValues: { value: number; selections: { selection: BetclicSelection | null }[] }[] }[];
}
export interface BetclicMatch {
  matchId: string;
  /** "Home - Away" (contestant order). */
  name: string;
  /** ISO UTC with 7 decimals, e.g. "2026-11-16T17:00:00.0000000Z". */
  matchDateUtc: string;
  isLive: boolean;
  openMarketCount: number;
  competition: { id: string; name: string; countryCode: string; sport: { code: string; name: string } | null } | null;
  /** Main market of the list request (lists only). */
  market: BetclicMarket | null;
  categories: { id: string; name: string }[];
  /** Markets of the requested category (detail only; "Top" when no category is asked). */
  subCategories: { id: string; name: string; markets: BetclicMarket[] }[];
  contestants: { contestantId: string; name: string; shortName: string }[];
  scoreboard: {
    liveDisplayStatus: number;
    currentScore: BetclicScore | null;
    currentPeriodScore: BetclicPeriod | null;
    endedPeriodScore: BetclicPeriod[];
  } | null;
  widgets: { sportradarWidget: { externalMatchRef: string } | null }[];
}
export interface BetclicMatchesBySportPayload {
  defaultMarketTypeCode: string;
  matches: BetclicMatch[];
  totalCount: number;
}
export interface BetclicMatchPayload {
  match: BetclicMatch | null;
}

/** Thrown when a data frame is not a snapshot (e.g. a notifications frame). */
export class BetclicDecodeError extends Error {}

/**
 * Decodes the protobuf bytes of a `GetMatchesBySportWithNotifications` data frame
 * (without the 5-byte gRPC-web header). Throws when the frame carries no snapshot.
 */
export function decodeMatchesBySportFrame(bytes: Uint8Array): BetclicMatchesBySportPayload {
  const o = T.sportResponse.toObject(T.sportResponse.decode(bytes), TO_OBJECT) as { payload?: BetclicMatchesBySportPayload | null };
  if (!o.payload) throw new BetclicDecodeError('Betclic frame without a matches payload');
  return o.payload;
}

/**
 * Decodes the protobuf bytes of a `GetMatchWithNotification` data frame
 * (without the 5-byte gRPC-web header). Throws when the frame carries no snapshot.
 */
export function decodeMatchFrame(bytes: Uint8Array): BetclicMatchPayload {
  const o = T.matchResponse.toObject(T.matchResponse.decode(bytes), TO_OBJECT) as { payload?: BetclicMatchPayload | null };
  if (!o.payload) throw new BetclicDecodeError('Betclic frame without a match payload');
  return o.payload;
}

/** Encodes a `GetMatchBySportRequest` (server caps a page at 40 matches today). */
export function encodeMatchesBySportRequest(req: {
  sportCode: string;
  language: string;
  offset: number;
  limit: number;
  marketTypeCode?: string;
}): Uint8Array {
  const msg: Record<string, unknown> = { sportCode: req.sportCode, language: req.language, limit: req.limit };
  if (req.offset) msg.offset = req.offset;
  if (req.marketTypeCode) msg.marketTypeCode = req.marketTypeCode;
  return T.sportRequest.encode(T.sportRequest.fromObject(msg)).finish();
}

/** Encodes a `GetMatchRequest`; without `categoryId` the server returns the "Top" sub-category. */
export function encodeMatchRequest(req: { matchId: string; language: string; categoryId?: string }): Uint8Array {
  const msg: Record<string, unknown> = { matchId: req.matchId, language: req.language };
  if (req.categoryId) msg.categoryId = req.categoryId;
  return T.matchRequest.encode(T.matchRequest.fromObject(msg)).finish();
}
