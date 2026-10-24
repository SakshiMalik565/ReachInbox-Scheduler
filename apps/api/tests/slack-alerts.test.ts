import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackService } from '../src/services/slackService';
import { redisClient } from '../src/utils/redis';
import { prisma } from '../src/repositories/prisma';

describe('Slack Notification & Deduplication Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips alert if deduplication key is already present in Redis for the current window', async () => {
    // Redis has deduplication key set
    vi.spyOn(redisClient, 'get').mockResolvedValue('1');

    const result = await SlackService.sendRateLimitAlert({
      userId: 'user-123',
      senderId: 'sender-456',
      senderEmail: 'test@sender.com',
      hourlyLimit: 100,
      hourKey: '2026-10-25T14',
      nextWindowDate: new Date()
    });

    expect(result).toBe(false);
  });

  it('safely handles disconnected Slack without crashing', async () => {
    // Redis has no deduplication key
    vi.spyOn(redisClient, 'get').mockResolvedValue(null);
    vi.spyOn(redisClient, 'set').mockResolvedValue('OK');
    // Prisma finds no connected Slack
    vi.spyOn(prisma.slackConnection, 'findUnique').mockResolvedValue(null);

    const result = await SlackService.sendRateLimitAlert({
      userId: 'user-123',
      senderId: 'sender-456',
      senderEmail: 'test@sender.com',
      hourlyLimit: 100,
      hourKey: '2026-10-25T14',
      nextWindowDate: new Date()
    });

    expect(result).toBe(false);
  });
});
