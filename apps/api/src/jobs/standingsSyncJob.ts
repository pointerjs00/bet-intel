// apps/api/src/jobs/standingsSyncJob.ts

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { LEAGUE_MANIFEST, type LeagueConfig } from '../config/leagueManifest';
import { getCurrentSeason } from '../utils/seasonUtils';
import { normaliseTeamName } from '../utils/nameNormalisation';

const FDORG_BASE = 'https://api.football-data.org/v4/competitions';

async function fetchFdOrgStandings(code: string): Promise<any[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${FDORG_BASE}/${code}/standings`, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_ORG_KEY ?? '' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.standings?.find((s: any) => s.type === 'TOTAL')?.table ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertTeamStatFromTable(row: any, league: LeagueConfig, season: string) {
  const teamNormKey = normaliseTeamName(row.team.name);
  await prisma.teamStat.upsert({
    where: {
      teamstat_unique: {
        team: row.team.name,
        competition: league.name,
        season,
      },
    },
    update: {
      teamNormKey,
      teamName: row.team.name,
      position: row.position,
      played:   row.playedGames,
      won:      row.won,
      drawn:    row.draw,
      lost:     row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      points:   row.points,
      standingsSource: 'football-data.org',
    },
    create: {
      team: row.team.name,
      teamNormKey,
      teamName: row.team.name,
      competition: league.name,
      season,
      country: league.country,
      position: row.position,
      played:   row.playedGames,
      won:      row.won,
      drawn:    row.draw,
      lost:     row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      points:   row.points,
      standingsSource: 'football-data.org',
    },
  });
}

async function recomputeStandingsFromFixtures(league: LeagueConfig, season: string) {
  const fixtures = await prisma.fixture.findMany({
    where: { competition: league.name, season, status: 'FINISHED' },
  });

  const map: Record<string, any> = {};
  const init = (t: string) => {
    if (!map[t]) {
      map[t] = {
        teamName: t, teamNormKey: normaliseTeamName(t),
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
      };
    }
  };

  for (const f of fixtures) {
    if (f.homeScore == null || f.awayScore == null) continue;
    init(f.homeTeam); init(f.awayTeam);
    map[f.homeTeam].played++; map[f.awayTeam].played++;
    map[f.homeTeam].goalsFor    += f.homeScore;
    map[f.homeTeam].goalsAgainst += f.awayScore;
    map[f.awayTeam].goalsFor    += f.awayScore;
    map[f.awayTeam].goalsAgainst += f.homeScore;
    if (f.homeScore > f.awayScore) {
      map[f.homeTeam].won++; map[f.homeTeam].points += 3; map[f.awayTeam].lost++;
    } else if (f.homeScore < f.awayScore) {
      map[f.awayTeam].won++; map[f.awayTeam].points += 3; map[f.homeTeam].lost++;
    } else {
      map[f.homeTeam].drawn++; map[f.homeTeam].points++;
      map[f.awayTeam].drawn++; map[f.awayTeam].points++;
    }
  }

  const sorted = Object.values(map).sort((a: any, b: any) =>
    b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  );

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    await prisma.teamStat.upsert({
      where: {
        teamstat_unique: {
          team: entry.teamName,
          competition: league.name,
          season,
        },
      },
      update: {
        teamNormKey: entry.teamNormKey,
        teamName:    entry.teamName,
        position:    i + 1,
        played:      entry.played,
        won:         entry.won,
        drawn:       entry.drawn,
        lost:        entry.lost,
        goalsFor:    entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        points:      entry.points,
        standingsSource: 'computed',
      },
      create: {
        team:        entry.teamName,
        teamNormKey: entry.teamNormKey,
        teamName:    entry.teamName,
        competition: league.name,
        season,
        country:     league.country,
        position:    i + 1,
        played:      entry.played,
        won:         entry.won,
        drawn:       entry.drawn,
        lost:        entry.lost,
        goalsFor:    entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        points:      entry.points,
        standingsSource: 'computed',
      },
    });
  }
}

export async function standingsSyncJob() {
  await runJob('standingsSync', async () => {
    const season = getCurrentSeason();
    let calls = 0;

    for (const league of LEAGUE_MANIFEST) {
      if (league.hasFreeStandings && league.fdOrgCode) {
        const table = await fetchFdOrgStandings(league.fdOrgCode);
        if (table) {
          for (const row of table) {
            await upsertTeamStatFromTable(row, league, season);
          }
          calls++;
        }
        await new Promise(r => setTimeout(r, 1_500)); // 10 req/min limit
      } else {
        await recomputeStandingsFromFixtures(league, season);
      }
      await redis.del(`standings:${league.apiFootballId}:${season}`);
    }

    return { apiCallsMade: calls };
  });
}
