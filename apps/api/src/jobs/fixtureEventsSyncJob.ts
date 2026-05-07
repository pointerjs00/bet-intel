// apps/api/src/jobs/fixtureEventsSyncJob.ts
// Fetches goal/card/substitution timelines for FINISHED fixtures that have no events yet.

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';

const BATCH_SIZE = 50;

export async function fixtureEventsSyncJob() {
  await runJob('fixtureEventsSync', async () => {
    const withEventsRows = await (prisma as any).fixtureEvent.findMany({
      distinct: ['fixtureId'],
      select: { fixtureId: true },
    }) as { fixtureId: string }[];
    const withEvents = new Set<string>(withEventsRows.map((e) => e.fixtureId));

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        apiFootballId: { not: null },
        NOT: { id: { in: Array.from(withEvents) } },
      },
      orderBy: { kickoffAt: 'desc' },
      take: BATCH_SIZE,
      select: { id: true, apiFootballId: true, homeTeam: true, awayTeam: true, homeTeamApiId: true, awayTeamApiId: true },
    });

    let calls = 0, upserted = 0;

    for (const fixture of fixtures) {
      try {
        const data = await apiFootball.get('/fixtures/events', {
          fixture: fixture.apiFootballId,
        });
        calls++;

        const events: any[] = data?.response ?? [];

        // Delete any stale rows first (safe for re-run)
        await (prisma as any).fixtureEvent.deleteMany({ where: { fixtureId: fixture.id } });

        for (const ev of events) {
          const teamId = ev.team?.id as number | undefined;
          const isHome = teamId != null && teamId === fixture.homeTeamApiId;

          await (prisma as any).fixtureEvent.create({
            data: {
              fixtureId:            fixture.id,
              apiFootballFixtureId: fixture.apiFootballId,
              minute:               ev.time?.elapsed ?? 0,
              extraMinute:          ev.time?.extra   ?? null,
              teamId:               teamId ?? null,
              teamName:             ev.team?.name ?? '',
              isHome,
              type:                 ev.type    ?? 'Unknown',
              detail:               ev.detail  ?? null,
              comments:             ev.comments ?? null,
              playerName:           ev.player?.name  ?? null,
              playerApiId:          ev.player?.id    ?? null,
              assistName:           ev.assist?.name  ?? null,
              assistApiId:          ev.assist?.id    ?? null,
            },
          });
          upserted++;
        }

        await redis.del(`fixture:events:${fixture.id}`).catch(() => {});
        await new Promise(r => setTimeout(r, 150));
      } catch (err: any) {
        console.warn(`[fixtureEventsSync] Skipping fixture ${fixture.apiFootballId}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsProcessed: fixtures.length, recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
