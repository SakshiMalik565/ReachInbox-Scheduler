import { z } from 'zod';

export enum EmailStatus {
  SCHEDULED = 'SCHEDULED',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum SlackConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED'
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  googleId: string;
  createdAt: string;
}

export interface SenderDto {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  enabled: boolean;
  hourlyLimit: number;
  createdAt: string;
}

export interface EmailDto {
  id: string;
  userId: string;
  senderId: string;
  sender?: SenderDto;
  recipient: string;
  subject: string;
  body: string;
  scheduledTime: string;
  actualSentTime?: string | null;
  status: EmailStatus;
  idempotencyKey?: string | null;
  bullJobId?: string | null;
  retryCount: number;
  lastError?: string | null;
  etherealPreviewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlackConnectionDto {
  id: string;
  userId: string;
  teamId: string;
  teamName?: string | null;
  channelName?: string | null;
  status: SlackConnectionStatus;
  createdAt: string;
}

export interface QueueStatsDto {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
}

// Zod Schemas

export const EmailRecipientSchema = z
  .string()
  .trim()
  .email('Invalid email address')
  .max(255);

export const ScheduleEmailSchema = z.object({
  senderId: z.string().min(1, 'Sender is required'),
  recipient: EmailRecipientSchema,
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Email body is required'),
  scheduledTime: z.string().datetime({ message: 'Must be an ISO 8601 date string' }).refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, { message: 'Invalid scheduled date' }),
  idempotencyKey: z.string().max(255).optional(),
  minDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
  hourlyLimit: z.coerce.number().int().min(1).max(10000).optional()
});

export type ScheduleEmailInput = z.infer<typeof ScheduleEmailSchema>;

export const BulkScheduleSchema = z.object({
  senderId: z.string().min(1, 'Sender is required'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Email body is required'),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
  scheduledTime: z.string().datetime({ message: 'Must be an ISO 8601 date string' }),
  minDelayMs: z.coerce.number().int().min(0).max(60000).optional(),
  hourlyLimit: z.coerce.number().int().min(1).max(10000).optional()
});

export type BulkScheduleInput = z.infer<typeof BulkScheduleSchema>;

export interface BulkScheduleResult {
  totalSubmitted: number;
  acceptedCount: number;
  rejectedCount: number;
  accepted: EmailDto[];
  rejected: Array<{
    email: string;
    reason: string;
  }>;
}

export const CreateSenderSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  hourlyLimit: z.coerce.number().int().min(1, 'Hourly limit must be at least 1').max(10000, 'Hourly limit max 10000').default(100)
});

export type CreateSenderInput = z.infer<typeof CreateSenderSchema>;

export const SearchEmailSchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(EmailStatus).optional(),
  senderId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type SearchEmailQuery = z.infer<typeof SearchEmailSchema>;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
