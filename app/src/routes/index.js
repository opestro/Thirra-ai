import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import conversationsRoutes from './conversations.routes.js';
import turnsRoutes from './turns.routes.js';
import chatRoutes from './chat.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/conversations/:conversationId/turns', turnsRoutes);
router.use('/chat', chatRoutes);

export default router;