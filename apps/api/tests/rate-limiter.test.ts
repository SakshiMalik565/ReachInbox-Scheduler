import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiterService } from '../src/services/rateLimiter';
import { redisClient } from '../src/utils/redis';

describe('Distributed Hourly Rate Limiter Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hour Window Calculation', () => {
    it('computes consistent UTC hour key and next window timestamp', () => {
      // 2026-10-25 14:35:20 UTC
      const date = new Date(Date.UTC(2026, 9, 25, 14, 35, 20));
      const { hourKey, nextWindowStartMs, delayMs } = RateLimiterService.getHourWindow(date);

      expect(hourKey).toBe('2026-10-25T14');

      // Next window should be exactly 2026-10-25 15:00:00 UTC
      const nextWindowDate = new Date(nextWindowStartMs);
      expect(nextWindowDate.getUTCHours()).toBe(15);
      expect(nextWindowDate.getUTCMinutes()).toBe(0);
      expect(nextWindowDate.getUTCSeconds()).toBe(0);
      expect(delayMs).toBeGreaterThan(0);
    });
  });

  describe('Atomic Reservation Logic & Limits', () => {
    it('allows sends when counter is strictly below limit', async () => {
      // Mock Redis eval returning [1, newCount] (success)
      vi.spyOn(redisClient, 'eval').mockResolvedValue([1, 42] as any);

      const result = await RateLimiterService.reserveSendSlot('sender-1', 100);

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(42);
      expect(result.limit).toBe(100);
    });

    it('denies send and signals deferral when limit is reached', async () => {
      // Mock Redis eval returning [0, currentCount] (exhausted)
      vi.spyOn(redisClient, 'eval').mockResolvedValue([0, 100] as any);

      const result = await RateLimiterService.reserveSendSlot('sender-1', 100);

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(100);
      expect(result.nextWindowStartMs).toBeDefined();
      expect(result.delayUntilNextWindowMs).toBeGreaterThan(0);
    });

    it('isolates rate limits per sender so Sender B is not affected by Sender A hitting limit', async () => {
      const evalSpy = vi.spyOn(redisClient, 'eval').mockImplementation(async (_script, _numkeys, key) => {
        if (String(key).includes('sender-A')) {
          // Sender A limit reached
          return [0, 100];
        } else {
          // Sender B within limit
          return [1, 5];
        }
      });

      const resA = await RateLimiterService.reserveSendSlot('sender-A', 100);
      const resB = await RateLimiterService.reserveSendSlot('sender-B', 100);

      expect(resA.allowed).toBe(false);
      expect(resB.allowed).toBe(true);
      expect(evalSpy).toHaveBeenCalledTimes(2);
    });
  });
});
