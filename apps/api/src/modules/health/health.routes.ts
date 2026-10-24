import { Router } from 'express';
import { HealthController } from './health.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.get('/health', HealthController.getHealth);
router.get('/queue/stats', requireAuth, HealthController.getQueueStats);

export default router;
