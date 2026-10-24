import jwt from 'jsonwebtoken';
import { prisma } from '../repositories/prisma';
import { config } from '../config/env';
import { logger } from '../utils/logger';

async function seed() {
  logger.info('Seeding demonstration user, senders, and testing dataset...');

  // 1. Create or update Demo User
  const user = await prisma.user.upsert({
    where: { email: 'demo@reachinbox.ai' },
    create: {
      googleId: 'google-demo-1001',
      email: 'demo@reachinbox.ai',
      name: 'ReachInbox Demo Evaluator',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    },
    update: {
      name: 'ReachInbox Demo Evaluator'
    }
  });

  // 2. Create Demo Sender with low limit (5/hr) to easily demonstrate rate limiting
  const sender = await prisma.sender.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: 'sales-demo@reachinbox.ai'
      }
    },
    create: {
      userId: user.id,
      email: 'sales-demo@reachinbox.ai',
      displayName: 'ReachInbox Growth Team',
      hourlyLimit: 5, // Set to 5 so sending 6 emails immediately demonstrates rate limit deferral & Slack alert!
      enabled: true
    },
    update: {
      hourlyLimit: 5
    }
  });

  // 3. Generate a pre-signed 7-day authentication cookie for local evaluation
  const sessionToken = jwt.sign(
    { userId: user.id, email: user.email },
    config.SESSION_SECRET,
    { expiresIn: '7d' }
  );

  logger.info('================================================================');
  logger.info('DEMO SEEDING COMPLETED SUCCESSFULLY');
  logger.info(`User ID: ${user.id} (${user.email})`);
  logger.info(`Sender ID: ${sender.id} (${sender.email}) - Hourly Limit: ${sender.hourlyLimit}`);
  logger.info('Generated Evaluation JWT Session Cookie (auth_session):');
  logger.info(sessionToken);
  logger.info('You can paste this in DevTools -> Application -> Cookies -> auth_session');
  logger.info('================================================================');

  await prisma.$disconnect();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
