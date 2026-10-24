import { Queue } from 'bullmq';
import { redisOptions } from '../utils/redis';
import { logger } from '../utils/logger';

export const EMAIL_QUEUE_NAME = 'email-delivery-queue';

export interface EmailJobData {
  emailId: string;
  userId: string;
  senderId: string;
  customMinDelayMs?: number;
  customHourlyLimit?: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 2000
    },
    removeOnFail: {
      age: 86400 * 7 // 7 days
    }
  }
});

emailQueue.on('error', (err) => {
  logger.error({ err: err.message }, 'BullMQ Queue error');
});

/**
 * Enqueues an email job into BullMQ with a stable job ID and precise delay.
 */
export async function scheduleEmailJob(params: {
  emailId: string;
  userId: string;
  senderId: string;
  scheduledTime: Date;
  customMinDelayMs?: number;
  customHourlyLimit?: number;
  jobId?: string;
}): Promise<string> {
  const { emailId, userId, senderId, scheduledTime, customMinDelayMs, customHourlyLimit } = params;
  const stableJobId = params.jobId || `email-job-${emailId}`;

  const nowMs = Date.now();
  const targetMs = new Date(scheduledTime).getTime();
  const delay = Math.max(0, targetMs - nowMs);

  const job = await emailQueue.add(
    'send-email',
    {
      emailId,
      userId,
      senderId,
      customMinDelayMs,
      customHourlyLimit
    },
    {
      jobId: stableJobId,
      delay
    }
  );

  logger.info(
    {
      jobId: job.id,
      emailId,
      scheduledTime: scheduledTime.toISOString(),
      delayMs: delay
    },
    'Email job successfully enqueued in BullMQ'
  );

  return job.id as string;
}

/**
 * Safely cancels a scheduled job from BullMQ if it is still delayed or waiting.
 */
export async function removeEmailJob(jobId: string): Promise<boolean> {
  try {
    const job = await emailQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'delayed' || state === 'waiting') {
        await job.remove();
        logger.info({ jobId, state }, 'Removed email job from BullMQ');
        return true;
      }
    }
    return false;
  } catch (err) {
    logger.warn({ err, jobId }, 'Failed to remove job from BullMQ');
    return false;
  }
}
