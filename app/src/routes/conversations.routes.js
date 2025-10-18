import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
} from '../controllers/conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);

export default router;