import { Router } from 'express';
import { handleNanobananaWebhook, queryImageStatus } from '../controllers/webhooks.controller.js';

const router = Router();

// Nanobanana image generation webhook
router.post('/nanobanana', handleNanobananaWebhook);

// Manual status query
router.get('/nanobanana/status/:taskId', queryImageStatus);

export default router;

