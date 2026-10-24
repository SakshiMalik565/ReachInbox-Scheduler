import { Router } from 'express';
import { SendersController } from './senders.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.use(requireAuth);
router.get('/', SendersController.listSenders);
router.post('/', SendersController.createSender);

export default router;
