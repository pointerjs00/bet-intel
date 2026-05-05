// apps/api/src/services/apifootball/historicalBackfill.ts
//
// Fetches all fixtures for historical seasons (one full season per API call)
// and upserts them into the Fixture table, then recomputes TeamStat rows.
//
// Total API cost: LEAGUE_MANIFEST.length × SEASONS.length calls
// (already-done pairs are skipped via Redis flags — safe to re-trigger)

import { apiFootball } from '../apiFootballClient';
import { LEAGUE_MANIFEST } from '../../config/leagueManifest';
import { redis } from '../../utils/redis';
import { logger } from '../../utils/logger';
import { runJob } from '../../utils/runJob';
import { recomputeTeamStats } from '../fixtureService';
import { upsertFixture } from './fixturesSync';

// API-Football start years — 2022 = 2022-23 season, etc.
const SEASONS = [2022, 2023, 2024, 2025];

// Redis flags persist 30 days — historical data doesn't change
const DONE_TTL_SECONDS = 60 * 60 * 24 * 30;

function apiSeasonToCanonical(apiSeason: number): string {
  return `${apiSeason}-${String(apiSeason + 1).slice(-2)}`;
}

async function backfillLeagueSeason(
  leagueId: number,
  leagueName: string,
  apiSeason: number,
): Promise<{ upserted: number; skipped: boolean }> {
  const doneKey = `backfill:done:${leagueId}:${apiSeason}`;

  const alreadyDone = await redis.get(doneKey).catch(() => null);
  if (alreadyDone) {
    logger.info(`[historicalBackfill] Already done: ${leagueName} ${apiSeason} — skipping`);
    return { upserted: 0, skipped: true };
  }

  logger.info(`[historicalBackfill] Fetching ${leagueName} season ${apiSeason}…`);

  const data = await apiFootball.get<any>('/fixtures', {
    league: leagueId,
    season: apiSeason,
  });

  const fixtures: any[] = data?.response ?? [];

  if (fixtures.length === 0) {
    logger.warn(`[historicalBackfill] No fixtures returned for ${leagueName} ${apiSeason}`);
    // Still mark done so we don't keep hitting the API for empty seasons
    await redis.setex(doneKey, DONE_TTL_SECONDS, '1').catch(() => {});
    return { upserted: 0, skipped: false };
  }

  const season = apiSeasonToCanonical(apiSeason);
  let upserted = 0;

  for (const f of fixtures) {
    const ok = await upsertFixture(f, leagueName, season);
    if (ok) upserted++;
  }

  await redis.setex(doneKey, DONE_TTL_SECONDS, '1').catch(() => {});

  logger.info(
    `[historicalBackfill] ${leagueName} ${apiSeason}: upserted ${upserted}/${fixtures.length}`,
  );
  return { upserted, skipped: false };
}

export async function runHistoricalBackfill(): Promise<void> {
  await runJob('historicalBackfill', async () => {
    let totalUpserted = 0;
    let totalCalls = 0;
    let totalSkipped = 0;

    for (const league of LEAGUE_MANIFEST) {
      for (const apiSeason of SEASONS) {
        try {
          const { upserted, skipped } = await backfillLeagueSeason(
            league.apiFootballId,
            league.name,
            apiSeason,
          );
          totalUpserted += upserted;
          if (!skipped) totalCalls++;
          if (skipped) totalSkipped++;

          // Respect rate limits between calls
          if (!skipped) await new Promise((r) => setTimeout(r, 300));
        } catch (err: any) {
          logger.error(
            `[historicalBackfill] Error for ${league.name} ${apiSeason}: ${err.message}`,
          );
          // Continue — don't abort the whole job for one failure
        }
      }
    }

    logger.info(
      `[historicalBackfill] Fixture import complete — ${totalUpserted} upserted, ` +
        `${totalCalls} API calls made, ${totalSkipped} pairs skipped (already done)`,
    );

    // Recompute TeamStat standings from all the newly ingested historical fixtures
    try {
      logger.info('[historicalBackfill] Recomputing team stats…');
      const { teams, competitions } = await recomputeTeamStats();
      logger.info(
        `[historicalBackfill] TeamStat recompute done: ${teams} teams across ${competitions} competitions`,
      );
    } catch (err: any) {
      logger.warn(`[historicalBackfill] TeamStat recompute failed (non-fatal): ${err.message}`);
    }

    const remaining = await apiFootball.getRemainingCalls();
    return {
      recordsUpserted: totalUpserted,
      apiCallsMade: totalCalls,
      apiCallsRemaining: remaining,
      details: { skippedPairs: totalSkipped },
    };
  });
}
