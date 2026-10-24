import { Worker, Job } from 'bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from '../queues/emailQueue';
import { redisOptions } from '../utils/redis';
import { config } from '../config/env';
import { prisma } from '../repositories/prisma';
import { RateLimiterService } from '../services/rateLimiter';
import { SendDelayLimiterService } from '../services/sendDelayLimiter';
import { SmtpService } from '../services/smtpService';
import { SlackService } from '../services/slackService';
import { ElasticsearchService } from '../services/elasticsearchService';
import { logger } from '../utils/logger';

export class EmailWorker {
  private worker: Worker<EmailJobData> | null = null;

  public start(): Worker<EmailJobData> {
    logger.info(
      { concurrency: config.WORKER_CONCURRENCY },
      'Starting BullMQ Email Worker process...'
    );

    this.worker = new Worker<EmailJobData>(
      EMAIL_QUEUE_NAME,
      async (job: Job<EmailJobData>, token?: string) => {
        await this.processJob(job, token);
      },
      {
        connection: redisOptions,
        concurrency: config.WORKER_CONCURRENCY,
        limiter: {
          max: 10,
          duration: 1000
        }
      }
    );

    this.worker.on('active', (job) => {
      logger.info({ jobId: job.id, emailId: job.data.emailId }, 'Job active');
    });

    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id, emailId: job.data.emailId }, 'Job completed successfully');
    });

    this.worker.on('failed', (job, err) => {
      logger.error(
        {
          jobId: job?.id,
          emailId: job?.data.emailId,
          attemptsMade: job?.attemptsMade,
          err: err.message
        },
        'Job processing failed'
      );
    });

    this.worker.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ Worker internal error');
    });

    return this.worker;
  }

  public async close(): Promise<void> {
    if (this.worker) {
      logger.info('Gracefully shutting down email worker...');
      await this.worker.close();
      this.worker = null;
    }
  }

  private async processJob(job: Job<EmailJobData>, token?: string): Promise<void> {
    const { emailId, userId, senderId, customMinDelayMs, customHourlyLimit } = job.data;

    // 1. Fetch current email and sender record from PostgreSQL
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { sender: true }
    });

    if (!email) {
      logger.warn({ emailId }, 'Email record not found in PostgreSQL; aborting job');
      return;
    }

    // 2. Concurrency & idempotency verification: Do not re-send if already SENT or CANCELLED
    if (email.status === 'SENT') {
      logger.info({ emailId }, 'Email is already marked SENT in PostgreSQL; skipping idempotent re-send');
      return;
    }

    if (email.status === 'CANCELLED') {
      logger.info({ emailId }, 'Email was cancelled by user; skipping dispatch');
      return;
    }

    const sender = email.sender;
    if (!sender || !sender.enabled) {
      logger.warn({ emailId, senderId }, 'Sender is disabled or deleted; failing email');
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          lastError: 'Configured sender is disabled or unavailable'
        }
      });
      await ElasticsearchService.updateEmailStatus(emailId, 'FAILED');
      return;
    }

    // 3. Distributed per-sender hourly rate limiting check
    const rateLimit = await RateLimiterService.reserveSendSlot(
      senderId,
      customHourlyLimit || sender.hourlyLimit
    );

    if (!rateLimit.allowed) {
      logger.warn(
        {
          senderId,
          currentCount: rateLimit.currentCount,
          limit: rateLimit.limit,
          nextWindowStartMs: rateLimit.nextWindowStartMs
        },
        'Hourly sender rate limit exhausted; deferring job to next hour window'
      );

      // Trigger Slack notification with 1-hour deduplication
      const nextWindowDate = new Date(rateLimit.nextWindowStartMs);
      await SlackService.sendRateLimitAlert({
        userId,
        senderId,
        senderEmail: sender.email,
        hourlyLimit: rateLimit.limit,
        hourKey: rateLimit.hourKey,
        nextWindowDate
      });

      // Update email scheduledTime in PostgreSQL to next window
      await prisma.email.update({
        where: { id: emailId },
        data: {
          scheduledTime: nextWindowDate,
          status: 'SCHEDULED'
        }
      });

      // Defer the BullMQ job
      if (token && typeof job.moveToDelayed === 'function') {
        try {
          await job.moveToDelayed(rateLimit.nextWindowStartMs, token);
          return;
        } catch (deferErr) {
          logger.debug({ deferErr }, 'Could not moveToDelayed with token; re-enqueuing');
        }
      }

      // Fallback deferral: re-add with explicit delay
      await emailQueue.add(
        job.name,
        job.data,
        {
          delay: Math.max(rateLimit.delayUntilNextWindowMs, 2000),
          jobId: `email-job-${emailId}-def-${rateLimit.hourKey}`
        }
      );
      return;
    }

    // 4. Enforce minimum delay between sends for the sender
    await SendDelayLimiterService.enforceMinDelay(senderId, customMinDelayMs);

    // 5. Atomic state transition: mark PROCESSING in PostgreSQL
    const updateResult = await prisma.email.updateMany({
      where: {
        id: emailId,
        status: { in: ['SCHEDULED', 'PROCESSING'] }
      },
      data: {
        status: 'PROCESSING',
        retryCount: job.attemptsMade
      }
    });

    if (updateResult.count === 0) {
      logger.warn({ emailId }, 'Email state changed concurrently; aborting send');
      await RateLimiterService.rollbackReservation(senderId);
      return;
    }

    // 6. Send email via Nodemailer Ethereal SMTP
    try {
      const sendResult = await SmtpService.sendMail({
        fromEmail: sender.email,
        fromName: sender.displayName,
        toEmail: email.recipient,
        subject: email.subject,
        body: email.body,
        senderCustomConfig: {
          smtpHost: sender.smtpHost,
          smtpPort: sender.smtpPort,
          smtpSecure: sender.smtpSecure,
          etherealUser: sender.etherealUser,
          etherealPassEncrypted: sender.etherealPassEncrypted
        }
      });

      const sentTime = new Date();

      // 7. Success state update in PostgreSQL
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          actualSentTime: sentTime,
          etherealPreviewUrl: sendResult.previewUrl,
          lastError: null
        }
      });

      // 8. Synchronize to Elasticsearch
      await ElasticsearchService.updateEmailStatus(emailId, 'SENT', sentTime.toISOString());
    } catch (sendErr: unknown) {
      const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
      const isPermanent = SmtpService.isPermanentError(sendErr);

      logger.error(
        { emailId, attemptsMade: job.attemptsMade, isPermanent, err: errorMessage },
        'Failed to deliver email through SMTP'
      );

      if (isPermanent || job.attemptsMade >= 3) {
        // Mark as permanently FAILED
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            lastError: errorMessage
          }
        });
        await ElasticsearchService.updateEmailStatus(emailId, 'FAILED');
      } else {
        // Revert to SCHEDULED for BullMQ retry
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'SCHEDULED',
            lastError: errorMessage,
            retryCount: job.attemptsMade + 1
          }
        });
        // Re-throw so BullMQ will trigger exponential backoff retry
        throw sendErr;
      }
    }
  }
}
