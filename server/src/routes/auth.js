import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, getProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post(
  '/register',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),

    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),

    // Public registration can only create patient or doctor accounts.
    // Admin accounts must be created through a protected administrative process.
    body('role')
      .isIn(['patient', 'doctor'])
      .withMessage('Registration is only available for patients and doctors'),

    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),

    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],
  login
);

router.get('/profile', authenticate, getProfile);

export default router;