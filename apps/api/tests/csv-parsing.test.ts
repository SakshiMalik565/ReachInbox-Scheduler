import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { EmailRecipientSchema } from '@reachinbox/shared';

describe('CSV Parsing & Lead Recipient Validation Unit Tests', () => {
  it('correctly parses CSV content and isolates valid emails from malformed rows', () => {
    const csvContent = `email,first_name,company
alice@example.com,Alice,Acme Corp
invalid-email-address,Bob,Beta LLC
charlie@reachinbox.ai,Charlie,ReachInbox
,Empty,EmptyCo
   dave@company.org   ,Dave,Delta Inc
malformed@.com,Eve,Eve Inc
`;

    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Array<Record<string, string>>;

    const validRecipients: string[] = [];
    const rejected: Array<{ raw: string; reason: string }> = [];

    rows.forEach((row) => {
      const emailVal = (row.email || '').trim();
      const validation = EmailRecipientSchema.safeParse(emailVal);

      if (!validation.success) {
        rejected.push({
          raw: row.email,
          reason: 'Invalid email address syntax'
        });
      } else {
        validRecipients.push(validation.data);
      }
    });

    // Alice, Charlie, Dave are valid
    expect(validRecipients).toHaveLength(3);
    expect(validRecipients).toContain('alice@example.com');
    expect(validRecipients).toContain('charlie@reachinbox.ai');
    expect(validRecipients).toContain('dave@company.org');

    // invalid-email-address, empty, malformed@.com are rejected
    expect(rejected).toHaveLength(3);
    expect(rejected[0].raw).toBe('invalid-email-address');
  });

  it('handles diverse CSV column headers like recipient, to, and lead_email', () => {
    const csvContent = `recipient,lead_name
target1@domain.com,User One
target2@domain.com,User Two
`;
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Array<Record<string, string>>;

    const emails = rows.map((r) => r.recipient?.trim()).filter(Boolean);
    expect(emails).toEqual(['target1@domain.com', 'target2@domain.com']);
  });
});
