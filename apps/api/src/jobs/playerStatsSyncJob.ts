// apps/api/src/jobs/playerStatsSyncJob.ts
// Fetches full player season statistics (goals, assists, shots, passes, tackles,
// cards, dribbles, rating) for all leagues in LEAGUE_MANIFEST.
// API endpoint: /players?league=X&season=Y&page=N  (paginated, 20 players/page)

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST } from '../config/leagueManifest';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason, canonicalToApiFootballSeason } from '../utils/seasonUtils';

export async function playerStatsSyncJob() {
  await runJob('playerStatsSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let calls = 0, upserted = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        // Fetch page 1 first to get total pages
        const first = await apiFootball.get('/players', {
          league:  league.apiFootballId,
          season:  apiSeason,
          page:    1,
        });
        calls++;

        const totalPages: number = first?.paging?.total ?? 1;
        const allPlayers: any[] = [...(first?.response ?? [])];

        for (let page = 2; page <= totalPages; page++) {
          const pageData = await apiFootball.get('/players', {
            league:  league.apiFootballId,
            season:  apiSeason,
            page,
          });
          calls++;
          allPlayers.push(...(pageData?.response ?? []));
          await new Promise(r => setTimeout(r, 200));
        }

        for (const entry of allPlayers) {
          const { player, statistics } = entry;
          const stat = statistics?.[0];
          if (!stat || !player?.id) continue;

          await (prisma as any).playerStat.upsert({
            where: {
              playerstat_unique: {
                playerId: player.id,
                leagueId: league.apiFootballId,
                season,
                teamId:   stat.team?.id ?? 0,
              },
            },
            update: {
              playerName:     player.name,
              playerNormKey:  normaliseTeamName(player.name),
              playerImageUrl: player.photo    ?? null,
              nationality:    player.nationality ?? null,
              age:            player.age      ?? null,
              height:         player.height   ?? null,
              weight:         player.weight   ?? null,
              position:       stat.games?.position   ?? null,
              number:         stat.games?.number     ?? null,
              teamName:       stat.team?.name   ?? '',
              teamNormKey:    normaliseTeamName(stat.team?.name ?? ''),
              leagueName:     league.name,
              appearances:    stat.games?.appearences ?? 0,
              minutesPlayed:  stat.games?.minutes    ?? 0,
              goals:          stat.goals?.total      ?? 0,
              assists:        stat.goals?.assists    ?? 0,
              shots:          stat.shots?.total      ?? 0,
              shotsOnTarget:  stat.shots?.on         ?? 0,
              dribbles:       stat.dribbles?.attempts ?? 0,
              dribblesWon:    stat.dribbles?.success  ?? 0,
              keyPasses:      stat.passes?.key       ?? 0,
              passAccuracy:   stat.passes?.accuracy  ?? null,
              tackles:        stat.tackles?.total    ?? 0,
              interceptions:  stat.tackles?.interceptions ?? 0,
              yellowCards:    stat.cards?.yellow     ?? 0,
              yellowRed:      stat.cards?.yellowred  ?? 0,
              redCards:       stat.cards?.red        ?? 0,
              rating:         stat.games?.rating ? parseFloat(stat.games.rating) : null,
              syncedAt:       new Date(),
            },
            create: {
              playerId:       player.id,
              playerName:     player.name,
              playerNormKey:  normaliseTeamName(player.name),
              playerImageUrl: player.photo    ?? null,
              nationality:    player.nationality ?? null,
              age:            player.age      ?? null,
              height:         player.height   ?? null,
              weight:         player.weight   ?? null,
              position:       stat.games?.position   ?? null,
              number:         stat.games?.number     ?? null,
              teamId:         stat.team?.id   ?? 0,
              teamName:       stat.team?.name ?? '',
              teamNormKey:    normaliseTeamName(stat.team?.name ?? ''),
              leagueId:       league.apiFootballId,
              leagueName:     league.name,
              season,
              appearances:    stat.games?.appearences ?? 0,
              minutesPlayed:  stat.games?.minutes    ?? 0,
              goals:          stat.goals?.total      ?? 0,
              assists:        stat.goals?.assists    ?? 0,
              shots:          stat.shots?.total      ?? 0,
              shotsOnTarget:  stat.shots?.on         ?? 0,
              dribbles:       stat.dribbles?.attempts ?? 0,
              dribblesWon:    stat.dribbles?.success  ?? 0,
              keyPasses:      stat.passes?.key       ?? 0,
              passAccuracy:   stat.passes?.accuracy  ?? null,
              tackles:        stat.tackles?.total    ?? 0,
              interceptions:  stat.tackles?.interceptions ?? 0,
              yellowCards:    stat.cards?.yellow     ?? 0,
              yellowRed:      stat.cards?.yellowred  ?? 0,
              redCards:       stat.cards?.red        ?? 0,
              rating:         stat.games?.rating ? parseFloat(stat.games.rating) : null,
            },
          });
          upserted++;
        }

        await redis.del(`players:${league.apiFootballId}:${season}`).catch(() => {});
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.warn(`[playerStatsSync] Skipping ${league.name}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { recordsUpserted: upserted, apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
