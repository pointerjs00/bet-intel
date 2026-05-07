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
    const withLineupsRows = await (prisma as any).fixtureLineup.findMany({
      distinct: ['fixtureId'],
      select: { fixtureId: true },
    }) as { fixtureId: string }[];
    const withLineups = new Set<string>(withLineupsRows.map((l) => l.fixtureId));
    const synced = Array.from(withLineups);

    const selectFields = { id: true, apiFootballId: true, homeTeam: true, awayTeam: true, homeTeamApiId: true, awayTeamApiId: true };

    // Priority 1: finished/live fixtures — data always available
    const finishedFixtures = await prisma.fixture.findMany({
      where: {
        apiFootballId: { not: null },
        status: { in: ['FINISHED', 'LIVE'] },
        ...(synced.length > 0 ? { NOT: { id: { in: synced } } } : {}),
      },
      orderBy: { kickoffAt: 'desc' },
      take: BATCH_SIZE,
      select: selectFields,
    });

    // Priority 2: fill remaining slots with upcoming fixtures (lineups published ~1hr before kickoff)
    const slotsLeft = BATCH_SIZE - finishedFixtures.length;
    const upcomingFixtures = slotsLeft > 0 ? await prisma.fixture.findMany({
      where: {
        apiFootballId: { not: null },
        status: 'SCHEDULED',
        kickoffAt: { gte: new Date(), lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        ...(synced.length > 0 ? { NOT: { id: { in: synced } } } : {}),
      },
      orderBy: { kickoffAt: 'asc' },
      take: slotsLeft,
      select: selectFields,
    }) : [];

    const fixtures = [...finishedFixtures, ...upcomingFixtures];

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

    const apiCallsRemaining = await apiFootball.getRemainingCalls();
    return { recordsProcessed: fixtures.length, recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining };
  });
}
