import { Request, Response } from 'express';
import { prisma } from '../../repositories/prisma';
import { redisClient } from '../../utils/redis';
import { ElasticsearchService } from '../../services/elasticsearchService';
import { emailQueue } from '../../queues/emailQueue';

export class HealthController {
  /**
   * Health check for API, PostgreSQL, Redis, and Elasticsearch
   */
  public static async getHealth(req: Request, res: Response): Promise<void> {
    const checks: Record<string, { status: 'healthy' | 'unhealthy'; latencyMs?: number; error?: string }> = {};

    // 1. PostgreSQL check
    const pgStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'healthy', latencyMs: Date.now() - pgStart };
    } catch (err: unknown) {
      checks.postgres = {
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err)
      };
    }

    // 2. Redis check
    const redisStart = Date.now();
    try {
      const pong = await redisClient.ping();
      checks.redis = {
        status: pong === 'PONG' ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - redisStart
      };
    } catch (err: unknown) {
      checks.redis = {
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err)
      };
    }

    // 3. Elasticsearch check
    const esStart = Date.now();
    try {
      const esClient = ElasticsearchService.getClient();
      const esPing = await esClient.ping();
      checks.elasticsearch = {
        status: esPing ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - esStart
      };
    } catch (err: unknown) {
      checks.elasticsearch = {
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err)
      };
    }

    const isAllHealthy = Object.values(checks).every((c) => c.status === 'healthy');
    const isDegraded = checks.postgres.status === 'healthy' && checks.redis.status === 'healthy';

    const overallStatus = isAllHealthy ? 'ok' : isDegraded ? 'degraded' : 'error';
    const statusCode = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      components: checks
    });
  }

  /**
   * Get BullMQ queue statistics
   */
  public static async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      const counts = await emailQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused');
      const isPaused = await emailQueue.isPaused();

      res.json({
        queue: 'email-delivery-queue',
        isPaused,
        counts: {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          delayed: counts.delayed || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          paused: counts.paused || 0
        }
      });
    } catch (err: unknown) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
