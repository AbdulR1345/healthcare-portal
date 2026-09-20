import { Router } from 'express';
import {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
} from '../controllers/appointmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', getMyAppointments);
router.post('/', authorize('patient'), bookAppointment);
router.patch('/:id/status', updateAppointmentStatus);
router.patch('/:id/reschedule', authorize('patient', 'admin'), rescheduleAppointment);

export default router;
