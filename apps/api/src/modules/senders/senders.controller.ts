import { Request, Response } from 'express';
import { CreateSenderSchema } from '@reachinbox/shared';
import { prisma } from '../../repositories/prisma';
import { config } from '../../config/env';

export class SendersController {
  /**
   * List all senders configured for the authenticated user
   */
  public static async listSenders(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const senders = await prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        email: true,
        displayName: true,
        enabled: true,
        hourlyLimit: true,
        createdAt: true
      }
    });

    res.json({ data: senders });
  }

  /**
   * Create a new sender for the authenticated user
   */
  public static async createSender(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;
    const validation = CreateSenderSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.format()
      });
      return;
    }

    const { email, displayName, hourlyLimit } = validation.data;

    const existing = await prisma.sender.findUnique({
      where: {
        userId_email: {
          userId,
          email
        }
      }
    });

    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: 'A sender with this email address already exists for your account'
      });
      return;
    }

    const sender = await prisma.sender.create({
      data: {
        userId,
        email,
        displayName,
        hourlyLimit: hourlyLimit || config.MAX_EMAILS_PER_HOUR_PER_SENDER,
        enabled: true
      },
      select: {
        id: true,
        userId: true,
        email: true,
        displayName: true,
        enabled: true,
        hourlyLimit: true,
        createdAt: true
      }
    });

    res.status(201).json({ data: sender });
  }
}
