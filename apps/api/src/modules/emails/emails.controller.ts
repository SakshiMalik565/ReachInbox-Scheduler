import { Request, Response } from 'express';
import {
  ScheduleEmailSchema,
  BulkScheduleSchema,
  EmailRecipientSchema,
  BulkScheduleResult
} from '@reachinbox/shared';
import { prisma } from '../../repositories/prisma';
import { scheduleEmailJob, removeEmailJob } from '../../queues/emailQueue';
import { ElasticsearchService } from '../../services/elasticsearchService';
import { logger } from '../../utils/logger';

export class EmailsController {
  /**
   * Schedule a single email with idempotency support
   */
  public static async scheduleEmail(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const validation = ScheduleEmailSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.format()
      });
      return;
    }

    const {
      senderId,
      recipient,
      subject,
      body,
      scheduledTime,
      idempotencyKey,
      minDelayMs,
      hourlyLimit
    } = validation.data;

    // Verify sender ownership
    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId }
    });

    if (!sender) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Sender not found or not owned by your account'
      });
      return;
    }

    if (!sender.enabled) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'The selected sender is currently disabled'
      });
      return;
    }

    // Idempotency check: if key supplied, check for existing email
    if (idempotencyKey) {
      const existingEmail = await prisma.email.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey
          }
        },
        include: { sender: true }
      });

      if (existingEmail) {
        logger.info(
          { userId, idempotencyKey, emailId: existingEmail.id },
          'Idempotent scheduling request detected; returning existing email record'
        );
        res.status(200).json({
          data: existingEmail,
          isDuplicate: true
        });
        return;
      }
    }

    const scheduledDate = new Date(scheduledTime);

    // 1. Persist email record in PostgreSQL first
    const email = await prisma.email.create({
      data: {
        userId,
        senderId,
        recipient,
        subject,
        body,
        scheduledTime: scheduledDate,
        status: 'SCHEDULED',
        idempotencyKey: idempotencyKey || null
      },
      include: { sender: true }
    });

    // 2. Safely enqueue into BullMQ
    const stableJobId = `email-job-${email.id}`;
    const jobId = await scheduleEmailJob({
      emailId: email.id,
      userId,
      senderId,
      scheduledTime: scheduledDate,
      customMinDelayMs: minDelayMs,
      customHourlyLimit: hourlyLimit || sender.hourlyLimit,
      jobId: stableJobId
    });

    // 3. Update bullJobId
    const updatedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { bullJobId: jobId },
      include: { sender: true }
    });

    // 4. Index in Elasticsearch (safe non-blocking)
    await ElasticsearchService.indexEmail({
      id: updatedEmail.id,
      userId: updatedEmail.userId,
      senderId: updatedEmail.senderId,
      senderEmail: sender.email,
      senderName: sender.displayName,
      recipient: updatedEmail.recipient,
      subject: updatedEmail.subject,
      body: updatedEmail.body,
      status: updatedEmail.status,
      scheduledTime: updatedEmail.scheduledTime.toISOString(),
      createdAt: updatedEmail.createdAt.toISOString()
    });

    res.status(201).json({
      data: updatedEmail,
      isDuplicate: false
    });
  }

  /**
   * Bulk schedule emails with robust recipient validation and clear summary
   */
  public static async scheduleBulk(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const validation = BulkScheduleSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.format()
      });
      return;
    }

    const {
      senderId,
      subject,
      body,
      recipients,
      scheduledTime,
      minDelayMs,
      hourlyLimit
    } = validation.data;

    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId }
    });

    if (!sender) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Sender not found or not owned by your account'
      });
      return;
    }

    if (!sender.enabled) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'The selected sender is currently disabled'
      });
      return;
    }

    const scheduledDate = new Date(scheduledTime);
    const validRecipients: string[] = [];
    const rejected: Array<{ email: string; reason: string }> = [];

    // Validate each recipient address independently
    for (const rawRecipient of recipients) {
      const emailTrimmed = typeof rawRecipient === 'string' ? rawRecipient.trim() : '';
      const recipientCheck = EmailRecipientSchema.safeParse(emailTrimmed);

      if (!recipientCheck.success) {
        rejected.push({
          email: rawRecipient,
          reason: 'Invalid email address format'
        });
      } else {
        validRecipients.push(recipientCheck.data);
      }
    }

    const acceptedEmails: Array<unknown> = [];

    // Schedule valid recipients
    for (const recipient of validRecipients) {
      const email = await prisma.email.create({
        data: {
          userId,
          senderId,
          recipient,
          subject,
          body,
          scheduledTime: scheduledDate,
          status: 'SCHEDULED'
        },
        include: { sender: true }
      });

      const stableJobId = `email-job-${email.id}`;
      const jobId = await scheduleEmailJob({
        emailId: email.id,
        userId,
        senderId,
        scheduledTime: scheduledDate,
        customMinDelayMs: minDelayMs,
        customHourlyLimit: hourlyLimit || sender.hourlyLimit,
        jobId: stableJobId
      });

      const updated = await prisma.email.update({
        where: { id: email.id },
        data: { bullJobId: jobId },
        include: { sender: true }
      });

      acceptedEmails.push(updated);

      // Index in Elasticsearch
      await ElasticsearchService.indexEmail({
        id: updated.id,
        userId: updated.userId,
        senderId: updated.senderId,
        senderEmail: sender.email,
        senderName: sender.displayName,
        recipient: updated.recipient,
        subject: updated.subject,
        body: updated.body,
        status: updated.status,
        scheduledTime: updated.scheduledTime.toISOString(),
        createdAt: updated.createdAt.toISOString()
      });
    }

    const summary: BulkScheduleResult = {
      totalSubmitted: recipients.length,
      acceptedCount: acceptedEmails.length,
      rejectedCount: rejected.length,
      accepted: acceptedEmails as any,
      rejected
    };

    res.status(201).json(summary);
  }

  /**
   * Get list of scheduled emails for authenticated user
   */
  public static async getScheduledEmails(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: {
          userId,
          status: { in: ['SCHEDULED', 'PROCESSING'] }
        },
        include: { sender: true },
        orderBy: { scheduledTime: 'asc' },
        skip,
        take: limit
      }),
      prisma.email.count({
        where: {
          userId,
          status: { in: ['SCHEDULED', 'PROCESSING'] }
        }
      })
    ]);

    res.json({
      data: emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  }

  /**
   * Get list of sent/failed emails for authenticated user
   */
  public static async getSentEmails(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: {
          userId,
          status: { in: ['SENT', 'FAILED', 'CANCELLED'] }
        },
        include: { sender: true },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.email.count({
        where: {
          userId,
          status: { in: ['SENT', 'FAILED', 'CANCELLED'] }
        }
      })
    ]);

    res.json({
      data: emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  }

  /**
   * Get email details by ID
   */
  public static async getEmailById(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const { id } = req.params;

    const email = await prisma.email.findFirst({
      where: { id, userId },
      include: { sender: true }
    });

    if (!email) {
      res.status(404).json({ error: 'Not Found', message: 'Email not found' });
      return;
    }

    res.json({ data: email });
  }

  /**
   * Safely cancel a scheduled email
   */
  public static async cancelEmail(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const { id } = req.params;

    const email = await prisma.email.findFirst({
      where: { id, userId }
    });

    if (!email) {
      res.status(404).json({ error: 'Not Found', message: 'Email not found' });
      return;
    }

    if (email.status !== 'SCHEDULED') {
      res.status(400).json({
        error: 'Bad Request',
        message: `Only emails in SCHEDULED status can be cancelled. Current status is ${email.status}`
      });
      return;
    }

    // Remove job from BullMQ queue
    if (email.bullJobId) {
      await removeEmailJob(email.bullJobId);
    }

    const updated = await prisma.email.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { sender: true }
    });

    // Update in Elasticsearch
    await ElasticsearchService.updateEmailStatus(id, 'CANCELLED');

    res.json({
      message: 'Email scheduled dispatch cancelled successfully',
      data: updated
    });
  }
}
