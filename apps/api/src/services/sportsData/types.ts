// Normalised sports data model shared by every provider adapter (ESPN, FotMob, LiveScore, WTA).
// The rest of the app only sees these types, never a provider's raw format.

export type ProviderId = 'espn' | 'fotmob' | 'livescore' | 'wta';

export type MatchStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'HALFTIME'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'ABANDONED'
  | 'SUSPENDED';

export interface ScorePair { home: number; away: number }

export type IncidentType = 'GOAL' | 'OWN_GOAL' | 'PENALTY_GOAL' | 'PENALTY_MISSED' | 'YELLOW' | 'SECOND_YELLOW' | 'RED' | 'SUB' | 'VAR';

export interface MatchIncident {
  type: IncidentType;
  /** Display minute, e.g. "36'" or "90'+4'". */
  minute: string;
  /** Elapsed seconds when the provider gives it (for ordering). */
  clockSeconds: number | null;
  /** 1 = first half, 2 = second half, 3/4 = extra time. */
  period?: number | null;
  side: 'home' | 'away' | null;
  player: string | null;
  /** Goals: the assisting player. Substitutions: the player who came off. */
  assist: string | null;
}

export interface MatchTeamStats {
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possession: number | null;
  fouls: number | null;
  offsides?: number | null;
}

/** Corners and cards split by half (first-half markets). */
export interface HalfSplit { home: number; away: number }

/** One player's line in the match (for scorer, card and player-stat markets). */
export interface MatchPlayer {
  name: string;
  side: 'home' | 'away';
  started: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface NormalizedMatch {
  provider: ProviderId;
  providerMatchId: string;
  sport: 'FOOTBALL' | 'TENNIS';
  competition: { providerId: string; name: string; slug: string | null };
  kickoffAt: string; // ISO-8601 UTC
  status: MatchStatus;
  /** Provider's own short status text ("FT", "HT", "67'"). */
  statusDetail: string;
  home: { providerId: string; name: string };
  away: { providerId: string; name: string };
  /** Current or final score (includes extra time when played). */
  score: ScorePair | null;
  halfTime: ScorePair | null;
  /** 90-minute score: what bookmakers settle "regular time" markets on. */
  regularTime: ScorePair | null;
  wentToExtraTime: boolean;
  stats: { home: MatchTeamStats; away: MatchTeamStats } | null;
  /** Corners per half (from the play-by-play), when available. */
  cornersByHalf?: { first: HalfSplit; second: HalfSplit } | null;
  /** Players who took part, with their stats; null when the provider has no line-ups. */
  players?: MatchPlayer[] | null;
  incidents: MatchIncident[];
  venue: string | null;
}
