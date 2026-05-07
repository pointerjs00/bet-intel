// apps/api/src/services/fixtureInsightService.ts
//
// Computes fixture insight data exclusively from the Fixture table,
// which is populated by API-Football. Team name lookups use
// normaliseTeamName only — same transform as storage, so names always match.

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { resolveAlias } from '../utils/teamAliases';
import { getCurrentSeason } from '../utils/seasonUtils';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamInsight {
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
  recentMatches:     (MatchSummary & { isHome: boolean })[];
}

interface MatchSummary {
  date:      Date;
  homeTeam:  string;
  awayTeam:  string;
  homeScore: number | null;
  awayScore: number | null;
}

interface H2HInsight {
  total:           number;
  atVenue:         number;
  homeWins:        number;
  draws:           number;
  awayWins:        number;
  avgGoalsPerGame: number;
  over25Pct:       number;
  bttsPct:         number;
  recentMatches:   MatchSummary[];
}

interface SharpOddsContext {
  pinnacleHome: number | null;
  pinnacleDraw: number | null;
  pinnacleAway: number | null;
  impliedHome:  number | null;
  impliedDraw:  number | null;
  impliedAway:  number | null;
  matchDate:    Date | null;
  note:         string;
}

export interface FixtureInsight {
  fixtureId:      string;
  homeTeam:       string;
  awayTeam:       string;
  competition:    string;
  kickoffAt:      Date;
  computedAt:     Date;
  homeTeamAtHome: TeamInsight;
  awayTeamAway:   TeamInsight;
  combinedOver25: number;
  combinedBtts:   number;
  h2h:            H2HInsight;
  sharpOdds:      SharpOddsContext;
  homeInjuries:   any[];
  awayInjuries:   any[];
  homeTopScorers: any[];
  awayTopScorers: any[];
  standings:      { home: any | null; away: any | null };
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

const avg = (arr: number[]) =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
const pct = (count: number, total: number) =>
  total ? Math.round((count / total) * 100) : 0;
const average = (a: number, b: number) =>
  Math.round((a + b) / 2);

// ─── Shared match shape ───────────────────────────────────────────────────────

interface MatchShape {
  homeTeam:    string;
  awayTeam:    string;
  homeScore:   number | null;
  awayScore:   number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellow:  number | null;
  awayYellow:  number | null;
  date:        Date;
}

// ─── Team insight ─────────────────────────────────────────────────────────────

function computeTeamInsight(matches: MatchShape[], _teamName: string, teamIsHome: boolean): TeamInsight {
  const n = matches.length;
  if (n === 0) {
    return {
      sampleSize: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, cleanSheetPct: 0,
      failedToScorePct: 0, over15Pct: 0, over25Pct: 0, over35Pct: 0, bttsPct: 0,
      avgCornersFor: 0, avgCornersAgainst: 0, avgYellowCards: 0, formLast5: [],
      recentMatches: [],
    };
  }

  const gf = (m: MatchShape) => teamIsHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
  const ga = (m: MatchShape) => teamIsHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

  return {
    sampleSize:        n,
    avgGoalsFor:       avg(matches.map(gf)),
    avgGoalsAgainst:   avg(matches.map(ga)),
    cleanSheetPct:     pct(matches.filter(m => ga(m) === 0).length, n),
    failedToScorePct:  pct(matches.filter(m => gf(m) === 0).length, n),
    over15Pct:  pct(matches.filter(m => (m.homeScore ?? 0) + (m.awayScore ?? 0) > 1).length, n),
    over25Pct:  pct(matches.filter(m => (m.homeScore ?? 0) + (m.awayScore ?? 0) > 2).length, n),
    over35Pct:  pct(matches.filter(m => (m.homeScore ?? 0) + (m.awayScore ?? 0) > 3).length, n),
    bttsPct:    pct(matches.filter(m => (m.homeScore ?? 0) > 0 && (m.awayScore ?? 0) > 0).length, n),
    avgCornersFor:     avg(matches.map(m => teamIsHome ? (m.homeCorners ?? 0) : (m.awayCorners ?? 0))),
    avgCornersAgainst: avg(matches.map(m => teamIsHome ? (m.awayCorners ?? 0) : (m.homeCorners ?? 0))),
    avgYellowCards:    avg(matches.map(m => teamIsHome ? (m.homeYellow ?? 0) : (m.awayYellow ?? 0))),
    formLast5: matches.slice(0, 5).map(m => {
      const scored   = gf(m);
      const conceded = ga(m);
      return scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
    }),
    recentMatches: matches.slice(0, 20).map(m => ({
      date:      m.date,
      homeTeam:  m.homeTeam,
      awayTeam:  m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      isHome:    teamIsHome,
    })),
  };
}

// ─── H2H insight ─────────────────────────────────────────────────────────────

function computeH2HInsight(matches: MatchShape[], homeNormKey: string, awayNormKey: string): H2HInsight {
  const atVenue = matches.filter(m =>
    normaliseTeamName(m.homeTeam) === homeNormKey &&
    normaliseTeamName(m.awayTeam) === awayNormKey
  );

  const homeWins = matches.filter(m => {
    const teamIsHome = normaliseTeamName(m.homeTeam) === homeNormKey;
    return teamIsHome
      ? (m.homeScore ?? 0) > (m.awayScore ?? 0)
      : (m.awayScore ?? 0) > (m.homeScore ?? 0);
  }).length;

  const draws  = matches.filter(m => (m.homeScore ?? 0) === (m.awayScore ?? 0)).length;
  const totals = matches
    .filter(m => m.homeScore != null && m.awayScore != null)
    .map(m => (m.homeScore ?? 0) + (m.awayScore ?? 0));

  return {
    total:   matches.length,
    atVenue: atVenue.length,
    homeWins,
    draws,
    awayWins: matches.length - homeWins - draws,
    avgGoalsPerGame: totals.length ? +(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2) : 0,
    over25Pct: pct(totals.filter(t => t > 2).length, totals.length),
    bttsPct:   pct(matches.filter(m => (m.homeScore ?? 0) > 0 && (m.awayScore ?? 0) > 0).length, matches.length),
    recentMatches: matches.slice(0, 5).map(m => ({
      date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeScore: m.homeScore, awayScore: m.awayScore,
    })),
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getTeamInjuries(teamName: string, leagueId: number) {
  const teamNorm = resolveAlias(normaliseTeamName(teamName));
  const cacheKey = `injuries:${teamNorm}:${leagueId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await prisma.playerAvailability.findMany({
    where: { teamNormKey: teamNorm, leagueId, season: getCurrentSeason() },
    orderBy: { playerName: 'asc' },
  });
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
  return result;
}

async function getTeamTopScorers(teamName: string, leagueId: number, limit = 3) {
  return prisma.topScorer.findMany({
    where: {
      teamNormKey: resolveAlias(normaliseTeamName(teamName)),
      leagueId,
      season: getCurrentSeason(),
      type: 'goals',
    },
    orderBy: { rank: 'asc' },
    take: limit,
  });
}

async function getStandingRows(homeTeam: string, awayTeam: string, competition: string) {
  const season = getCurrentSeason();
  const [home, away] = await Promise.all([
    prisma.teamStat.findFirst({
      where: { teamNormKey: resolveAlias(normaliseTeamName(homeTeam)), competition, season },
    }),
    prisma.teamStat.findFirst({
      where: { teamNormKey: resolveAlias(normaliseTeamName(awayTeam)), competition, season },
    }),
  ]);
  return { home, away };
}

// ─── Map Fixture row to MatchShape ────────────────────────────────────────────

function fixtureToShape(f: {
  homeTeam: string; awayTeam: string;
  homeScore: number | null; awayScore: number | null;
  kickoffAt: Date;
}): MatchShape {
  return {
    homeTeam:    f.homeTeam,
    awayTeam:    f.awayTeam,
    homeScore:   f.homeScore,
    awayScore:   f.awayScore,
    // Fixture table doesn't store corners/cards — default to null (renders as 0 in averages)
    homeCorners: null,
    awayCorners: null,
    homeYellow:  null,
    awayYellow:  null,
    date:        f.kickoffAt,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function computeFixtureInsight(fixture: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: Date;
}): Promise<FixtureInsight> {
  const SAMPLE = 20;

  // Use same normalisation as fixture storage — guarantees exact key match
  const homeNormKey = normaliseTeamName(fixture.homeTeam);
  const awayNormKey = normaliseTeamName(fixture.awayTeam);

  const leagueConfig = LEAGUE_MANIFEST.find(l => l.name === fixture.competition);
  const leagueId = leagueConfig?.apiFootballId ?? 0;

  const [homeAtHome, awayAway, h2hMatches] = await Promise.all([
    // Home team's last SAMPLE finished home games in this competition
    prisma.fixture.findMany({
      where: {
        homeTeamNormKey: homeNormKey,
        competition: fixture.competition,
        status: 'FINISHED',
        homeScore: { not: null },
        id: { not: fixture.id },
      },
      orderBy: { kickoffAt: 'desc' },
      take: SAMPLE,
    }),
    // Away team's last SAMPLE finished away games in this competition
    prisma.fixture.findMany({
      where: {
        awayTeamNormKey: awayNormKey,
        competition: fixture.competition,
        status: 'FINISHED',
        awayScore: { not: null },
        id: { not: fixture.id },
      },
      orderBy: { kickoffAt: 'desc' },
      take: SAMPLE,
    }),
    // H2H across all competitions and seasons
    prisma.fixture.findMany({
      where: {
        OR: [
          { homeTeamNormKey: homeNormKey, awayTeamNormKey: awayNormKey },
          { homeTeamNormKey: awayNormKey, awayTeamNormKey: homeNormKey },
        ],
        status: 'FINISHED',
        homeScore: { not: null },
        id: { not: fixture.id },
      },
      orderBy: { kickoffAt: 'desc' },
      take: 10,
    }),
  ]);

  const homeInsight = computeTeamInsight(homeAtHome.map(fixtureToShape), fixture.homeTeam, true);
  const awayInsight = computeTeamInsight(awayAway.map(fixtureToShape), fixture.awayTeam, false);
  const h2hInsight  = computeH2HInsight(h2hMatches.map(fixtureToShape), homeNormKey, awayNormKey);

  const sharpOdds: SharpOddsContext = {
    pinnacleHome: null, pinnacleDraw: null, pinnacleAway: null,
    impliedHome: null, impliedDraw: null, impliedAway: null,
    matchDate: null, note: 'No Pinnacle odds available',
  };

  const [homeInjuries, awayInjuries, homeTopScorers, awayTopScorers, standings] =
    await Promise.all([
      getTeamInjuries(fixture.homeTeam, leagueId),
      getTeamInjuries(fixture.awayTeam, leagueId),
      getTeamTopScorers(fixture.homeTeam, leagueId, 3),
      getTeamTopScorers(fixture.awayTeam, leagueId, 3),
      getStandingRows(fixture.homeTeam, fixture.awayTeam, fixture.competition),
    ]);

  return {
    fixtureId:      fixture.id,
    homeTeam:       fixture.homeTeam,
    awayTeam:       fixture.awayTeam,
    competition:    fixture.competition,
    kickoffAt:      fixture.kickoffAt,
    computedAt:     new Date(),
    homeTeamAtHome: homeInsight,
    awayTeamAway:   awayInsight,
    combinedOver25: average(homeInsight.over25Pct, awayInsight.over25Pct),
    combinedBtts:   average(homeInsight.bttsPct, awayInsight.bttsPct),
    h2h:            h2hInsight,
    sharpOdds,
    homeInjuries,
    awayInjuries,
    homeTopScorers,
    awayTopScorers,
    standings,
  };
}
