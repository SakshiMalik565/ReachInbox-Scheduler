import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config/env';
import { logger } from './logger';

function parseRedisOptions(): RedisOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    }
  };

  if (config.REDIS_URL) {
    try {
      const parsed = new URL(config.REDIS_URL);
      return {
        ...base,
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        username: parsed.username && parsed.username !== 'default' ? parsed.username : undefined,
        tls: parsed.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined
      };
    } catch {
      // Fallback if URL parsing fails
    }
  }

  return {
    ...base,
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined
  };
}

export const redisOptions: RedisOptions = parseRedisOptions();

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
