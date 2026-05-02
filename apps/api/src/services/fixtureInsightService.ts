// apps/api/src/services/fixtureInsightService.ts

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

// ─── Team insight ─────────────────────────────────────────────────────────────

function computeTeamInsight(matches: any[], _teamName: string, teamIsHome: boolean): TeamInsight {
  const n = matches.length;
  if (n === 0) {
    return {
      sampleSize: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, cleanSheetPct: 0,
      failedToScorePct: 0, over15Pct: 0, over25Pct: 0, over35Pct: 0, bttsPct: 0,
      avgCornersFor: 0, avgCornersAgainst: 0, avgYellowCards: 0, formLast5: [],
      recentMatches: [],
    };
  }

  const gf = (m: any) => teamIsHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
  const ga = (m: any) => teamIsHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

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
      date: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeScore: m.homeScore, awayScore: m.awayScore, isHome: teamIsHome, 
      homeTeamImageUrl: m.homeTeamImageUrl ?? null, awayTeamImageUrl: m.awayTeamImageUrl ?? null,
      time: m.kickoffAt,
    })),
  };
}

// ─── H2H insight ─────────────────────────────────────────────────────────────

function computeH2HInsight(matches: any[], homeNorm: string, awayNorm: string): H2HInsight {
  const atVenue = matches.filter(m =>
    normaliseTeamName(m.homeTeam) === homeNorm &&
    normaliseTeamName(m.awayTeam) === awayNorm
  );

  const homeWins = matches.filter(m => {
    const teamIsHome = normaliseTeamName(m.homeTeam) === homeNorm;
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

// ─── Sharp odds ───────────────────────────────────────────────────────────────

function buildSharpOddsContext(m: any, homeNorm: string): SharpOddsContext {
  const ph     = m.pinnacleHomeWin!;
  const pd     = m.pinnacleDraw!;
  const pa     = m.pinnacleAwayWin!;
  const margin = 1 / ph + 1 / pd + 1 / pa;
  const norm   = (raw: number) => +(1 / (raw * margin) * 100).toFixed(1);
  const teamIsHome = normaliseTeamName(m.homeTeam) === homeNorm;

  return {
    pinnacleHome: teamIsHome ? ph : pa,
    pinnacleDraw: pd,
    pinnacleAway: teamIsHome ? pa : ph,
    impliedHome:  teamIsHome ? norm(ph) : norm(pa),
    impliedDraw:  norm(pd),
    impliedAway:  teamIsHome ? norm(pa) : norm(ph),
    matchDate: m.date,
    note: `Pinnacle closing odds — ${m.homeTeam} v ${m.awayTeam}, ${m.date.toISOString().slice(0, 10)}`,
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

// ─── Main export ──────────────────────────────────────────────────────────────

const STATS_COMPETITION_MAP: Record<string, string> = {
  'Liga Portugal Betclic': 'Primeira Liga',
  'Liga Portugal 2': 'Segunda Liga',
};

function toStatsCompetition(name: string): string {
  return STATS_COMPETITION_MAP[name] ?? name;
}

function stripClubAffixes(normKey: string): string {
  // Strip common prefix abbreviations (CA = Club Atlético, etc.)
  let s = normKey.replace(/^(fc|afc|ca|cd|cf|gd|sc|sl|ac|as|rc|ud|sd|rcd|ss|us|nk|sk|fk|if|bk) /, '');
  // Strip common suffix abbreviations (BC = Bergamasca Calcio, CFC = Club Football, etc.)
  s = s.replace(/ (fc|afc|cfc|bc|sc|bsc|ssc|calcio)$/, '');
  return s.trim();
}

export async function computeFixtureInsight(fixture: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoffAt: Date;
}): Promise<FixtureInsight> {
  const SAMPLE   = 20;
  const homeNorm = stripClubAffixes(resolveAlias(normaliseTeamName(fixture.homeTeam)));
  const awayNorm = stripClubAffixes(resolveAlias(normaliseTeamName(fixture.awayTeam)));

  const leagueConfig = LEAGUE_MANIFEST.find(l => l.name === fixture.competition);
  const leagueId = leagueConfig?.apiFootballId ?? 0;

  const [homeAtHome, awayAway, h2hMatches] = await Promise.all([
    prisma.matchStat.findMany({
      where: { homeTeamNormKey: homeNorm, competition: toStatsCompetition(fixture.competition), homeScore: { not: null } },
      orderBy: { date: 'desc' },
      take: SAMPLE,
    }),
    prisma.matchStat.findMany({
      where: { awayTeamNormKey: awayNorm, competition: toStatsCompetition(fixture.competition), awayScore: { not: null } },
      orderBy: { date: 'desc' },
      take: SAMPLE,
    }),
    prisma.matchStat.findMany({
      where: {
        OR: [
          { homeTeamNormKey: homeNorm, awayTeamNormKey: awayNorm },
          { homeTeamNormKey: awayNorm, awayTeamNormKey: homeNorm },
        ],
        homeScore: { not: null },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ]);

  const homeInsight = computeTeamInsight(homeAtHome, fixture.homeTeam, true);
  const awayInsight = computeTeamInsight(awayAway, fixture.awayTeam, false);
  const h2hInsight  = computeH2HInsight(h2hMatches, homeNorm, awayNorm);

  const withOdds = h2hMatches.find(m => m.pinnacleHomeWin !== null);
  const sharpOdds: SharpOddsContext = withOdds
    ? buildSharpOddsContext(withOdds, homeNorm)
    : {
        pinnacleHome: null, pinnacleDraw: null, pinnacleAway: null,
        impliedHome: null, impliedDraw: null, impliedAway: null,
        matchDate: null, note: 'No Pinnacle odds available for recent H2H',
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
