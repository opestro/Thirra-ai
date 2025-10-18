import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { simulateChat, startChat, appendChat } from '../controllers/chat.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

// Separate endpoints
//router.post('/start', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), startChat);
//router.post('/append', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), appendChat);

// Back-compat combined endpoint
router.post('/', upload.fields([{ name: 'user_attachments', maxCount: 10 }]), simulateChat);

export default router;