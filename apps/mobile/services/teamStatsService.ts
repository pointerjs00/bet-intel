import { useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamStatData {
  id: string;
  team: string;
  competition: string;
  season: string;
  country: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number | null;
  homeWon: number;
  homeDrawn: number;
  homeLost: number;
  homeGoalsFor: number;
  homeGoalsAgainst: number;
  awayWon: number;
  awayDrawn: number;
  awayLost: number;
  awayGoalsFor: number;
  awayGoalsAgainst: number;
  cleanSheets: number;
  failedToScore: number;
  bttsCount: number;
  over25Count: number;
  over15Count: number;
  formLast5: string | null;
  htWon: number;
  htDrawn: number;
  htLost: number;
  comebacks: number;
  // Computed server-side
  goalDifference: number;
  bttsRate: number;
  over25Rate: number;
  over15Rate: number;
  cleanSheetRate: number;
}

export interface H2HFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  homeScore: number;
  awayScore: number;
  kickoffAt: string;
  season: string;
}

export interface TeamInsight {
  sampleSize:        number;
  avgGoalsFor:       number;
  avgGoalsAgainst:   number;
  cleanSheetPct:     number;
  failedToScorePct:  number;
  over15Pct:         number;
  over25Pct:         number;
  over35Pct:         number;
  bttsPct:           number;
  avgCornersFor:     number;
  avgCornersAgainst: number;
  avgYellowCards:    number;
  formLast5:         ('W' | 'D' | 'L')[];
  recentMatches:     {
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    isHome: boolean;
  }[];
}

export interface H2HInsight {
  total:           number;
  atVenue:         number;
  homeWins:        number;
  draws:           number;
  awayWins:        number;
  avgGoalsPerGame: number;
  over25Pct:       number;
  bttsPct:         number;
  recentMatches:   {
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
  }[];
}

export interface SharpOdds {
  pinnacleHome: number | null;
  pinnacleDraw: number | null;
  pinnacleAway: number | null;
  impliedHome:  number | null;
  impliedDraw:  number | null;
  impliedAway:  number | null;
  matchDate:    string | null;
  note:         string;
  matchLabel?:  string;
}

export interface FixtureInsight {
  fixtureId:      string;
  homeTeam:       string;
  awayTeam:       string;
  competition:    string;
  kickoffAt:      string;
  computedAt:     string;
  homeTeamAtHome: TeamInsight | null;
  awayTeamAway:   TeamInsight | null;
  combinedOver25: number;
  combinedBtts:   number;
  h2h:            H2HInsight;
  sharpOdds:      SharpOdds;
  homeInjuries:   { playerName: string; type: string; reason?: string }[];
  awayInjuries:   { playerName: string; type: string; reason?: string }[];
  homeTopScorers: { playerName: string; goals: number; assists?: number }[];
  awayTopScorers: { playerName: string; goals: number; assists?: number }[];
  standings:      { home: TeamStatData | null; away: TeamStatData | null };
  message?:       string;
}

export interface CompetitionStats {
  competition: string;
  season: string;
  played: number;
  avgGoalsPerMatch: number;
  bttsRate: number;
  over25Rate: number;
  over15Rate: number;
  biggestWin: {
    margin: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    date: string;
  };
  highestScoring: {
    total: number;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    date: string;
  };
}

// ─── Request functions ────────────────────────────────────────────────────────

