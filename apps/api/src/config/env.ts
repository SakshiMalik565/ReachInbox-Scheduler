import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Load .env from root or apps/api
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  API_BASE_URL: z.string().default('http://localhost:4000'),

  // PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional().default(''),
  ELASTICSEARCH_PASSWORD: z.string().optional().default(''),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/google/callback'),

  // Security & Encryption
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters').default('super_secret_session_key_32_characters_long!'),
  TOKEN_ENCRYPTION_KEY: z.string().length(64, 'TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)').default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_CALLBACK_URL: z.string().default('http://localhost:4000/api/slack/callback'),

  // Ethereal SMTP
  ETHEREAL_SMTP_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_SMTP_PORT: z.coerce.number().default(587),
  ETHEREAL_SMTP_USER: z.string().optional().default(''),
  ETHEREAL_SMTP_PASS: z.string().optional().default(''),

  // Worker Settings
  WORKER_CONCURRENCY: z.coerce.number().min(1).default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().min(1).default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error({ errors: parsed.error.format() }, 'Invalid environment configuration');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration');
  }
}

export const config = parsed.success
  ? parsed.data
  : envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5433/reachinbox_scheduler?schema=public',
      SESSION_SECRET: process.env.SESSION_SECRET || 'super_secret_session_key_32_characters_long!',
      TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });
