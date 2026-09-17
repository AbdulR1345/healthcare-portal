const { getDashboardStats, getReminders } = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = require('express').Router();

router.get('/stats', authenticate, authorize('admin'), getDashboardStats);
router.get('/reminders', authenticate, getReminders);

module.exports = router;
