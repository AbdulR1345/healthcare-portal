import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  verifyEmail,
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

const router = Router();

const maxPasswordBytes = 72;

const weakPasswords = new Set([
  "password",
  "password123",
  "123456",
  "123456789012",
  "qwerty",
]);

function hasControlCharacters(value) {
  return /[\u0000-\u001F\u007F-\u009F]/u.test(value);
}

function isDoctor(_value, { req }) {
  return req.body.role === "doctor";
}

function isWeakPassword(password, email) {
  const normalizedPassword = password.toLowerCase();

  const localPart =
    typeof email === "string" && email.includes("@")
      ? email.split("@")[0].toLowerCase()
      : "";

  const compactPassword = normalizedPassword.replace(/[^\p{L}\p{N}]/gu, "");

  const compactLocalPart = localPart.replace(/[^\p{L}\p{N}]/gu, "");

  return (
    weakPasswords.has(normalizedPassword) ||
    [...password].every((character) => character === password[0]) ||
    normalizedPassword === localPart ||
    (compactPassword.length > 0 && compactPassword === compactLocalPart)
  );
}

const emailValidator = body("email")
  .isString()
  .withMessage("Email must be a string")
  .bail()
  .trim()
  .isEmail()
  .withMessage("Please provide a valid email")
  .bail()
  .isLength({ max: 254 })
  .withMessage("Email must be 254 characters or fewer")
  .normalizeEmail();

const passwordValidator = body("password")
  .isString()
  .withMessage("Password must be a string")
  .bail()
  .isLength({ min: 12 })
  .withMessage("Password must be at least 12 characters")
  .bail()
  .custom((password, { req }) => {
    if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
      throw new Error("Password must be 72 bytes or fewer");
    }

    if (isWeakPassword(password, req.body.email)) {
      throw new Error("Password is too easy to guess");
    }

    return true;
  });

router.post(
  "/register",
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
        if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
          throw new Error("Password must be 72 bytes or fewer");
        }

        return true;
      }),
  ],
  login,
);

router.get("/verify-email", verifyEmail);

router.post(
  "/resend-verification",
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
        if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
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
router.post("/refresh", refreshAccessToken);

router.post("/logout", logout);
router.get("/profile", authenticate, getProfile);

export default router;
