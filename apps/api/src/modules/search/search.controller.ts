import { Request, Response } from 'express';
import { SearchEmailSchema } from '@reachinbox/shared';
import { ElasticsearchService } from '../../services/elasticsearchService';
import { prisma } from '../../repositories/prisma';
import { logger } from '../../utils/logger';

export class SearchController {
  /**
   * Search indexed emails with scoped tenant isolation
   */
  public static async searchEmails(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const validation = SearchEmailSchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.format()
      });
      return;
    }

    const { q, status, senderId, page, limit } = validation.data;

    try {
      // Primary: Elasticsearch search
      const result = await ElasticsearchService.searchEmails({
        userId,
        query: q,
        status,
        senderId,
        page,
        limit
      });

      res.json(result);
    } catch (esErr) {
      logger.warn({ esErr }, 'Elasticsearch search failed; falling back to PostgreSQL database search');

      // Resilient fallback to PostgreSQL
      const skip = (page - 1) * limit;
      const whereClause: any = { userId };

      if (status) {
        whereClause.status = status;
      }
      if (senderId) {
        whereClause.senderId = senderId;
      }
      if (q && q.trim().length > 0) {
        whereClause.OR = [
          { subject: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { recipient: { contains: q, mode: 'insensitive' } }
        ];
      }

      const [emails, total] = await Promise.all([
        prisma.email.findMany({
          where: whereClause,
          include: { sender: true },
          orderBy: { scheduledTime: 'desc' },
          skip,
          take: limit
        }),
        prisma.email.count({ where: whereClause })
      ]);

      res.json({
        data: emails,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        source: 'database_fallback'
      });
    }
  }
}
