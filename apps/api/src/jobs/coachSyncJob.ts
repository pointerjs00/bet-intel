// apps/api/src/jobs/coachSyncJob.ts
// Syncs head-coach info from API-Football /coachs for all leagues.

import { prisma } from '../prisma';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason, canonicalToApiFootballSeason } from '../utils/seasonUtils';

export async function coachSyncJob() {
  await runJob('coachSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let calls = 0, upserted = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        // Get current standings to find team IDs active this season
        const standingsData = await apiFootball.get('/standings', {
          league:  league.apiFootballId,
          season:  apiSeason,
        });
        calls++;

        const groups: any[][] = standingsData?.response?.[0]?.league?.standings ?? [];
        const teamIds: number[] = groups.flat().map((t: any) => t.team?.id).filter(Boolean);

        for (const teamId of teamIds) {
          try {
            const coachData = await apiFootball.get('/coachs', { team: teamId });
            calls++;
            const coaches: any[] = coachData?.response ?? [];
            // API returns career history; the current team is the one without an end date
            const current = coaches.find((c: any) =>
              c.career?.some((e: any) => e.team?.id === teamId && e.end == null)
            ) ?? coaches[0];
            if (!current) continue;

            const career = current.career?.find((e: any) => e.team?.id === teamId && e.end == null)
              ?? current.career?.[0];

            await (prisma as any).coach.upsert({
              where:  { apiId: current.id },
              update: {
                name:        current.name       ?? '',
                firstName:   current.firstname  ?? null,
                lastName:    current.lastname   ?? null,
                nationality: current.nationality ?? null,
                birthDate:   current.birth?.date ? new Date(current.birth.date) : null,
                imageUrl:    current.photo      ?? null,
                teamId:      career?.team?.id   ?? teamId,
                teamName:    career?.team?.name ?? null,
                teamNormKey: normaliseTeamName(career?.team?.name ?? ''),
                syncedAt:    new Date(),
              },
              create: {
                apiId:       current.id,
                name:        current.name       ?? '',
                firstName:   current.firstname  ?? null,
                lastName:    current.lastname   ?? null,
                nationality: current.nationality ?? null,
                birthDate:   current.birth?.date ? new Date(current.birth.date) : null,
                imageUrl:    current.photo      ?? null,
                teamId:      career?.team?.id   ?? teamId,
                teamName:    career?.team?.name ?? null,
                teamNormKey: normaliseTeamName(career?.team?.name ?? ''),
              },
            });
            upserted++;
            await new Promise(r => setTimeout(r, 150));
          } catch (err: any) {
            console.warn(`[coachSync] Skipping team ${teamId}: ${err?.message}`);
          }
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.warn(`[coachSync] Skipping league ${league.name}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
