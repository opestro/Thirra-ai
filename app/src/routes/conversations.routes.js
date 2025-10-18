import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listConverstations,
  Conversationdetails,
} from '../controllers/conversations.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listConverstations);
router.get('/:id', Conversationdetails);

export default router;