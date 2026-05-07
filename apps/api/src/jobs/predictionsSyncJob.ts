// apps/api/src/jobs/predictionsSyncJob.ts
// Fetches API-Football predictions for upcoming fixtures (next 3 days).

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';

const BATCH_SIZE = 40;

export async function predictionsSyncJob() {
  await runJob('predictionsSync', async () => {
    const now   = new Date();
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const withPredRows = await (prisma as any).fixturePrediction.findMany({
      select: { fixtureId: true },
    }) as { fixtureId: string }[];
    const withPredictions = new Set<string>(withPredRows.map((p) => p.fixtureId));

    const fixtures = await prisma.fixture.findMany({
      where: {
        status: { in: ['SCHEDULED', 'LIVE'] },
        kickoffAt: { gte: now, lte: until },
        apiFootballId: { not: null },
        NOT: { id: { in: Array.from(withPredictions) } },
      },
      orderBy: { kickoffAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, apiFootballId: true },
    });

    let calls = 0, upserted = 0;

    for (const fixture of fixtures) {
      try {
        const data = await apiFootball.get('/predictions', {
          fixture: fixture.apiFootballId,
        });
        calls++;

        const resp = data?.response?.[0];
        if (!resp) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }

        const pred   = resp.predictions ?? {};
        const winner = resp.predictions?.winner ?? {};
        const h2h    = resp.h2h ?? [];

        let h2hHomeWins = 0, h2hDraws = 0, h2hAwayWins = 0;
        for (const m of h2h) {
          const hg = m.goals?.home ?? 0;
          const ag = m.goals?.away ?? 0;
          if      (hg > ag) h2hHomeWins++;
          else if (hg < ag) h2hAwayWins++;
          else              h2hDraws++;
        }

        const pctStr = (v: string | number | null | undefined): number | null => {
          if (v == null) return null;
          const s = String(v).replace('%', '');
          const n = parseFloat(s);
          return isNaN(n) ? null : n;
        };

        await (prisma as any).fixturePrediction.upsert({
          where: { fixtureId: fixture.id },
          update: {
            apiFootballFixtureId: fixture.apiFootballId,
            winnerTeamId:   winner.id   ?? null,
            winnerTeamName: winner.name ?? null,
            winnerComment:  winner.comment ?? null,
            winPctHome:     pctStr(pred.percent?.home),
            winPctDraw:     pctStr(pred.percent?.draw),
            winPctAway:     pctStr(pred.percent?.away),
            goalsHome:      pred.goals?.home ?? null,
            goalsAway:      pred.goals?.away ?? null,
            advice:         pred.advice ?? null,
            overUnder:      pred.under_over ?? null,
            btts:           pred.goals_btts === '1' ? true : pred.goals_btts === '0' ? false : null,
            h2hHomeWins,
            h2hDraws,
            h2hAwayWins,
            syncedAt: new Date(),
          },
          create: {
            fixtureId:            fixture.id,
            apiFootballFixtureId: fixture.apiFootballId,
            winnerTeamId:   winner.id   ?? null,
            winnerTeamName: winner.name ?? null,
            winnerComment:  winner.comment ?? null,
            winPctHome:     pctStr(pred.percent?.home),
            winPctDraw:     pctStr(pred.percent?.draw),
            winPctAway:     pctStr(pred.percent?.away),
            goalsHome:      pred.goals?.home ?? null,
            goalsAway:      pred.goals?.away ?? null,
            advice:         pred.advice ?? null,
            overUnder:      pred.under_over ?? null,
            btts:           pred.goals_btts === '1' ? true : pred.goals_btts === '0' ? false : null,
            h2hHomeWins,
            h2hDraws,
            h2hAwayWins,
          },
        });
        upserted++;

        await redis.del(`fixture:prediction:${fixture.id}`).catch(() => {});
        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        console.warn(`[predictionsSync] Skipping fixture ${fixture.apiFootballId}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsProcessed: fixtures.length, recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
