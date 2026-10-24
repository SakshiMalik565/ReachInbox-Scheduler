import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config/env';
import { logger } from './logger';

export const redisOptions: RedisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    return delay;
  }
};

export const redisClient = new Redis(redisOptions);

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

export function createRedisClient(): Redis {
  return new Redis(redisOptions);
}
