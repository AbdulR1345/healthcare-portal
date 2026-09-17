const { body } = require('express-validator');
const { register, login, getProfile } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = require('express').Router();

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['patient', 'doctor', 'admin']),
    body('fullName').trim().notEmpty(),
  ],
  register
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  login
);

router.get('/profile', authenticate, getProfile);

module.exports = router;
