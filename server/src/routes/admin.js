import { Router } from 'express';
import { getDashboardStats, getReminders } from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/stats', authenticate, authorize('admin'), getDashboardStats);
router.get('/reminders', authenticate, getReminders);

export default router;
