import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMe, updateMe, deleteMe, changePassword } from '../controllers/users.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/me', getMe);
router.patch('/me', updateMe);
router.patch('/me/password', changePassword);
router.delete('/me', deleteMe);

export default router;