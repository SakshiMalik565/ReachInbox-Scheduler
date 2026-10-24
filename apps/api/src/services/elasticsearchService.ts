import { Client } from '@elastic/elasticsearch';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface EmailSearchDoc {
  id: string;
  userId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledTime: string;
  sentTime?: string | null;
  createdAt: string;
}

export class ElasticsearchService {
  private static client: Client | null = null;
  public static readonly INDEX_NAME = 'reachinbox_emails';

  public static getClient(): Client {
    if (!this.client) {
      const auth =
        config.ELASTICSEARCH_USERNAME && config.ELASTICSEARCH_PASSWORD
          ? {
              username: config.ELASTICSEARCH_USERNAME,
              password: config.ELASTICSEARCH_PASSWORD
            }
          : undefined;

      this.client = new Client({
        node: config.ELASTICSEARCH_URL,
        auth
      });
    }
    return this.client;
  }

  /**
   * Initializes the Elasticsearch index with strict mappings.
   */
  public static async initIndex(): Promise<void> {
    try {
      const client = this.getClient();
      const indexExists = await client.indices.exists({ index: this.INDEX_NAME });

      if (!indexExists) {
        logger.info(`Creating Elasticsearch index: ${this.INDEX_NAME}`);
        await client.indices.create({
          index: this.INDEX_NAME,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              senderName: { type: 'text' },
              recipient: { type: 'keyword', fields: { text: { type: 'text' } } },
              subject: { type: 'text', analyzer: 'standard' },
              body: { type: 'text', analyzer: 'standard' },
              status: { type: 'keyword' },
              scheduledTime: { type: 'date' },
              sentTime: { type: 'date' },
              createdAt: { type: 'date' }
            }
          }
        });
        logger.info(`Elasticsearch index ${this.INDEX_NAME} created successfully`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'Elasticsearch index init warning (ES may be offline or initializing)');
    }
  }

  /**
   * Index or update an email document in Elasticsearch.
   */
  public static async indexEmail(doc: EmailSearchDoc): Promise<void> {
    try {
      const client = this.getClient();
      await client.index({
        index: this.INDEX_NAME,
        id: doc.id,
        document: doc,
        refresh: true
      });
      logger.debug({ emailId: doc.id }, 'Indexed email in Elasticsearch');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, emailId: doc.id }, 'Failed to index email in Elasticsearch');
    }
  }

  /**
   * Update email status in Elasticsearch.
   */
  public static async updateEmailStatus(
    emailId: string,
    status: string,
    sentTime?: string | null
  ): Promise<void> {
    try {
      const client = this.getClient();
      await client.update({
        index: this.INDEX_NAME,
        id: emailId,
        doc: {
          status,
          ...(sentTime ? { sentTime } : {})
        },
        refresh: true
      });
      logger.debug({ emailId, status }, 'Updated email status in Elasticsearch');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, emailId }, 'Failed to update email in Elasticsearch');
    }
  }

  /**
   * Search emails for an authenticated user with query, status filtering, and pagination.
   */
  public static async searchEmails(params: {
    userId: string;
    query?: string;
    status?: string;
    senderId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: EmailSearchDoc[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const from = (page - 1) * limit;

    const filterClauses: Record<string, unknown>[] = [
      { term: { userId: params.userId } }
    ];

    if (params.status) {
      filterClauses.push({ term: { status: params.status } });
    }
    if (params.senderId) {
      filterClauses.push({ term: { senderId: params.senderId } });
    }

    let queryClause: Record<string, unknown> = { match_all: {} };

    if (params.query && params.query.trim().length > 0) {
      queryClause = {
        multi_match: {
          query: params.query.trim(),
          fields: ['subject^3', 'recipient^2', 'senderEmail', 'senderName', 'body'],
          fuzziness: 'AUTO'
        }
      };
    }

    try {
      const client = this.getClient();
      const response = await client.search<EmailSearchDoc>({
        index: this.INDEX_NAME,
        from,
        size: limit,
        query: {
          bool: {
            must: [queryClause],
            filter: filterClauses
          }
        },
        sort: [{ scheduledTime: { order: 'desc' } }]
      });

      const totalHits =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const data = response.hits.hits.map((hit) => hit._source as EmailSearchDoc);

      return {
        data,
        total: totalHits,
        page,
        limit,
        totalPages: Math.ceil(totalHits / limit) || 1
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, 'Elasticsearch search failed; falling back to empty set or DB search');
      throw err;
    }
  }
}
