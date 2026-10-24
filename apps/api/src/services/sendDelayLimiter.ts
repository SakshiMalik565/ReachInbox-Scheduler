import { redisClient } from '../utils/redis';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class SendDelayLimiterService {
  /**
   * Enforces minimum delay between consecutive email dispatches for the specified sender.
   * Uses Redis to coordinate across concurrent workers.
   */
  public static async enforceMinDelay(
    senderId: string,
    customMinDelayMs?: number
  ): Promise<number> {
    const minDelay = customMinDelayMs !== undefined ? customMinDelayMs : config.MIN_DELAY_BETWEEN_EMAILS_MS;
    if (minDelay <= 0) return 0;

    const redisKey = `sender:last_send:${senderId}`;
    const lastSendStr = await redisClient.get(redisKey);

    let waitMs = 0;
    if (lastSendStr) {
      const lastSendTime = parseInt(lastSendStr, 10);
      const elapsed = Date.now() - lastSendTime;
      if (elapsed < minDelay) {
        waitMs = minDelay - elapsed;
        logger.debug(
          { senderId, elapsed, minDelay, waitMs },
          'Enforcing minimum inter-email delay for sender'
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    // Update the last sent timestamp with 1-hour expiration
    await redisClient.set(redisKey, Date.now().toString(), 'EX', 3600);
    return waitMs;
  }
}