async function fetchLeagueTable(
  competition: string,
  season: string,
): Promise<TeamStatData[]> {
  try {
    const { data } = await apiClient.get('/fixtures/standings', {
      params: { competition, season },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchTeamStats(
  team: string,
  competition: string,
  season: string,
): Promise<TeamStatData[]> {
  try {
    const { data } = await apiClient.get('/fixtures/team-stats', {
      params: { team, competition, season },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchH2H(homeTeam: string, awayTeam: string): Promise<H2HFixture[]> {
  try {
    const { data } = await apiClient.get('/fixtures/h2h', {
      params: { homeTeam, awayTeam },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchCompetitionStats(
  competition: string,
  season: string,
): Promise<CompetitionStats | null> {
  try {
    const { data } = await apiClient.get('/fixtures/competition-stats', {
      params: { competition, season },
    });
    return data.data ?? null;
  } catch {
    return null;
  }
}

async function fetchFixtureInsight(fixtureId: string): Promise<FixtureInsight | null> {
  try {
    const { data } = await apiClient.get(`/fixtures/${fixtureId}/insight`);
    return data ?? null;
  } catch {
    return null;
  }
}

// ─── React Query hooks ────────────────────────────────────────────────────────

const STALE = 60 * 60 * 1000; // 1 hour

// Season stored in DB is "2025-26" — match it exactly.
const CURRENT_SEASON = '2025-26';

export function useLeagueTable(competition: string, season = CURRENT_SEASON) {
  return useQuery({
    queryKey: ['fixtures', 'standings', competition, season],
    queryFn: () => fetchLeagueTable(competition, season),
    enabled: competition.length > 0,
    staleTime: STALE,
    retry: false,
  });
}

export function useTeamStats(
  team: string,
  competition: string,
  options?: { enabled?: boolean; season?: string },
) {
  const season = options?.season ?? CURRENT_SEASON;
  return useQuery({
    queryKey: ['fixtures', 'team-stats', team, competition, season],
    queryFn: () => fetchTeamStats(team, competition, season),
    enabled: options?.enabled !== false && team.length > 0,
    staleTime: STALE,
    retry: false,
  });
}

export function useHeadToHead(
  homeTeam: string,
  awayTeam: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['fixtures', 'h2h', homeTeam, awayTeam],
    queryFn: () => fetchH2H(homeTeam, awayTeam),
    enabled:
      options?.enabled !== false &&
      homeTeam.length > 0 &&
      awayTeam.length > 0,
    staleTime: STALE,
    retry: false,
  });
}

export function useCompetitionStats(competition: string, season = CURRENT_SEASON) {
  return useQuery({
    queryKey: ['fixtures', 'competition-stats', competition, season],
    queryFn: () => fetchCompetitionStats(competition, season),
    enabled: competition.length > 0,
    staleTime: STALE,
    retry: false,
  });
}

export function useFixtureInsight(fixtureId: string | null) {
  return useQuery({
    queryKey: ['fixtures', 'insight', fixtureId],
    queryFn: () => fetchFixtureInsight(fixtureId!),
    enabled: !!fixtureId,
    staleTime: STALE,
    retry: false,
  });
}

// ─── New insight types ────────────────────────────────────────────────────────

export interface FixtureMatchStats {
  id: string;
  fixtureId: string;
  homePossession: number | null;
  awayPossession: number | null;
  homeShotsTotal: number | null;
  awayShotsTotal: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeShotsBlocked: number | null;
  awayShotsBlocked: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeOffsides: number | null;
  awayOffsides: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
  homeGkSaves: number | null;
  awayGkSaves: number | null;
  homePassesTotal: number | null;
  awayPassesTotal: number | null;
  homePassesAccurate: number | null;
  awayPassesAccurate: number | null;
  homePassPct: number | null;
  awayPassPct: number | null;
  homeXg: number | null;
  awayXg: number | null;
}

export interface FixtureEvent {
  id: string;
  fixtureId: string;
  minute: number;
  extraMinute: number | null;
  teamId: number | null;
  teamName: string;
  isHome: boolean;
  type: string;
  detail: string | null;
  comments: string | null;
  playerName: string | null;
  playerApiId: number | null;
  assistName: string | null;
  assistApiId: number | null;
}

export interface FixtureLineup {
  id: string;
  fixtureId: string;
  teamId: number;
  teamName: string;
  isHome: boolean;
  formation: string | null;
  coachId: number | null;
  coachName: string | null;
  startingXI: { player: { id: number; name: string }; pos: string; grid?: string }[];
  substitutes: { player: { id: number; name: string }; pos: string }[];
}

export interface FixturePrediction {
  id: string;
  fixtureId: string;
  winnerTeamId: number | null;
  winnerTeamName: string | null;
  winnerComment: string | null;
  winPctHome: number | null;
  winPctDraw: number | null;
  winPctAway: number | null;
  goalsHome: number | null;
  goalsAway: number | null;
  advice: string | null;
  overUnder: string | null;
  btts: boolean | null;
  h2hHomeWins: number | null;
  h2hDraws: number | null;
  h2hAwayWins: number | null;
}

export interface PlayerStatData {
  playerId: number;
  playerName: string;
  playerImageUrl: string | null;
  nationality: string | null;
  age: number | null;
  position: string | null;
  number: number | null;
  teamName: string;
  leagueName: string;
  appearances: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  dribbles: number;
  dribblesWon: number;
  keyPasses: number;
  passAccuracy: number | null;
  tackles: number;
  interceptions: number;
  yellowCards: number;
  yellowRed: number;
  redCards: number;
  rating: number | null;
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

async function fetchFixtureStats(fixtureId: string): Promise<FixtureMatchStats | null> {
  try {
    const { data } = await apiClient.get(`/fixtures/${fixtureId}/stats`);
    return data.data ?? null;
  } catch { return null; }
}

async function fetchFixtureEvents(fixtureId: string): Promise<FixtureEvent[]> {
  try {
    const { data } = await apiClient.get(`/fixtures/${fixtureId}/events`);
    return data.data ?? [];
  } catch { return []; }
}

async function fetchFixtureLineups(fixtureId: string): Promise<FixtureLineup[]> {
  try {
    const { data } = await apiClient.get(`/fixtures/${fixtureId}/lineups`);
    return data.data ?? [];
  } catch { return []; }
}

async function fetchFixturePrediction(fixtureId: string): Promise<FixturePrediction | null> {
  try {
    const { data } = await apiClient.get(`/fixtures/${fixtureId}/prediction`);
    return data.data ?? null;
  } catch { return null; }
}

async function fetchTeamPlayerStats(team: string, leagueId?: number): Promise<PlayerStatData[]> {
  try {
    const { data } = await apiClient.get('/fixtures/player-stats', {
      params: { team, ...(leagueId ? { league: leagueId } : {}) },
    });
    return data.data ?? [];
  } catch { return []; }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useFixtureMatchStats(fixtureId: string | null) {
  return useQuery({
    queryKey: ['fixtures', 'match-stats', fixtureId],
    queryFn: () => fetchFixtureStats(fixtureId!),
    enabled: !!fixtureId,
    staleTime: STALE,
    retry: false,
  });
}

export function useFixtureEvents(fixtureId: string | null) {
  return useQuery({
    queryKey: ['fixtures', 'events', fixtureId],
    queryFn: () => fetchFixtureEvents(fixtureId!),
    enabled: !!fixtureId,
    staleTime: STALE,
    retry: false,
  });
}

export function useFixtureLineups(fixtureId: string | null) {
  return useQuery({
    queryKey: ['fixtures', 'lineups', fixtureId],
    queryFn: () => fetchFixtureLineups(fixtureId!),
    enabled: !!fixtureId,
    staleTime: STALE,
    retry: false,
  });
}

export function useFixturePrediction(fixtureId: string | null) {
  return useQuery({
    queryKey: ['fixtures', 'prediction', fixtureId],
    queryFn: () => fetchFixturePrediction(fixtureId!),
    enabled: !!fixtureId,
    staleTime: STALE,
    retry: false,
  });
}

export function useTeamPlayerStats(team: string, leagueId?: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['fixtures', 'player-stats', team, leagueId ?? 'all'],
    queryFn: () => fetchTeamPlayerStats(team, leagueId),
    enabled: options?.enabled !== false && team.length > 0,
    staleTime: STALE,
    retry: false,
  });
}