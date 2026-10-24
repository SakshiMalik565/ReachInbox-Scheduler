import { WebClient } from '@slack/web-api';
import { prisma } from '../repositories/prisma';
import { redisClient } from '../utils/redis';
import { encrypt, decrypt } from '../utils/crypto';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class SlackService {
  /**
   * Generates the Slack OAuth 2.0 authorization URL with requested scopes and secure state.
   */
  public static getAuthorizeUrl(state: string): string {
    const scopes = ['chat:write', 'channels:read', 'incoming-webhook'].join(',');
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', config.SLACK_CLIENT_ID);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('redirect_uri', config.SLACK_CALLBACK_URL);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Exchanges authorization code for OAuth token and persists the connection.
   */
  public static async handleOAuthCallback(userId: string, code: string): Promise<void> {
    if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
      throw new Error('Slack client credentials are not configured in environment');
    }

    const client = new WebClient();
    const response = await client.oauth.v2.access({
      client_id: config.SLACK_CLIENT_ID,
      client_secret: config.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: config.SLACK_CALLBACK_URL
    });

    if (!response.ok || !response.access_token) {
      throw new Error(`Slack OAuth exchange failed: ${response.error || 'Unknown error'}`);
    }

    const encryptedToken = encrypt(response.access_token);
    const teamId = response.team?.id || 'unknown';
    const teamName = response.team?.name || null;
    const channelId = response.incoming_webhook?.channel_id || null;
    const channelName = response.incoming_webhook?.channel || null;
    const scopes = response.scope || '';

    await prisma.slackConnection.upsert({
      where: { userId },
      create: {
        userId,
        teamId,
        teamName,
        channelId,
        channelName,
        encryptedAccessToken: encryptedToken,
        scopes,
        status: 'CONNECTED'
      },
      update: {
        teamId,
        teamName,
        channelId,
        channelName,
        encryptedAccessToken: encryptedToken,
        scopes,
        status: 'CONNECTED'
      }
    });

    logger.info({ userId, teamId, teamName }, 'Slack workspace connected successfully');
  }

  /**
   * Disconnects the user's Slack workspace.
   */
  public static async disconnectSlack(userId: string): Promise<void> {
    await prisma.slackConnection.updateMany({
      where: { userId },
      data: { status: 'DISCONNECTED' }
    });
    logger.info({ userId }, 'Slack connection disconnected');
  }

  /**
   * Sends a rate limit alert to the connected Slack workspace with Redis deduplication.
   */
  public static async sendRateLimitAlert(params: {
    userId: string;
    senderId: string;
    senderEmail: string;
    hourlyLimit: number;
    hourKey: string;
    nextWindowDate: Date;
  }): Promise<boolean> {
    const { userId, senderId, senderEmail, hourlyLimit, hourKey, nextWindowDate } = params;

    // Deduplication key in Redis: exactly 1 alert per sender per hour window
    const dedupKey = `slack:rate_limit_alert:${senderId}:${hourKey}`;
    const alreadySent = await redisClient.get(dedupKey);
    if (alreadySent) {
      logger.debug({ senderId, hourKey }, 'Rate limit Slack notification already dispatched for this window; skipping');
      return false;
    }

    // Set deduplication key with 3600s TTL immediately
    await redisClient.set(dedupKey, '1', 'EX', 3600);

    const connection = await prisma.slackConnection.findUnique({
      where: { userId }
    });

    if (!connection || connection.status !== 'CONNECTED') {
      logger.debug({ userId }, 'Slack is not connected for user; skipping rate limit alert');
      return false;
    }

    try {
      const accessToken = decrypt(connection.encryptedAccessToken);
      const client = new WebClient(accessToken);

      const formattedNextWindow = nextWindowDate.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Sender Hourly Rate Limit Reached',
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender:*\n\`${senderEmail}\``
            },
            {
              type: 'mrkdwn',
              text: `*Configured Limit:*\n${hourlyLimit} emails/hour`
            },
            {
              type: 'mrkdwn',
              text: `*Time Window:*\n${hourKey}:00 UTC`
            },
            {
              type: 'mrkdwn',
              text: `*Next Send Window:*\n${formattedNextWindow}`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Remaining scheduled emails for this sender have been automatically deferred to preserve sending reputation and comply with rate limits.'
            }
          ]
        }
      ];

      // Send to connected channel or fallback
      const targetChannel = connection.channelId || '#general';
      await client.chat.postMessage({
        channel: targetChannel,
        text: `Sender ${senderEmail} has reached the hourly limit (${hourlyLimit}/hr). Remaining emails deferred to ${formattedNextWindow}.`,
        blocks
      });

      logger.info({ userId, senderEmail, hourKey }, 'Real Slack rate limit alert sent successfully');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, userId }, 'Failed to send Slack alert (non-blocking)');
      return false;
    }
  }
}
