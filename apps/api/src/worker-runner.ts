import { EmailWorker } from './workers/emailWorker';
import { ReconciliationService } from './services/reconciliationService';
import { ElasticsearchService } from './services/elasticsearchService';
import { logger } from './utils/logger';
import { redisClient } from './utils/redis';
import { prisma } from './repositories/prisma';

async function bootstrapWorker() {
  logger.info('Initializing independent ReachInbox Worker process...');

  try {
    // 1. Initialize Elasticsearch index if needed
    await ElasticsearchService.initIndex();

    // 2. Perform startup reconciliation between PostgreSQL and BullMQ
    await ReconciliationService.reconcileScheduledEmails();

    // 3. Start BullMQ worker
    const emailWorker = new EmailWorker();
    emailWorker.start();

    // 4. Register graceful termination handlers
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Worker received shutdown signal. Closing resources gracefully...');
      await emailWorker.close();
      await redisClient.quit();
      await prisma.$disconnect();
      logger.info('Worker shutdown completed cleanly');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info('Worker process is actively listening for scheduled email jobs');
  } catch (err) {
    logger.error({ err }, 'Fatal error during worker bootstrap');
    process.exit(1);
  }
}

bootstrapWorker();
