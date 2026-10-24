import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../src/middleware/auth';
import { config } from '../src/config/env';
import { prisma } from '../src/repositories/prisma';

describe('Authentication Middleware Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when neither session cookie nor authorization header is supplied', async () => {
    const req: any = { cookies: {}, headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when session token is invalid or forged', async () => {
    const req: any = { cookies: { auth_session: 'invalid-jwt-token-string' }, headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches authenticated user to request and calls next() when valid token is provided', async () => {
    const mockUser = {
      id: 'user-uuid-123',
      email: 'user@reachinbox.ai',
      name: 'John Doe'
    };

    const validToken = jwt.sign(
      { userId: mockUser.id, email: mockUser.email },
      config.SESSION_SECRET,
      { expiresIn: '1h' }
    );

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);

    const req: any = { cookies: { auth_session: validToken }, headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(mockUser);
  });
});
