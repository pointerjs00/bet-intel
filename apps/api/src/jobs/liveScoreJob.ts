// apps/api/src/jobs/liveScoreJob.ts
//
// Polls API-Football for all currently live fixtures, caches scores in Redis,
// and broadcasts `fixture:score` events via Socket.io to the `live` room.
// Sends push notifications for goals, halftime, second half, match end, and
// red cards to users who watch the fixture or have a pending bet on it.
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

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

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

    // Read previous state before overwriting
    const prevRaw = await redis.get(`live:score:${payload.fixtureId}`).catch(() => null);
    const prev: LiveScorePayload | null = prevRaw ? JSON.parse(prevRaw) : null;

    await redis.set(
      `live:score:${payload.fixtureId}`,
      JSON.stringify(payload),
      'EX',
      120,
    ).catch(() => {});

    emitLiveScore(payload);

    // Kickoff notification (first 2 minutes)
    if (payload.elapsed !== null && payload.elapsed <= 2) {
      await sendMatchNotification(payload, 'MATCH_STARTING' as NotificationType, 'GOALS',
        'Jogo em curso', `${payload.homeTeam} vs ${payload.awayTeam} começou!`,
        `notif:kickoff:${payload.fixtureId}`
      ).catch(err => logger.warn('[liveScore] Kickoff notification error', { err: err?.message }));
    }

    if (!prev) continue;

    // Goal detection
    if (payload.homeGoals !== prev.homeGoals || payload.awayGoals !== prev.awayGoals) {
      const scoringTeam = payload.homeGoals > prev.homeGoals ? payload.homeTeam : payload.awayTeam;
      const goalMinute = payload.elapsed != null ? ` (${payload.elapsed}')` : '';
      await sendMatchNotification(payload, 'GOAL_SCORED' as NotificationType, 'GOALS',
        `⚽ Golo! ${scoringTeam}${goalMinute}`,
        `${payload.homeTeam} ${payload.homeGoals}–${payload.awayGoals} ${payload.awayTeam}`,
        `notif:goal:${payload.fixtureId}:${payload.homeGoals}-${payload.awayGoals}`
      ).catch(err => logger.warn('[liveScore] Goal notification error', { err: err?.message }));
    }

    // Half time
    if (payload.statusShort === 'HT' && prev.statusShort !== 'HT') {
      await sendMatchNotification(payload, 'HALF_TIME' as NotificationType, 'HALF_TIME',
        '🕐 Intervalo',
        `${payload.homeTeam} ${payload.homeGoals}–${payload.awayGoals} ${payload.awayTeam} (Intervalo)`,
        `notif:ht:${payload.fixtureId}`
      ).catch(err => logger.warn('[liveScore] HT notification error', { err: err?.message }));
    }

    // Second half start (transition from HT to 2H)
    if (payload.statusShort === '2H' && prev.statusShort === 'HT') {
      await sendMatchNotification(payload, 'SECOND_HALF_START' as NotificationType, 'HALF_TIME',
        '▶️ 2ª parte',
        `${payload.homeTeam} vs ${payload.awayTeam} — 2ª parte começou`,
        `notif:2h:${payload.fixtureId}`
      ).catch(err => logger.warn('[liveScore] 2H notification error', { err: err?.message }));
    }

    // Match finished
    if (FINISHED_STATUSES.has(payload.statusShort) && !FINISHED_STATUSES.has(prev.statusShort)) {
      await sendMatchNotification(payload, 'MATCH_FINISHED' as NotificationType, 'MATCH_END',
        '🏁 Fim do jogo',
        `${payload.homeTeam} ${payload.homeGoals}–${payload.awayGoals} ${payload.awayTeam} (FT)`,
        `notif:ft:${payload.fixtureId}`
      ).catch(err => logger.warn('[liveScore] FT notification error', { err: err?.message }));
    }

    // Red card detection via events array
    const events: any[] = f.events ?? [];
    const redCards = events.filter((e: any) =>
      e.type === 'Card' && e.detail === 'Red Card'
    );
    for (const card of redCards) {
      const cardKey = `notif:red:${payload.fixtureId}:${card.time?.elapsed}:${card.player?.id ?? card.player?.name}`;
      const alreadySent = await redis.get(cardKey).catch(() => null);
      if (alreadySent) continue;
      const playerName = card.player?.name ?? 'Jogador';
      const teamName = card.team?.name ?? '';
      const cardMinute = card.time?.elapsed != null ? ` (${card.time.elapsed}')` : '';
      await sendMatchNotification(payload, 'RED_CARD' as NotificationType, 'RED_CARD',
        `🟥 Cartão vermelho — ${playerName}${cardMinute}`,
        `${teamName} | ${payload.homeTeam} ${payload.homeGoals}–${payload.awayGoals} ${payload.awayTeam}`,
        cardKey
      ).catch(err => logger.warn('[liveScore] Red card notification error', { err: err?.message }));
    }
  }

  logger.debug(`[liveScore] Broadcast ${fixtures.length} live fixture scores`);
}

async function sendMatchNotification(
  payload: LiveScorePayload,
  type: NotificationType,
  prefKey: string,
  title: string,
  body: string,
  dedupeKey: string,
): Promise<void> {
  const alreadySent = await redis.get(dedupeKey).catch(() => null);
  if (alreadySent) return;

  const fixture = await prisma.fixture.findUnique({
    where: { apiFootballId: payload.fixtureId },
    select: { id: true },
  });
  if (!fixture) return;

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

  const allUserIds = [
    ...new Set([
      ...watches.map(w => w.userId),
      ...betItems.map(b => b.boletin.userId),
    ]),
  ];

  if (!allUserIds.length) {
    await redis.set(dedupeKey, '1', 'EX', 7200).catch(() => {});
    return;
  }

  // Filter by user notification preferences
  const users = await (prisma as any).user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, fixtureNotifPrefs: true },
  }) as { id: string; fixtureNotifPrefs: string[] }[];

  const eligibleUserIds = users
    .filter(u => {
      const prefs: string[] = (u as any).fixtureNotifPrefs ?? ['GOALS', 'HALF_TIME', 'MATCH_END', 'RED_CARD'];
      return prefs.includes(prefKey);
    })
    .map(u => u.id);

  if (eligibleUserIds.length > 0) {
    await createNotifications(
      eligibleUserIds.map(userId => ({ userId, type, title, body,
        data: { fixtureId: fixture.id, apiFootballId: payload.fixtureId, type: String(type) },
      })),
    );
    logger.info(`[liveScore] Sent ${type} to ${eligibleUserIds.length} users for fixture ${payload.fixtureId}`);
  }

  await redis.set(dedupeKey, '1', 'EX', 7200).catch(() => {});
}
