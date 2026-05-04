// apps/api/src/jobs/injuriesSyncJob.ts

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason, canonicalToApiFootballSeason } from '../utils/seasonUtils';

export async function injuriesSyncJob() {
  await runJob('injuriesSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let calls = 0, upserted = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        const data = await apiFootball.get('/injuries', {
          league: league.apiFootballId,
          season: apiSeason,
        });
        calls++;
        const injuries: any[] = data?.response ?? [];
        const affectedTeamKeys = new Set<string>();

        for (const entry of injuries) {
          if (!entry.player?.id || !entry.team?.name) continue;

          const teamNormKey   = normaliseTeamName(entry.team.name);
          const playerName    = entry.player.name ?? '';
          const playerNormKey = normaliseTeamName(playerName);
          affectedTeamKeys.add(`${teamNormKey}:${league.apiFootballId}`);

          await prisma.playerAvailability.upsert({
            where: {
              availability_unique: {
                playerId: entry.player.id,
                leagueId: league.apiFootballId,
                season,
                type: entry.player.type ?? 'Injury',
              },
            },
            update: {
              playerName,
              playerNormKey,
              reason:    entry.player.reason   ?? null,
              startDate: entry.player.start ? new Date(entry.player.start) : null,
              endDate:   entry.player.end   ? new Date(entry.player.end)   : null,
              syncedAt:  new Date(),
            },
            create: {
              leagueId:   league.apiFootballId,
              leagueName: league.name,
              season,
              teamId:     entry.team.id   ?? null,
              teamName:   entry.team.name,
              teamNormKey,
              playerId:      entry.player.id,
              playerName,
              playerNormKey,
              type:      entry.player.type  ?? 'Injury',
              reason:    entry.player.reason ?? null,
              startDate: entry.player.start ? new Date(entry.player.start) : null,
              endDate:   entry.player.end   ? new Date(entry.player.end)   : null,
            },
          });
          upserted++;
        }

        for (const key of affectedTeamKeys) {
          await redis.del(`injuries:${key}`);
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        // Log and continue — don't fail the whole job if one league errors
        console.warn(`[injuriesSync] Skipping ${league.name}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
