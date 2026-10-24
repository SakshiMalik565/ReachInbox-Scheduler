import { describe, it, expect } from 'vitest';
import {
  ScheduleEmailSchema,
  BulkScheduleSchema,
  CreateSenderSchema,
  EmailRecipientSchema,
  SearchEmailSchema,
  EmailStatus
} from '@reachinbox/shared';

describe('Validation Schemas Unit Tests', () => {
  describe('EmailRecipientSchema', () => {
    it('accepts valid email addresses', () => {
      expect(EmailRecipientSchema.safeParse('test@example.com').success).toBe(true);
      expect(EmailRecipientSchema.safeParse('user.name+tag@sub.domain.co').success).toBe(true);
    });

    it('rejects invalid or malformed email syntax', () => {
      expect(EmailRecipientSchema.safeParse('not-an-email').success).toBe(false);
      expect(EmailRecipientSchema.safeParse('@missingusername.com').success).toBe(false);
      expect(EmailRecipientSchema.safeParse('spaces in@email.com').success).toBe(false);
      expect(EmailRecipientSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ScheduleEmailSchema', () => {
    it('validates a complete and correct scheduling payload', () => {
      const validPayload = {
        senderId: 'sender-123',
        recipient: 'recipient@example.com',
        subject: 'Weekly Newsletter',
        body: '<p>Hello world</p>',
        scheduledTime: new Date(Date.now() + 60000).toISOString(),
        idempotencyKey: 'idemp-xyz-123',
        minDelayMs: 2000,
        hourlyLimit: 100
      };

      const result = ScheduleEmailSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('fails if required fields are missing', () => {
      const missingSender = {
        recipient: 'recipient@example.com',
        subject: 'Test',
        body: 'Body',
        scheduledTime: new Date().toISOString()
      };
      expect(ScheduleEmailSchema.safeParse(missingSender).success).toBe(false);
    });

    it('fails if scheduledTime is not a valid ISO date', () => {
      const invalidDate = {
        senderId: 'sender-123',
        recipient: 'recipient@example.com',
        subject: 'Test',
        body: 'Body',
        scheduledTime: 'tomorrow-afternoon'
      };
      expect(ScheduleEmailSchema.safeParse(invalidDate).success).toBe(false);
    });
  });

  describe('BulkScheduleSchema', () => {
    it('validates a list of recipients with subject and body', () => {
      const validBulk = {
        senderId: 'sender-abc',
        subject: 'Bulk Campaign Announcement',
        body: 'Exclusive preview content',
        recipients: ['user1@test.com', 'user2@test.com'],
        scheduledTime: new Date().toISOString()
      };

      const result = BulkScheduleSchema.safeParse(validBulk);
      expect(result.success).toBe(true);
    });

    it('rejects empty recipient array', () => {
      const emptyRecipients = {
        senderId: 'sender-abc',
        subject: 'Bulk Campaign',
        body: 'Content',
        recipients: [],
        scheduledTime: new Date().toISOString()
      };

      expect(BulkScheduleSchema.safeParse(emptyRecipients).success).toBe(false);
    });
  });

  describe('CreateSenderSchema', () => {
    it('validates new sender profile attributes', () => {
      const valid = {
        email: 'outbox@reachinbox.ai',
        displayName: 'Outbox Notification Bot',
        hourlyLimit: 150
      };

      const result = CreateSenderSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('enforces minimum hourly limit of 1', () => {
      const invalid = {
        email: 'bot@reachinbox.ai',
        displayName: 'Bot',
        hourlyLimit: 0
      };

      expect(CreateSenderSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('SearchEmailSchema', () => {
    it('parses valid query parameters with default pagination', () => {
      const query = {
        q: 'invitation',
        status: EmailStatus.SENT,
        page: '2',
        limit: '15'
      };

      const result = SearchEmailSchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(15);
        expect(result.data.status).toBe(EmailStatus.SENT);
      }
    });
  });
});
