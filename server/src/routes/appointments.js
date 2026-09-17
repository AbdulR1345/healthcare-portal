const {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
} = require('../controllers/appointmentController');
const { authenticate, authorize } = require('../middleware/auth');

const router = require('express').Router();

router.use(authenticate);

router.get('/', getMyAppointments);
router.post('/', authorize('patient'), bookAppointment);
router.patch('/:id/status', updateAppointmentStatus);
router.patch('/:id/reschedule', authorize('patient', 'admin'), rescheduleAppointment);

module.exports = router;
