import {
  ScheduleEmailInput,
  BulkScheduleInput,
  BulkScheduleResult,
  CreateSenderInput,
  EmailDto,
  SenderDto,
  PaginatedResult,
  UserDto,
  QueueStatsDto
} from '@reachinbox/shared';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

export class ApiError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers
    }
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(errorMsg, response.status, data?.details);
  }

  return data;
}

export const api = {
  auth: {
    getMe: () => request<{ user: UserDto; slack: { connected: boolean; teamName?: string; channelName?: string } }>('/auth/me'),
    logout: () => request<{ success: boolean; message: string }>('/auth/logout', { method: 'POST' }),
    demoLogin: () => request<{ success: boolean; user: UserDto }>('/auth/demo-session', { method: 'POST' })
  },
  senders: {
    list: () => request<{ data: SenderDto[] }>('/senders'),
    create: (input: CreateSenderInput) =>
      request<{ data: SenderDto }>('/senders', {
        method: 'POST',
        body: JSON.stringify(input)
      })
  },
  emails: {
    schedule: (input: ScheduleEmailInput) =>
      request<{ data: EmailDto; isDuplicate: boolean }>('/emails/schedule', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
    scheduleBulk: (input: BulkScheduleInput) =>
      request<BulkScheduleResult>('/emails/schedule/bulk', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
    getScheduled: (page = 1, limit = 20) =>
      request<PaginatedResult<EmailDto>>(`/emails/scheduled?page=${page}&limit=${limit}`),
    getSent: (page = 1, limit = 20) =>
      request<PaginatedResult<EmailDto>>(`/emails/sent?page=${page}&limit=${limit}`),
    getById: (id: string) => request<{ data: EmailDto }>(`/emails/${id}`),
    cancel: (id: string) =>
      request<{ message: string; data: EmailDto }>(`/emails/${id}/cancel`, {
        method: 'POST'
      })
  },
  search: {
    searchEmails: (params: { q?: string; status?: string; senderId?: string; page?: number; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set('q', params.q);
      if (params.status) searchParams.set('status', params.status);
      if (params.senderId) searchParams.set('senderId', params.senderId);
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());
      return request<PaginatedResult<any>>(`/search/emails?${searchParams.toString()}`);
    }
  },
  slack: {
    disconnect: () =>
      request<{ success: boolean; message: string }>('/slack/connection', {
        method: 'DELETE'
      })
  },
  health: {
    getHealth: () => request<any>('/health'),
    getQueueStats: () => request<{ queue: string; isPaused: boolean; counts: QueueStatsDto }>('/queue/stats')
  }
};
