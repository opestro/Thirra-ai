import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { streamUnifiedChat, streamChat } from '../controllers/unifiedChat.controller.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

// Unified chat endpoint - generates title, summary, and response in one call
router.post('/unified', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), streamUnifiedChat);

// Backward compatible endpoint - uses unified service but with separate title generation
router.post('/compatible', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), streamChat);

export default router;