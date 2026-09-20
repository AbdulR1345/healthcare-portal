import { Router } from 'express';
import { searchDoctors, getDoctorById, getAvailableSlots, aiAssistSearch } from '../controllers/doctorController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, searchDoctors);
router.post('/assist', authenticate, aiAssistSearch);
router.get('/:doctorId/slots', authenticate, getAvailableSlots);
router.get('/:id', authenticate, getDoctorById);

export default router;
