import { Router } from 'express';
import { handlePosWebhook } from '../controllers/webhookController.js';

const router = Router();

router.post('/pos', handlePosWebhook);

export default router;

