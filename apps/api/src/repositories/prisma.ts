import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' }
    ]
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Log prisma error events
// @ts-expect-error prisma events
prisma.$on('error', (e: unknown) => {
  logger.error({ err: e }, 'Prisma error');
});
