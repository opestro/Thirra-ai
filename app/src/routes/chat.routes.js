import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { simulateChat } from '../controllers/chat.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

// Back-compat combined endpoint only
router.post('/', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), simulateChat);

export default router;