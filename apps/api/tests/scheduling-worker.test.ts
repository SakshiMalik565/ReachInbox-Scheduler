import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emailQueue, scheduleEmailJob } from '../src/queues/emailQueue';
import { ReconciliationService } from '../src/services/reconciliationService';
import { prisma } from '../src/repositories/prisma';
import { SmtpService } from '../src/services/smtpService';

describe('Scheduling, Idempotency & Worker Processing Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Delayed Scheduling & Stable Job IDs', () => {
    it('calculates delay accurately and creates job with stable deterministic ID', async () => {
      const addSpy = vi.spyOn(emailQueue, 'add').mockResolvedValue({ id: 'email-job-abc-123' } as any);

      const targetTime = new Date(Date.now() + 10000); // 10 seconds in future
      const jobId = await scheduleEmailJob({
        emailId: 'abc-123',
        userId: 'user-1',
        senderId: 'sender-1',
        scheduledTime: targetTime
      });

      expect(jobId).toBe('email-job-abc-123');
      expect(addSpy).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({ emailId: 'abc-123' }),
        expect.objectContaining({
          jobId: 'email-job-abc-123',
          delay: expect.any(Number)
        })
      );
    });
  });

  describe('PostgreSQL to BullMQ Startup Reconciliation (Crash Recovery)', () => {
    it('detects scheduled emails missing in Redis and safely re-enqueues them', async () => {
      const mockScheduledEmails = [
        {
          id: 'email-1',
          userId: 'user-1',
          senderId: 'sender-1',
          scheduledTime: new Date(Date.now() + 5000),
          bullJobId: 'email-job-email-1',
          status: 'SCHEDULED',
          sender: { hourlyLimit: 100 }
        }
      ];

      vi.spyOn(prisma.email, 'findMany').mockResolvedValue(mockScheduledEmails as any);
      // Mock that job does NOT exist in BullMQ (simulating Redis loss or restart)
      vi.spyOn(emailQueue, 'getJob').mockResolvedValue(undefined);
      vi.spyOn(emailQueue, 'add').mockResolvedValue({ id: 'email-job-email-1' } as any);
      vi.spyOn(prisma.email, 'update').mockResolvedValue({} as any);

      const stats = await ReconciliationService.reconcileScheduledEmails();

      expect(stats.inspected).toBe(1);
      expect(stats.recovered).toBe(1);
      expect(stats.alreadyQueued).toBe(0);
    });

    it('does not re-enqueue emails that are already present in BullMQ', async () => {
      const mockScheduledEmails = [
        {
          id: 'email-2',
          userId: 'user-1',
          senderId: 'sender-1',
          scheduledTime: new Date(Date.now() + 5000),
          bullJobId: 'email-job-email-2',
          status: 'SCHEDULED',
          sender: { hourlyLimit: 100 }
        }
      ];

      vi.spyOn(prisma.email, 'findMany').mockResolvedValue(mockScheduledEmails as any);
      // Mock that job already exists in BullMQ
      vi.spyOn(emailQueue, 'getJob').mockResolvedValue({ id: 'email-job-email-2' } as any);
      const addSpy = vi.spyOn(emailQueue, 'add');

      const stats = await ReconciliationService.reconcileScheduledEmails();

      expect(stats.inspected).toBe(1);
      expect(stats.recovered).toBe(0);
      expect(stats.alreadyQueued).toBe(1);
      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  describe('SMTP Error Classification', () => {
    it('accurately identifies permanent 5xx mailbox errors as non-retryable', () => {
      expect(SmtpService.isPermanentError('550 5.1.1 User unknown')).toBe(true);
      expect(SmtpService.isPermanentError('Invalid address: recipient not found')).toBe(true);
      expect(SmtpService.isPermanentError('553 mailbox unavailable')).toBe(true);
    });

    it('identifies transient network or timeout errors as retryable', () => {
      expect(SmtpService.isPermanentError('ETIMEDOUT connection closed')).toBe(false);
      expect(SmtpService.isPermanentError('ECONNRESET')).toBe(false);
      expect(SmtpService.isPermanentError('421 service temporarily unavailable')).toBe(false);
    });
  });
});
