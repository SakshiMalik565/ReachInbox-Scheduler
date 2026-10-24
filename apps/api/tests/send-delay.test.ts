import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendDelayLimiterService } from '../src/services/sendDelayLimiter';
import { redisClient } from '../src/utils/redis';

describe('Send Delay Limiter Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('delays dispatch when elapsed time since last send is less than minDelayMs', async () => {
    const now = Date.now();
    // Sent 500ms ago, minDelay is 2000ms -> should sleep for ~1500ms
    const recentSendTime = (now - 500).toString();
    vi.spyOn(redisClient, 'get').mockResolvedValue(recentSendTime);
    const setSpy = vi.spyOn(redisClient, 'set').mockResolvedValue('OK');

    const waitMs = await SendDelayLimiterService.enforceMinDelay('sender-1', 2000);

    expect(waitMs).toBeGreaterThan(1000);
    expect(waitMs).toBeLessThanOrEqual(1600);
    expect(setSpy).toHaveBeenCalledWith('sender:last_send:sender-1', expect.any(String), 'EX', 3600);
  });

  it('does not delay if no previous send timestamp exists in Redis', async () => {
    vi.spyOn(redisClient, 'get').mockResolvedValue(null);
    const setSpy = vi.spyOn(redisClient, 'set').mockResolvedValue('OK');

    const waitMs = await SendDelayLimiterService.enforceMinDelay('sender-1', 2000);

    expect(waitMs).toBe(0);
    expect(setSpy).toHaveBeenCalledWith('sender:last_send:sender-1', expect.any(String), 'EX', 3600);
  });
});
