import { Redis } from 'ioredis';
import logger from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('[Hungrygo] Redis connected');
});

redis.on('error', (err: Error) => {
  logger.error('[Hungrygo] Redis error', { error: err.message });
});

redis.on('close', () => {
  logger.warn('[Hungrygo] Redis connection closed');
});

export default redis;
