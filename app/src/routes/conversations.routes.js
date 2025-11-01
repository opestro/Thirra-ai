import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listConverstations,
  Conversationdetails,
} from '../controllers/conversations.controller.js';
import { getTurns } from '../controllers/history.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listConverstations);
router.get('/:id', Conversationdetails);
router.get('/:id/turns', getTurns); // Get turns with tool calls

export default router;