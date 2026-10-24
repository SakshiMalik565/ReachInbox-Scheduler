import { prisma } from '../repositories/prisma';
import { emailQueue, scheduleEmailJob } from '../queues/emailQueue';
import { logger } from '../utils/logger';

export class ReconciliationService {
  /**
   * Reconciles emails in PostgreSQL against BullMQ delayed/waiting jobs.
   * Ensures that any email marked SCHEDULED in PostgreSQL actually exists in Redis.
   * Automatically triggered on worker startup to recover un-enqueued jobs.
   */
  public static async reconcileScheduledEmails(): Promise<{
    inspected: number;
    recovered: number;
    alreadyQueued: number;
  }> {
    logger.info('Starting PostgreSQL-to-BullMQ reconciliation check...');

    const scheduledEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED'
      },
      include: {
        sender: true
      }
    });

    let recovered = 0;
    let alreadyQueued = 0;

    for (const email of scheduledEmails) {
      const stableJobId = email.bullJobId || `email-job-${email.id}`;
      const existingJob = await emailQueue.getJob(stableJobId);

      if (!existingJob) {
        logger.warn(
          { emailId: email.id, stableJobId, scheduledTime: email.scheduledTime },
          'Scheduled email found in PostgreSQL but missing in BullMQ queue; recovering and enqueuing'
        );

        const newJobId = await scheduleEmailJob({
          emailId: email.id,
          userId: email.userId,
          senderId: email.senderId,
          scheduledTime: email.scheduledTime,
          customHourlyLimit: email.sender?.hourlyLimit,
          jobId: stableJobId
        });

        await prisma.email.update({
          where: { id: email.id },
          data: { bullJobId: newJobId }
        });

        recovered++;
      } else {
        alreadyQueued++;
      }
    }

    logger.info(
      {
        totalScheduledInDb: scheduledEmails.length,
        alreadyQueued,
        recovered
      },
      'PostgreSQL-to-BullMQ reconciliation check completed'
    );

    return {
      inspected: scheduledEmails.length,
      recovered,
      alreadyQueued
    };
  }
}
