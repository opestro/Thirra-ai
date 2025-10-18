import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import conversationsRoutes from './conversations.routes.js';
import turnsRoutes from './turns.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/conversations/:conversationId/turns', turnsRoutes);

export default router;