import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { ElasticsearchService } from './services/elasticsearchService';
import { prisma } from './repositories/prisma';
import { redisClient } from './utils/redis';

async function bootstrapServer() {
  try {
    // 1. Initialize Elasticsearch index if possible
    await ElasticsearchService.initIndex();

    // 2. Start HTTP server
    const app = createApp();
    const server = app.listen(config.API_PORT, () => {
      logger.info(`ReachInbox API server running at http://localhost:${config.API_PORT}`);
      logger.info(`Live Bull Board Dashboard available at http://localhost:${config.API_PORT}/admin/queues`);
    });

    // 3. Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down API server gracefully...');
      server.close(async () => {
        await redisClient.quit();
        await prisma.$disconnect();
        logger.info('API server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    process.exit(1);
  }
}

bootstrapServer();
