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

export { redis };
