import { Router } from "express";
import { body, checkExact } from "express-validator";
import {
  register,
  login,
  demoLogin,
  verifyEmail,
  devVerifyEmail,
  resendVerificationEmail,
  getProfile,
  refreshAccessToken,
  logout,
} from "../controllers/authController.js";
import {
  forgotPassword,
  resetPassword,
} from "../controllers/passwordResetController.js";
import { authenticate } from "../middleware/auth.js";
import {
  createEmailValidator,
  createPasswordValidator,
  MAX_PASSWORD_BYTES,
} from "../utils/credentialValidation.js";
import { requireTrustedOrigin } from "../middleware/csrfOrigin.js";
import {
  emailVerificationLimiter,
  loginLimiter,
  passwordResetLimiter,
  registrationLimiter,
} from "../middleware/rateLimit.js";

const router = Router();

function hasControlCharacters(value) {
  return /[\u0000-\u001F\u007F-\u009F]/u.test(value);
}

function isDoctor(_value, { req }) {
  return req.body.role === "doctor";
}

const emailValidator = createEmailValidator();
const passwordValidator = createPasswordValidator();

function requireDevelopmentEnvironment(_req, res, next) {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({
      error: "Not found",
    });
  }

  return next();
}

router.post(
  "/register",
  registrationLimiter,
  [
    emailValidator,
    passwordValidator,

    body("role")
      .isIn(["patient", "doctor"])
      .withMessage("Registration is only available for patients and doctors"),

    body("fullName")
      .isString()
      .withMessage("Full name must be a string")
      .bail()
      .trim()
      .notEmpty()
      .withMessage("Full name is required")
      .bail()
      .isLength({ max: 255 })
      .withMessage("Full name must be 255 characters or fewer")
      .bail()
      .custom((fullName) => {
        if (hasControlCharacters(fullName)) {
          throw new Error("Full name contains invalid characters");
        }

        return true;
      }),

    body("phone")
      .optional()
      .isString()
      .withMessage("Phone must be a string")
      .bail()
      .trim()
      .isLength({ max: 20 })
      .withMessage("Phone must be 20 characters or fewer")
      .bail()
      .custom((phone) => {
        if (hasControlCharacters(phone)) {
          throw new Error("Phone contains invalid characters");
        }

        return true;
      }),

    body("specialization")
      .if(isDoctor)
      .isString()
      .withMessage("Specialization must be a string")
      .bail()
      .trim()
      .notEmpty()
      .withMessage("Specialization is required for doctors")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Specialization must be 100 characters or fewer")
      .bail()
      .custom((specialization) => {
        if (hasControlCharacters(specialization)) {
          throw new Error("Specialization contains invalid characters");
        }

        return true;
      }),

    body("location")
      .if(isDoctor)
      .isString()
      .withMessage("Location must be a string")
      .bail()
      .trim()
      .notEmpty()
      .withMessage("Location is required for doctors")
      .bail()
      .isLength({ max: 255 })
      .withMessage("Location must be 255 characters or fewer")
      .bail()
      .custom((location) => {
        if (hasControlCharacters(location)) {
          throw new Error("Location contains invalid characters");
        }

        return true;
      }),

    body("fee")
      .if((value) => value !== undefined && value !== null && value !== "")
      .isFloat({ min: 0, max: 100000 })
      .withMessage("Fee must be a number between 0 and 100000"),
  ],
  register,
);

router.post(
  "/login",
  loginLimiter,
  [
    body("email")
      .isString()
      .withMessage("Email must be a string")
      .bail()
      .trim()
      .isEmail()
      .withMessage("Please provide a valid email")
      .bail()
      .isLength({ max: 254 })
      .withMessage("Email must be 254 characters or fewer")
      .normalizeEmail(),

    body("password")
      .isString()
      .withMessage("Password must be a string")
      .bail()
      .notEmpty()
      .withMessage("Password is required")
      .bail()
      .custom((password) => {
        if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
          throw new Error("Password must be 72 bytes or fewer");
        }

        return true;
      }),
  ],
  login,
);

router.post(
  "/demo-login",
  loginLimiter,
  [
    body("role")
      .isString()
      .withMessage("Role must be a string")
      .bail()
      .trim()
      .toLowerCase()
      .isIn(["patient", "doctor"])
      .withMessage(
        "Demo access is only available for the patient and doctor roles",
      ),
  ],
  demoLogin,
);

router.post(
  "/dev/verify-email",
  requireDevelopmentEnvironment,
  emailVerificationLimiter,
  [checkExact([createEmailValidator()], { locations: ["body"] })],
  devVerifyEmail,
);

router.get("/verify-email", emailVerificationLimiter, verifyEmail);

router.post(
  "/resend-verification",
  emailVerificationLimiter,
  [
    body("email")
      .isString()
      .withMessage("Email must be a string")
      .bail()
      .trim()
      .isEmail()
      .withMessage("Please provide a valid email")
      .bail()
      .isLength({ max: 254 })
      .withMessage("Email must be 254 characters or fewer")
      .normalizeEmail(),
  ],
  resendVerificationEmail,
);

/*
 * Forgot password
 */
router.post(
  "/forgot-password",
  passwordResetLimiter,
  [
    body("email")
      .isString()
      .withMessage("Email must be a string")
      .bail()
      .trim()
      .isEmail()
      .withMessage("Please provide a valid email")
      .bail()
      .isLength({ max: 254 })
      .withMessage("Email must be 254 characters or fewer")
      .normalizeEmail(),
  ],
  forgotPassword,
);

/*
 * Reset password
 */
router.post(
  "/reset-password",
  passwordResetLimiter,
  [
    body("token")
      .isString()
      .withMessage("Reset token must be a string")
      .bail()
      .matches(/^[a-f0-9]{64}$/i)
      .withMessage("Invalid reset token"),

    body("password")
      .isString()
      .withMessage("Password must be a string")
      .bail()
      .isLength({ min: 12 })
      .withMessage("Password must be at least 12 characters")
      .bail()
      .custom((password) => {
        if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
          throw new Error("Password must be 72 bytes or fewer");
        }

        return true;
      }),

    body("confirmPassword")
      .isString()
      .withMessage("Confirm password must be a string")
      .bail()
      .notEmpty()
      .withMessage("Confirm password is required"),
  ],
  resetPassword,
);
router.post("/refresh", requireTrustedOrigin, refreshAccessToken);

router.post("/logout", requireTrustedOrigin, logout);
router.get("/profile", authenticate, getProfile);

export default router;
