// apps/api/src/jobs/liveScoreJob.ts
//
// Polls API-Football for all currently live fixtures, caches scores in Redis,
// and broadcasts `fixture:score` events via Socket.io to the `live` room.
// Also sends push notifications to users who watch the fixture or have a
// pending bet on it when a match enters its first two minutes.
// Runs every minute while matches are in play.

import { NotificationType } from '@prisma/client';
import { apiFootball } from '../services/apiFootballClient';
import { redis } from '../utils/redis';
import { prisma } from '../prisma';
import { emitLiveScore } from '../sockets';
import { createNotifications } from '../services/social/notificationService';
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

    await redis.set(
      `live:score:${payload.fixtureId}`,
      JSON.stringify(payload),
      'EX',
      120,
    ).catch(() => {});

    emitLiveScore(payload);

    // Fire kickoff notifications only in the first 2 minutes of the match
    if (payload.elapsed !== null && payload.elapsed <= 2) {
      await sendKickoffNotifications(payload).catch(err =>
        logger.warn('[liveScore] Kickoff notification error', { fixtureId: payload.fixtureId, err: err?.message }),
      );
    }
  }

  logger.debug(`[liveScore] Broadcast ${fixtures.length} live fixture scores`);
}

async function sendKickoffNotifications(payload: LiveScorePayload): Promise<void> {
  const dedupeKey = `notif:kickoff:${payload.fixtureId}`;
  const alreadySent = await redis.get(dedupeKey).catch(() => null);
  if (alreadySent) return;

  // Find the internal Fixture row by apiFootballId
  const fixture = await prisma.fixture.findUnique({
    where: { apiFootballId: payload.fixtureId },
    select: { id: true, homeTeam: true, awayTeam: true },
  });
  if (!fixture) return;

  // Collect user IDs from: (1) FixtureWatch rows, (2) pending BoletinItems for this fixture
  const [watches, betItems] = await Promise.all([
    prisma.fixtureWatch.findMany({
      where: { fixtureId: fixture.id },
      select: { userId: true },
    }),
    prisma.boletinItem.findMany({
      where: {
        eventExternalId: String(payload.fixtureId),
        result: 'PENDING',
        boletin: { status: 'PENDING' },
      },
      select: { boletin: { select: { userId: true } } },
    }),
  ]);

  const userIds = [
    ...new Set([
      ...watches.map(w => w.userId),
      ...betItems.map(b => b.boletin.userId),
    ]),
  ];

  if (!userIds.length) {
    // Mark as sent anyway so we don't query again next minute
    await redis.set(dedupeKey, '1', 'EX', 3600).catch(() => {});
    return;
  }

  await createNotifications(
    userIds.map(userId => ({
      userId,
      type: NotificationType.MATCH_STARTING,
      title: 'Jogo em curso',
      body: `${fixture.homeTeam} vs ${fixture.awayTeam} começou!`,
      data: { fixtureId: fixture.id, apiFootballId: payload.fixtureId },
    })),
  );

  // TTL 1 hour — prevents repeat notifications if the job sees elapsed=1,2 in consecutive polls
  await redis.set(dedupeKey, '1', 'EX', 3600).catch(() => {});
  logger.info(`[liveScore] Sent kickoff notifications for fixture ${payload.fixtureId} to ${userIds.length} users`);
}
