// apps/api/src/jobs/fixtureStatsSyncJob.ts
// Fetches per-match stats (shots, possession, xG, corners, cards, passes, saves)
// for recently FINISHED fixtures that don't yet have a FixtureStats record.

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';

const BATCH_SIZE = 50; // fixtures per run — stay within rate limits

export async function fixtureStatsSyncJob() {
  await runJob('fixtureStatsSync', async () => {
    // Find finished fixtures with apiFootballId that have no stats yet
    const existingStats = await (prisma as any).fixtureStats.findMany({
      where: { apiFootballFixtureId: { not: null } },
      select: { apiFootballFixtureId: true },
    }) as { apiFootballFixtureId: number }[];
    const existingIds = existingStats.map((s) => s.apiFootballFixtureId);

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        apiFootballId: { not: null },
        ...(existingIds.length > 0 ? { NOT: { apiFootballId: { in: existingIds } } } : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: BATCH_SIZE,
      select: { id: true, apiFootballId: true },
    });

    let calls = 0, upserted = 0;

    for (const fixture of fixtures) {
      try {
        const data = await apiFootball.get('/fixtures/statistics', {
          fixture: fixture.apiFootballId,
        });
        calls++;

        const teams: any[] = data?.response ?? [];
        if (teams.length < 2) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }

        const home = teams[0]?.statistics ?? [];
        const away = teams[1]?.statistics ?? [];

        function val(arr: any[], type: string): number | null {
          const item = arr.find((s: any) => s.type === type);
          if (item == null || item.value == null) return null;
          // Possession comes as "55%" — strip the %
          if (typeof item.value === 'string' && item.value.endsWith('%')) {
            return parseFloat(item.value);
          }
          return typeof item.value === 'number' ? item.value : parseInt(item.value, 10) || null;
        }

        await (prisma as any).fixtureStats.upsert({
          where: { fixtureId: fixture.id },
          update: {
            apiFootballFixtureId: fixture.apiFootballId,
            homePossession:    val(home, 'Ball Possession'),
            awayPossession:    val(away, 'Ball Possession'),
            homeShotsTotal:    val(home, 'Total Shots'),
            awayShotsTotal:    val(away, 'Total Shots'),
            homeShotsOnTarget: val(home, 'Shots on Goal'),
            awayShotsOnTarget: val(away, 'Shots on Goal'),
            homeShotsBlocked:  val(home, 'Blocked Shots'),
            awayShotsBlocked:  val(away, 'Blocked Shots'),
            homeCorners:       val(home, 'Corner Kicks'),
            awayCorners:       val(away, 'Corner Kicks'),
            homeOffsides:      val(home, 'Offsides'),
            awayOffsides:      val(away, 'Offsides'),
            homeYellow:        val(home, 'Yellow Cards'),
            awayYellow:        val(away, 'Yellow Cards'),
            homeRed:           val(home, 'Red Cards'),
            awayRed:           val(away, 'Red Cards'),
            homeFouls:         val(home, 'Fouls'),
            awayFouls:         val(away, 'Fouls'),
            homeGkSaves:       val(home, 'Goalkeeper Saves'),
            awayGkSaves:       val(away, 'Goalkeeper Saves'),
            homePassesTotal:   val(home, 'Total passes'),
            awayPassesTotal:   val(away, 'Total passes'),
            homePassesAccurate:val(home, 'Passes accurate'),
            awayPassesAccurate:val(away, 'Passes accurate'),
            homePassPct:       val(home, 'Passes %'),
            awayPassPct:       val(away, 'Passes %'),
            homeXg:            val(home, 'expected_goals'),
            awayXg:            val(away, 'expected_goals'),
            syncedAt: new Date(),
          },
          create: {
            fixtureId:            fixture.id,
            apiFootballFixtureId: fixture.apiFootballId,
            homePossession:    val(home, 'Ball Possession'),
            awayPossession:    val(away, 'Ball Possession'),
            homeShotsTotal:    val(home, 'Total Shots'),
            awayShotsTotal:    val(away, 'Total Shots'),
            homeShotsOnTarget: val(home, 'Shots on Goal'),
            awayShotsOnTarget: val(away, 'Shots on Goal'),
            homeShotsBlocked:  val(home, 'Blocked Shots'),
            awayShotsBlocked:  val(away, 'Blocked Shots'),
            homeCorners:       val(home, 'Corner Kicks'),
            awayCorners:       val(away, 'Corner Kicks'),
            homeOffsides:      val(home, 'Offsides'),
            awayOffsides:      val(away, 'Offsides'),
            homeYellow:        val(home, 'Yellow Cards'),
            awayYellow:        val(away, 'Yellow Cards'),
            homeRed:           val(home, 'Red Cards'),
            awayRed:           val(away, 'Red Cards'),
            homeFouls:         val(home, 'Fouls'),
            awayFouls:         val(away, 'Fouls'),
            homeGkSaves:       val(home, 'Goalkeeper Saves'),
            awayGkSaves:       val(away, 'Goalkeeper Saves'),
            homePassesTotal:   val(home, 'Total passes'),
            awayPassesTotal:   val(away, 'Total passes'),
            homePassesAccurate:val(home, 'Passes accurate'),
            awayPassesAccurate:val(away, 'Passes accurate'),
            homePassPct:       val(home, 'Passes %'),
            awayPassPct:       val(away, 'Passes %'),
            homeXg:            val(home, 'expected_goals'),
            awayXg:            val(away, 'expected_goals'),
          },
        });
        upserted++;

        // Bust per-fixture cache
        await redis.del(`fixture:stats:${fixture.id}`).catch(() => {});
        await new Promise(r => setTimeout(r, 150));
      } catch (err: any) {
        console.warn(`[fixtureStatsSync] Skipping fixture ${fixture.apiFootballId}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsProcessed: fixtures.length, recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
