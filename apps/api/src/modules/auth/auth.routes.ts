import { Router } from 'express';
import { AuthController } from './auth.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.get('/google', AuthController.googleLogin);
router.get('/google/callback', AuthController.googleCallback);
router.post('/demo-session', AuthController.devLogin);
router.get('/me', requireAuth, AuthController.getMe);
router.post('/logout', AuthController.logout);

export default router;
