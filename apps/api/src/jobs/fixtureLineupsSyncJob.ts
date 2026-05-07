// apps/api/src/jobs/fixtureLineupsSyncJob.ts
// Fetches starting XI + bench for all fixtures (past + upcoming) from API-Football /fixtures/lineups.
// Processes BATCH_SIZE fixtures per run, newest first, skipping any already synced.

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';

const BATCH_SIZE = 40;

export async function fixtureLineupsSyncJob() {
  await runJob('fixtureLineupsSync', async () => {
    const until = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // next 2 days

    const withLineupsRows = await (prisma as any).fixtureLineup.findMany({
      distinct: ['fixtureId'],
      select: { fixtureId: true },
    }) as { fixtureId: string }[];
    const withLineups = new Set<string>(withLineupsRows.map((l) => l.fixtureId));

    const fixtures = await prisma.fixture.findMany({
      where: {
        apiFootballId: { not: null },
        kickoffAt: { lte: until },
        NOT: { id: { in: Array.from(withLineups) } },
      },
      orderBy: { kickoffAt: 'desc' },
      take: BATCH_SIZE,
      select: { id: true, apiFootballId: true, homeTeam: true, awayTeam: true, homeTeamApiId: true, awayTeamApiId: true },
    });

    let calls = 0, upserted = 0;

    for (const fixture of fixtures) {
      try {
        const data = await apiFootball.get('/fixtures/lineups', {
          fixture: fixture.apiFootballId,
        });
        calls++;

        const lineups: any[] = data?.response ?? [];
        if (lineups.length === 0) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }

        for (const lineup of lineups) {
          const teamId = lineup.team?.id as number;
          const isHome = teamId === fixture.homeTeamApiId;

          await (prisma as any).fixtureLineup.upsert({
            where: { fixlineup_unique: { fixtureId: fixture.id, teamId } },
            update: {
              formation:  lineup.formation ?? null,
              coachId:    lineup.coach?.id   ?? null,
              coachName:  lineup.coach?.name ?? null,
              startingXI: lineup.startXI   ?? [],
              substitutes:lineup.substitutes ?? [],
              syncedAt:   new Date(),
            },
            create: {
              fixtureId:            fixture.id,
              apiFootballFixtureId: fixture.apiFootballId,
              teamId,
              teamName:   lineup.team?.name ?? '',
              isHome,
              formation:  lineup.formation ?? null,
              coachId:    lineup.coach?.id   ?? null,
              coachName:  lineup.coach?.name ?? null,
              startingXI: lineup.startXI   ?? [],
              substitutes:lineup.substitutes ?? [],
            },
          });
          upserted++;
        }

        await redis.del(`fixture:lineups:${fixture.id}`).catch(() => {});
        await new Promise(r => setTimeout(r, 150));
      } catch (err: any) {
        console.warn(`[fixtureLineupsSync] Skipping fixture ${fixture.apiFootballId}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsProcessed: fixtures.length, recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
