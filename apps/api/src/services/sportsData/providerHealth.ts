// Plan #61: health of the free sports-data providers (ESPN, LiveScore).
// Every call records success or failure; after FAIL_THRESHOLD consecutive failures (HTTP error,
// timeout, or a response whose shape changed) the user gets one SYSTEM notification, at most
// once per ALERT_COOLDOWN, and a recovery note when the provider works again.
// Redis and the notification service are loaded lazily so the pure mappers stay testable.

import { logger } from '../../utils/logger';

export type Provider = 'espn-football' | 'espn-tennis' | 'espn-basketball' | 'espn-preview' | 'livescore';

const FAIL_THRESHOLD = 10;
const ALERT_COOLDOWN_S = 6 * 3600;

const LABEL: Record<Provider, string> = {
  'espn-football': 'ESPN (futebol)',
  'espn-tennis': 'ESPN (ténis)',
  'espn-basketball': 'ESPN (NBA)',
  'espn-preview': 'ESPN (antevisões)',
  livescore: 'LiveScore (pontos do ténis)',
};

function redis(): typeof import('../../utils/redis').redis {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('../../utils/redis') as typeof import('../../utils/redis')).redis;
}

/** Thrown by adapters when a 200 response no longer has the fields we read. */
export class ProviderFormatError extends Error {}

async function notifyAll(title: string, body: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require('../../prisma') as typeof import('../../prisma');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createNotification } = require('../social/notificationService') as typeof import('../social/notificationService');
  // Personal app: every account is the owner.
  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(users.map((u) => createNotification({ userId: u.id, type: 'SYSTEM', title, body })));
}

/** Records one call to a provider. Never throws. */
export async function recordProviderResult(provider: Provider, ok: boolean, error?: unknown): Promise<void> {
  try {
    const r = redis();
    const failKey = `provider:fail:${provider}`;
    const alertKey = `provider:alerted:${provider}`;
    if (ok) {
      const prev = Number(await r.getset(failKey, '0')) || 0;
      if (prev >= FAIL_THRESHOLD && (await r.del(alertKey)) > 0) {
        logger.info(`[providers] ${provider} recovered after ${prev} failures`);
        await notifyAll('Fonte de dados recuperada', `${LABEL[provider]} voltou a responder. A liquidação automática retomou.`);
      }
      await r.hset('provider:last', provider, JSON.stringify({ ok: true, at: new Date().toISOString() }));
      return;
    }
    const message = error instanceof Error ? error.message : String(error ?? 'erro');
    const count = await r.incr(failKey);
    await r.hset('provider:last', provider, JSON.stringify({ ok: false, at: new Date().toISOString(), error: message, consecutiveFailures: count }));
    logger.warn(`[providers] ${provider} failed (${count} in a row)`, { error: message, format: error instanceof ProviderFormatError });
    if (count >= FAIL_THRESHOLD && (await r.set(alertKey, '1', 'EX', ALERT_COOLDOWN_S, 'NX')) === 'OK') {
      logger.error(`[providers] ${provider} is down`, { error: message });
      const why = error instanceof ProviderFormatError ? 'mudou o formato das respostas' : 'não está a responder';
      await notifyAll('Fonte de dados com problemas', `${LABEL[provider]} ${why} (${count} falhas seguidas). As apostas desses jogos podem ficar por liquidar até voltar.`);
    }
  } catch {
    // Monitoring must never break the data path.
  }
}

/** Last result per provider, for GET /api/sports/health. */
export async function getProviderHealth(): Promise<Record<string, unknown>> {
  try {
    const raw = await redis().hgetall('provider:last');
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, JSON.parse(v) as unknown]));
  } catch {
    return {};
  }
}

/** Wraps a provider call: records the outcome and rethrows failures. */
export async function tracked<T>(provider: Provider, call: () => Promise<T>): Promise<T> {
  try {
    const value = await call();
    void recordProviderResult(provider, true);
    return value;
  } catch (err) {
    void recordProviderResult(provider, false, err);
    throw err;
  }
}
