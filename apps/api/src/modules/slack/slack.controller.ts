import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { SlackService } from '../../services/slackService';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export class SlackController {
  /**
   * Initiates Slack OAuth 2.0 flow
   */
  public static async connectSlack(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;

    if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
      res.status(400).json({
        error: 'Configuration Missing',
        message: 'Slack OAuth credentials (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET) are not configured in .env. Please see the README for Slack App setup instructions.'
      });
      return;
    }

    const statePayload = {
      userId,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const state = jwt.sign(statePayload, config.SESSION_SECRET, { expiresIn: '15m' });
    const isProduction = config.NODE_ENV === 'production' || config.FRONTEND_URL.startsWith('https://');

    res.cookie('slack_oauth_state', state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: 15 * 60 * 1000
    });

    const authorizeUrl = SlackService.getAuthorizeUrl(state);
    res.redirect(authorizeUrl);
  }

  /**
   * Handles Slack OAuth 2.0 callback
   */
  public static async slackCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error } = req.query;

    if (error) {
      logger.error({ error }, 'Slack OAuth error returned from Slack');
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error&msg=${encodeURIComponent(String(error))}`);
      return;
    }

    const cookieState = req.cookies?.slack_oauth_state;
    if (!state || !cookieState || state !== cookieState) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid Slack OAuth state parameter'
      });
      return;
    }

    let userId: string;
    try {
      const decoded = jwt.verify(String(state), config.SESSION_SECRET) as { userId: string };
      userId = decoded.userId;
    } catch {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Expired Slack OAuth state'
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Bad Request', message: 'Authorization code is missing' });
      return;
    }

    try {
      await SlackService.handleOAuthCallback(userId, code);
      const isProduction = config.NODE_ENV === 'production' || config.FRONTEND_URL.startsWith('https://');
      res.clearCookie('slack_oauth_state', {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax'
      });
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack=connected`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Failed to complete Slack OAuth token exchange');
      res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error&msg=${encodeURIComponent(msg)}`);
    }
  }

  /**
   * Disconnects the user's Slack workspace
   */
  public static async disconnectSlack(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    await SlackService.disconnectSlack(userId);
    res.json({
      success: true,
      message: 'Slack workspace disconnected successfully'
    });
  }
}
