import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElasticsearchService } from '../src/services/elasticsearchService';

describe('Elasticsearch Query Scoping & Authorization Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('strictly enforces userId tenant filter in search query payload to prevent data leakage', async () => {
    const searchMock = vi.fn().mockResolvedValue({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _source: {
              id: 'email-123',
              userId: 'tenant-user-A',
              subject: 'Confidential Proposal',
              recipient: 'client@example.com'
            }
          }
        ]
      }
    });

    vi.spyOn(ElasticsearchService, 'getClient').mockReturnValue({
      search: searchMock
    } as any);

    const result = await ElasticsearchService.searchEmails({
      userId: 'tenant-user-A',
      query: 'Proposal',
      status: 'SENT',
      page: 1,
      limit: 10
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('email-123');

    // Inspect the actual Elasticsearch query structure passed to client.search
    expect(searchMock).toHaveBeenCalledTimes(1);
    const searchArg = searchMock.mock.calls[0][0];

    const filterClauses = searchArg.query.bool.filter;
    // Verify userId filter exists in filterClauses
    const userIdFilter = filterClauses.find((c: any) => c.term && c.term.userId);
    expect(userIdFilter).toBeDefined();
    expect(userIdFilter.term.userId).toBe('tenant-user-A');

    // Verify status filter exists
    const statusFilter = filterClauses.find((c: any) => c.term && c.term.status);
    expect(statusFilter).toBeDefined();
    expect(statusFilter.term.status).toBe('SENT');
  });
});
