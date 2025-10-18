import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import { listTurns, getTurn, createTurn, updateTurn, deleteTurn } from '../controllers/turns.controller.js';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

router.get('/', listTurns);
router.get('/:id', getTurn);
router.post(
  '/',
  upload.fields([
    { name: 'user_attachments', maxCount: 10 },
    { name: 'assistant_attachments', maxCount: 10 },
  ]),
  createTurn
);
router.patch(
  '/:id',
  upload.fields([
    { name: 'user_attachments', maxCount: 10 },
    { name: 'assistant_attachments', maxCount: 10 },
  ]),
  updateTurn
);
router.delete('/:id', deleteTurn);

export default router;