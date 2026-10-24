import { redisClient } from '../utils/redis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  hourKey: string;
  nextWindowStartMs: number;
  delayUntilNextWindowMs: number;
}

const RESERVE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current and tonumber(current) >= tonumber(ARGV[1]) then
  return {0, tonumber(current)}
end
local newCount = redis.call('INCR', KEYS[1])
if newCount == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if newCount > tonumber(ARGV[1]) then
  return {0, newCount}
end
return {1, newCount}
`;

export class RateLimiterService {
  /**
   * Generates the UTC hour window string and the start time of the next hour window.
   */
  public static getHourWindow(date: Date = new Date()): {
    hourKey: string;
    nextWindowStartMs: number;
    delayMs: number;
  } {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const hourKey = `${year}-${month}-${day}T${hour}`;

    const nextHourUtc = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1, 0, 0, 0));
    const nextWindowStartMs = nextHourUtc.getTime();
    const nowMs = Date.now();
    const delayMs = Math.max(nextWindowStartMs - nowMs, 1000);

    return { hourKey, nextWindowStartMs, delayMs };
  }

  /**
   * Atomically reserve a sending slot for a sender in the current hour window.
   */
  public static async reserveSendSlot(
    senderId: string,
    customLimit?: number,
    now: Date = new Date()
  ): Promise<RateLimitResult> {
    const limit = customLimit && customLimit > 0 ? customLimit : config.MAX_EMAILS_PER_HOUR_PER_SENDER;
    const { hourKey, nextWindowStartMs, delayMs } = this.getHourWindow(now);
    const redisKey = `ratelimit:sender:${senderId}:${hourKey}`;
    const ttlSeconds = 7200; // 2 hours retention for auditing

    try {
      const result = (await redisClient.eval(
        RESERVE_SCRIPT,
        1,
        redisKey,
        limit.toString(),
        ttlSeconds.toString()
      )) as [number, number];

      const allowed = result[0] === 1;
      const currentCount = result[1];

      logger.debug(
        { senderId, hourKey, limit, currentCount, allowed },
        'Evaluated sender rate limit'
      );

      return {
        allowed,
        currentCount,
        limit,
        hourKey,
        nextWindowStartMs,
        delayUntilNextWindowMs: delayMs
      };
    } catch (err: unknown) {
      logger.error({ err, senderId, redisKey }, 'Failed to evaluate rate limit script in Redis');
      // On Redis failure, fail-open or log error
      throw err;
    }
  }

  /**
   * Rollback a reservation if the send could not be initiated before transmission.
   */
  public static async rollbackReservation(senderId: string, now: Date = new Date()): Promise<void> {
    const { hourKey } = this.getHourWindow(now);
    const redisKey = `ratelimit:sender:${senderId}:${hourKey}`;
    try {
      const count = await redisClient.get(redisKey);
      if (count && parseInt(count, 10) > 0) {
        await redisClient.decr(redisKey);
        logger.debug({ senderId, hourKey }, 'Rolled back sender reservation');
      }
    } catch (err) {
      logger.warn({ err, senderId }, 'Failed to rollback rate limit reservation');
    }
  }

  /**
   * Get current hour count for a sender
   */
  public static async getCurrentCount(senderId: string, now: Date = new Date()): Promise<number> {
    const { hourKey } = this.getHourWindow(now);
    const redisKey = `ratelimit:sender:${senderId}:${hourKey}`;
    const count = await redisClient.get(redisKey);
    return count ? parseInt(count, 10) : 0;
  }
}
