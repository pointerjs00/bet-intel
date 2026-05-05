// apps/api/src/jobs/liveScoreJob.ts
//
// Polls API-Football for all currently live fixtures, caches scores in Redis,
// and broadcasts `fixture:score` events via Socket.io to the `live` room.
// Runs every minute while matches are in play.

import { apiFootball } from '../services/apiFootballClient';
import { redis } from '../utils/redis';
import { emitLiveScore } from '../sockets';
import { logger } from '../utils/logger';

export interface LiveScorePayload {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  elapsed: number | null;
  statusShort: string;
}

export async function liveScoreJob(): Promise<void> {
  let data: any;
  try {
    data = await apiFootball.get('/fixtures', { live: 'all' });
  } catch (err: any) {
    // Rate limit or network error — skip silently, will retry next minute
    logger.debug('[liveScore] Skipped poll', { reason: err?.message });
    return;
  }

  const fixtures: any[] = data?.response ?? [];
  if (!fixtures.length) return;

  for (const f of fixtures) {
    const payload: LiveScorePayload = {
      fixtureId:   f.fixture.id,
      homeTeam:    f.teams.home.name,
      awayTeam:    f.teams.away.name,
      homeGoals:   f.goals.home ?? 0,
      awayGoals:   f.goals.away ?? 0,
      elapsed:     f.fixture.status?.elapsed ?? null,
      statusShort: f.fixture.status?.short ?? 'LIVE',
    };

    // Cache with 2-minute TTL so missed polls don't leave stale data
    await redis.set(
      `live:score:${payload.fixtureId}`,
      JSON.stringify(payload),
      'EX',
      120,
    ).catch(() => {});

    emitLiveScore(payload);
  }

  logger.debug(`[liveScore] Broadcast ${fixtures.length} live fixture scores`);
}
