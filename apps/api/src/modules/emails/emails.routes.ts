import { Router } from 'express';
import { EmailsController } from './emails.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/schedule', EmailsController.scheduleEmail);
router.post('/schedule/bulk', EmailsController.scheduleBulk);
router.get('/scheduled', EmailsController.getScheduledEmails);
router.get('/sent', EmailsController.getSentEmails);
router.get('/:id', EmailsController.getEmailById);
router.post('/:id/cancel', EmailsController.cancelEmail);

export default router;
