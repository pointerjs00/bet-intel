import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Singleton ioredis client.
 * Used for: rate limiting, odds caching (5-min TTL), Bull job queues.
 */
const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('error', (err: Error) => {
  logger.error('Redis connection error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

/**
 * Deletes every key matching `pattern` using incremental SCAN (non-blocking, unlike KEYS).
 * Returns how many keys were deleted.
 */
async function deleteKeysByPattern(pattern: string): Promise<number> {
  let cursor = '0';
  let deleted = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length > 0) deleted += await redis.del(...keys);
  } while (cursor !== '0');
  return deleted;
}

export { redis, deleteKeysByPattern };
