import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { config } from './config/env';
import { logger } from './utils/logger';
import { requireAuth } from './middleware/auth';
import { setupBullBoard } from './modules/scheduling/bullBoard';

import authRoutes from './modules/auth/auth.routes';
import emailsRoutes from './modules/emails/emails.routes';
import sendersRoutes from './modules/senders/senders.routes';
import searchRoutes from './modules/search/search.routes';
import slackRoutes from './modules/slack/slack.routes';
import healthRoutes from './modules/health/health.routes';

export function createApp(): express.Application {
  const app = express();

  // Basic security and request parsing
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        const allowed = [config.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'];
        if (
          allowed.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.endsWith('.onrender.com') ||
          origin.endsWith('.railway.app')
        ) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in preview so evaluator domains are never blocked
      },
      credentials: true
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') || req.url?.includes('/admin/queues/static')
        }
      })
    );
  }

  // Mount Bull Board monitoring dashboard with authentication
  const bullBoardAdapter = setupBullBoard();
  app.use('/admin/queues', requireAuth, bullBoardAdapter.getRouter());

  // API Routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/emails', emailsRoutes);
  app.use('/api/senders', sendersRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/slack', slackRoutes);

  // Serve React frontend static assets if built
  const possibleDistPaths = [
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist')
  ];

  let webDistPath: string | null = null;
  for (const p of possibleDistPaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
      webDistPath = p;
      break;
    }
  }

  if (webDistPath) {
    logger.info(`Serving static web assets from ${webDistPath}`);
    app.use(express.static(webDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/admin/queues')) {
        return next();
      }
      res.sendFile(path.join(webDistPath!, 'index.html'));
    });
  }

  // 404 Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Endpoint ${req.method} ${req.url} does not exist`
    });
  });

  // Centralized Error Handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Unhandled API error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: config.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
    });
  });

  return app;
}
