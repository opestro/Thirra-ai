import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import conversationsRoutes from './conversations.routes.js';
import chatRoutes from './chat.routes.js';
import unifiedChatRoutes from './unifiedChat.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/chat', chatRoutes);
router.use('/unified-chat', unifiedChatRoutes);

export default router;