// apps/api/src/jobs/topScorersSyncJob.ts

import { prisma } from '../prisma';
import { redis }  from '../utils/redis';
import { runJob } from '../utils/runJob';
import { apiFootball } from '../services/apiFootballClient';
import { LEAGUE_MANIFEST, type LeagueConfig } from '../config/leagueManifest';
import { normaliseTeamName } from '../utils/nameNormalisation';
import { getCurrentSeason, canonicalToApiFootballSeason } from '../utils/seasonUtils';

async function syncType(
  league: LeagueConfig,
  apiSeason: number,
  season: string,
  type: 'goals' | 'assists'
) {
  const endpoint = type === 'goals' ? '/players/topscorers' : '/players/topassists';
  const data = await apiFootball.get(endpoint, { league: league.apiFootballId, season: apiSeason });
  const players: any[] = data?.response ?? [];

  for (let i = 0; i < players.length; i++) {
    const { player, statistics } = players[i];
    const stat = statistics?.[0];
    if (!stat) continue;

    await prisma.topScorer.upsert({
      where: {
        topscorer_unique: {
          leagueId: league.apiFootballId,
          season,
          type,
          playerId: player.id,
        },
      },
      update: {
        rank:          i + 1,
        goals:         stat.goals.total    ?? 0,
        assists:       stat.goals.assists  ?? 0,
        appearances:   stat.games.appearences ?? 0,
        minutesPlayed: stat.games.minutes  ?? 0,
        yellowCards:   stat.cards.yellow   ?? 0,
        redCards:      stat.cards.red      ?? 0,
        syncedAt: new Date(),
      },
      create: {
        leagueId:   league.apiFootballId,
        leagueName: league.name,
        season,
        type,
        rank:           i + 1,
        playerId:       player.id,
        playerName:     player.name,
        playerNormKey:  normaliseTeamName(player.name),
        playerImageUrl: player.photo,
        nationality:    player.nationality,
        age:            player.age,
        position:       stat.games.position,
        teamId:         stat.team.id,
        teamName:       stat.team.name,
        teamNormKey:    normaliseTeamName(stat.team.name),
        goals:         stat.goals.total    ?? 0,
        assists:       stat.goals.assists  ?? 0,
        appearances:   stat.games.appearences ?? 0,
        minutesPlayed: stat.games.minutes  ?? 0,
        yellowCards:   stat.cards.yellow   ?? 0,
        redCards:      stat.cards.red      ?? 0,
      },
    });
  }
  await redis.del(`topscorers:${league.apiFootballId}:${season}:${type}`);
}

export async function topScorersSyncJob() {
  await runJob('topScorersSync', async () => {
    const season    = getCurrentSeason();
    const apiSeason = canonicalToApiFootballSeason(season);
    let calls = 0;

    for (const league of LEAGUE_MANIFEST) {
      try {
        await syncType(league, apiSeason, season, 'goals');
        calls++;
        await new Promise(r => setTimeout(r, 250));
        await syncType(league, apiSeason, season, 'assists');
        calls++;
        await new Promise(r => setTimeout(r, 250));
      } catch (err: any) {
        console.warn(`[topScorersSync] Skipping ${league.name}: ${err?.message}`);
      }
    }

    const remaining = await apiFootball.getRemainingCalls();
    return { apiCallsMade: calls, apiCallsRemaining: remaining };
  });
}
