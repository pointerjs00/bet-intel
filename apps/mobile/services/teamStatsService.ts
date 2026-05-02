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

export interface CompetitionStats {
  competition: string;
  season: string;
  played: number;
  avgGoalsPerMatch: number;
  bttsRate: number;
  over25Rate: number;
  over15Rate: number;
  biggestWin: { margin: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; date: string };
  highestScoring: { total: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; date: string };
}

// ─── Request functions ────────────────────────────────────────────────────────

async function fetchLeagueTable(competition: string, season: string): Promise<TeamStatData[]> {
  try {
    const { data } = await apiClient.get('/fixtures/standings', { params: { competition, season } });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchTeamStats(team: string, competition: string, season: string): Promise<TeamStatData[]> {
  try {
    const { data } = await apiClient.get('/fixtures/team-stats', { params: { team, competition, season } });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchH2H(homeTeam: string, awayTeam: string): Promise<H2HFixture[]> {
  try {
    const { data } = await apiClient.get('/fixtures/h2h', { params: { homeTeam, awayTeam } });
    return data.data ?? [];
  } catch {
    return [];
  }
}

async function fetchCompetitionStats(competition: string, season: string): Promise<CompetitionStats | null> {
  try {
    const { data } = await apiClient.get('/fixtures/competition-stats', { params: { competition, season } });
    return data.data ?? null;
  } catch {
    return null;
  }
}

// ─── React Query hooks ────────────────────────────────────────────────────────

const STALE = 60 * 60 * 1000; // 1 hour

export function useLeagueTable(competition: string, season = '2025-26') {
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
  const season = options?.season ?? '2025-26';
  return useQuery({
    queryKey: ['fixtures', 'team-stats', team, competition, season],
    queryFn: () => fetchTeamStats(team, competition, season),
    enabled: (options?.enabled !== false) && team.length > 0,
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
    enabled: (options?.enabled !== false) && homeTeam.length > 0 && awayTeam.length > 0,
    staleTime: STALE,
    retry: false,
  });
}

export function useCompetitionStats(competition: string, season = '2025-26') {
  return useQuery({
    queryKey: ['fixtures', 'competition-stats', competition, season],
    queryFn: () => fetchCompetitionStats(competition, season),
    enabled: competition.length > 0,
    staleTime: STALE,
    retry: false,
  });
}
