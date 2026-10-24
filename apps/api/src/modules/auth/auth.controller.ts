import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { prisma } from '../../repositories/prisma';
import { logger } from '../../utils/logger';

function getGoogleOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_CALLBACK_URL
  );
}

export class AuthController {
  /**
   * Initiates Google OAuth 2.0 flow
   */
  public static async googleLogin(req: Request, res: Response): Promise<void> {
    const isPlaceholder =
      !config.GOOGLE_CLIENT_ID ||
      !config.GOOGLE_CLIENT_SECRET ||
      config.GOOGLE_CLIENT_ID.includes('your-google-client-id');

    if (isPlaceholder) {
      res.redirect(
        `${config.FRONTEND_URL}/login?error=${encodeURIComponent(
          'Google OAuth credentials are not yet configured in .env. Please see the instructions below to configure real credentials, or click "Quick Demo Sign-In" to evaluate the dashboard.'
        )}`
      );
      return;
    }

    const state = crypto.randomBytes(32).toString('hex');
    const isProduction = config.NODE_ENV === 'production';

    // Store state in HTTP-only cookie for CSRF verification
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000 // 10 minutes
    });

    const client = getGoogleOAuthClient();
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'consent',
      state
    });

    res.redirect(authorizeUrl);
  }

  /**
   * Google OAuth 2.0 callback
   */
  public static async googleCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error } = req.query;

    if (error) {
      logger.error({ error }, 'Google OAuth error returned from Google');
      res.redirect(`${config.FRONTEND_URL}/login?error=${encodeURIComponent(String(error))}`);
      return;
    }

    const cookieState = req.cookies?.oauth_state;
    if (!state || !cookieState || state !== cookieState) {
      logger.warn({ state, cookieState }, 'OAuth state mismatch (potential CSRF)');
      res.status(403).json({
        error: 'Forbidden',
        message: 'OAuth state parameter mismatch or expired. Please initiate login again.'
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Bad Request', message: 'Authorization code is missing' });
      return;
    }

    try {
      const client = getGoogleOAuthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: config.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        throw new Error('Google ID token did not contain required identity fields');
      }

      // Upsert user in PostgreSQL
      const user = await prisma.user.upsert({
        where: { googleId: payload.sub },
        create: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatarUrl: payload.picture
        },
        update: {
          name: payload.name || undefined,
          avatarUrl: payload.picture || undefined
        }
      });

      // Ensure default sender exists for user
      const existingSender = await prisma.sender.findFirst({
        where: { userId: user.id }
      });

      if (!existingSender) {
        await prisma.sender.create({
          data: {
            userId: user.id,
            email: user.email,
            displayName: user.name,
            hourlyLimit: config.MAX_EMAILS_PER_HOUR_PER_SENDER
          }
        });
      }

      // Generate JWT session
      const sessionToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.SESSION_SECRET,
        { expiresIn: '7d' }
      );

      const isProduction = config.NODE_ENV === 'production';

      res.cookie('auth_session', sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.clearCookie('oauth_state');
      res.redirect(`${config.FRONTEND_URL}/dashboard`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'Failed to exchange Google OAuth code');
      res.redirect(`${config.FRONTEND_URL}/login?error=${encodeURIComponent(msg)}`);
    }
  }

  /**
   * Return authenticated user profile and Slack integration status
   */
  public static async getMe(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        googleId: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const slackConnection = await prisma.slackConnection.findUnique({
      where: { userId }
    });

    res.json({
      user,
      slack: {
        connected: slackConnection?.status === 'CONNECTED',
        teamName: slackConnection?.teamName || null,
        channelName: slackConnection?.channelName || null
      }
    });
  }

  /**
   * Development evaluation session login
   */
  public static async devLogin(req: Request, res: Response): Promise<void> {
    const user = await prisma.user.upsert({
      where: { email: 'demo@reachinbox.ai' },
      create: {
        googleId: 'google-demo-1001',
        email: 'demo@reachinbox.ai',
        name: 'ReachInbox Demo Evaluator',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
      },
      update: {}
    });

    const existingSender = await prisma.sender.findFirst({
      where: { userId: user.id }
    });

    if (!existingSender) {
      await prisma.sender.create({
        data: {
          userId: user.id,
          email: 'sales-demo@reachinbox.ai',
          displayName: 'ReachInbox Growth Team',
          hourlyLimit: 5
        }
      });
    }

    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.SESSION_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('auth_session', sessionToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, user });
  }

  /**
   * Log out user
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    res.clearCookie('auth_session');
    res.json({ success: true, message: 'Logged out successfully' });
  }
}
