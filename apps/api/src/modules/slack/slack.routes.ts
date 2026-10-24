import { Router } from 'express';
import { SlackController } from './slack.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.get('/connect', requireAuth, SlackController.connectSlack);
router.get('/callback', SlackController.slackCallback);
router.delete('/connection', requireAuth, SlackController.disconnectSlack);

export default router;
