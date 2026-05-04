// apps/api/src/jobs/standingsSyncJob.ts

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { logger } from '../utils/logger';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason, canonicalToApiFootballSeason } from '../utils/seasonUtils';

async function syncLeagueStandings(
  leagueId: number,
  leagueName: string,
  country: string,
  apiSeason: number,
  season: string,
): Promise<number> {
  const resp = await apiFootball.get<any>('/standings', { league: leagueId, season: apiSeason });
  const rows: any[] = resp?.response?.[0]?.league?.standings?.[0] ?? [];

  for (const row of rows) {
    const teamName    = row.team.name as string;
    const teamNormKey = normaliseTeamName(teamName);
    const formLast5   = typeof row.form === 'string' ? row.form.slice(-5) : null;

    const shared = {
      teamNormKey,
      teamName,
      position:         row.rank                    ?? null,
      played:           row.all?.played             ?? 0,
      won:              row.all?.win                ?? 0,
      drawn:            row.all?.draw               ?? 0,
      lost:             row.all?.lose               ?? 0,
      goalsFor:         row.all?.goals?.for         ?? 0,
      goalsAgainst:     row.all?.goals?.against     ?? 0,
      points:           row.points                  ?? 0,
      homeWon:          row.home?.win               ?? 0,
      homeDrawn:        row.home?.draw              ?? 0,
      homeLost:         row.home?.lose              ?? 0,
      homeGoalsFor:     row.home?.goals?.for        ?? 0,
      homeGoalsAgainst: row.home?.goals?.against    ?? 0,
      awayWon:          row.away?.win               ?? 0,
      awayDrawn:        row.away?.draw              ?? 0,
      awayLost:         row.away?.lose              ?? 0,
      awayGoalsFor:     row.away?.goals?.for        ?? 0,
      awayGoalsAgainst: row.away?.goals?.against    ?? 0,
      formLast5,
      standingsSource:  'api-football',
    };

    await prisma.teamStat.upsert({
      where: { teamstat_unique: { team: teamName, competition: leagueName, season } },
      update: shared,
      create: { team: teamName, competition: leagueName, season, country, ...shared },
    });
  }

  await redis.del(`standings:${leagueId}:${season}`);
  return rows.length;
}

export async function standingsSyncJob() {
  await runJob('standingsSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let totalUpserted = 0;
    let totalCalls    = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        const count = await syncLeagueStandings(
          league.apiFootballId,
          league.name,
          league.country,
          apiSeason,
          season,
        );
        totalUpserted += count;
        totalCalls++;
        logger.info(`[standingsSync] ${league.name}: ${count} teams synced`);
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        logger.warn(`[standingsSync] Skipping ${league.name}: ${err.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: totalUpserted, apiCallsMade: totalCalls, apiCallsRemaining: remaining };
  });
}
