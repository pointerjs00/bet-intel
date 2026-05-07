// apps/api/src/jobs/venueSyncJob.ts
// Syncs stadium/venue details from API-Football /venues for all leagues.

import { prisma } from '../prisma';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';

export async function venueSyncJob() {
  await runJob('venueSync', async () => {
    let calls = 0, upserted = 0;

    // Collect unique countries from our league manifest
    const countries = [...new Set(LEAGUE_MANIFEST.map(l => l.country).filter(c => c !== 'Europe'))];

    for (const country of countries) {
      try {
        const data = await apiFootball.get('/venues', { country });
        calls++;

        const venues: any[] = data?.response ?? [];
        for (const v of venues) {
          if (!v.id) continue;
          await (prisma as any).venue.upsert({
            where:  { apiId: v.id },
            update: {
              name:     v.name ?? '',
              city:     v.city    ?? null,
              country:  v.country ?? null,
              address:  v.address ?? null,
              capacity: v.capacity ?? null,
              surface:  v.surface  ?? null,
              imageUrl: v.image    ?? null,
              syncedAt: new Date(),
            },
            create: {
              apiId:    v.id,
              name:     v.name ?? '',
              city:     v.city    ?? null,
              country:  v.country ?? null,
              address:  v.address ?? null,
              capacity: v.capacity ?? null,
              surface:  v.surface  ?? null,
              imageUrl: v.image    ?? null,
            },
          });
          upserted++;
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.warn(`[venueSync] Skipping country ${country}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
