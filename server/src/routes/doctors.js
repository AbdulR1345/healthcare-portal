const { searchDoctors, getDoctorById, getAvailableSlots, aiAssistSearch } = require('../controllers/doctorController');
const { authenticate } = require('../middleware/auth');

const router = require('express').Router();

router.get('/', authenticate, searchDoctors);
router.post('/assist', authenticate, aiAssistSearch);
router.get('/:doctorId/slots', authenticate, getAvailableSlots);
router.get('/:id', authenticate, getDoctorById);

module.exports = router;
