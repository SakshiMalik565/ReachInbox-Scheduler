import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../repositories/prisma';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token = req.cookies?.auth_session;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication session cookie or Bearer token is required'
    });
    return;
  }

  try {
    const payload = jwt.verify(token, config.SESSION_SECRET) as {
      userId: string;
      email: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User belonging to this session token no longer exists'
      });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session token'
    });
  }
}
