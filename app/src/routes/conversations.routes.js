import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listConversations,
  listConversationTitles,
  createConversation,
  getConversation,
  getConversationFull,
  updateConversation,
  deleteConversation,
} from '../controllers/conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listConversations);
router.get('/titles', listConversationTitles);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.get('/:id/full', getConversationFull);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);

export default router;