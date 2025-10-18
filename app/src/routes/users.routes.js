import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMe, updateMe, updateName, updateInstruction, deleteMe } from '../controllers/users.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/me', getMe);
router.patch('/me', updateMe);
router.patch('/me/name', updateName);
router.patch('/me/instruction', updateInstruction);
router.delete('/me', deleteMe);

export default router;