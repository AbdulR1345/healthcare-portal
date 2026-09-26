import bcrypt from "bcryptjs";
import { validationResult } from "express-validator";
import pool from "../db/pool.js";
import { generateVerificationToken, hashToken } from "../utils/authTokens.js";
import {
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
} from "../services/emailService.js";

const PASSWORD_RESET_TOKEN_TTL_HOURS = 1;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;

const weakPasswords = new Set([
  "password",
  "password123",
  "123456",
  "123456789012",
  "qwerty",
]);

const maxPasswordBytes = 72;

function sanitizedValidationErrors(result) {
  return result.array().map(({ path, msg }) => ({
    path,
    msg,
  }));
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

function isResendCooldownActive(sentAt) {
  if (!sentAt) {
    return false;
  }

  const elapsedSeconds = (Date.now() - new Date(sentAt).getTime()) / 1000;

  return elapsedSeconds < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS;
}

function getResetExpiry() {
  const expiry = new Date();

  expiry.setHours(expiry.getHours() + PASSWORD_RESET_TOKEN_TTL_HOURS);

  return expiry;
}

function getResetUrl(token) {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  return `${clientUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

function isValidResetToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

function validateNewPassword(password, email) {
  if (typeof password !== "string") {
    return "Password must be a string";
  }

  if (password.length < 12) {
    return "Password must be at least 12 characters";
  }

  if (Buffer.byteLength(password, "utf8") > maxPasswordBytes) {
    return "Password must be 72 bytes or fewer";
  }

  if (isWeakPassword(password, email)) {
    return "Password is too easy to guess";
  }

  return null;
}

export async function forgotPassword(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const normalizedEmail = req.body.email.trim().toLowerCase();

  const genericResponse = {
    message:
      "If that email address is registered, a password reset link has been sent.",
  };

  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        full_name,
        email_verified,
        password_reset_sent_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail],
    );

    // Never reveal whether the account exists.
    if (!rows.length) {
      return res.json(genericResponse);
    }

    const user = rows[0];

    // Only verified accounts can reset passwords.
    if (!user.email_verified) {
      return res.json(genericResponse);
    }

    // Prevent repeated reset-email requests.
    if (isResendCooldownActive(user.password_reset_sent_at)) {
      return res.json(genericResponse);
    }

    const resetToken = generateVerificationToken();
    const tokenHash = hashToken(resetToken);
    const expiresAt = getResetExpiry();

    await pool.query(
      `UPDATE users
       SET
         password_reset_token_hash = $1,
         password_reset_expires_at = $2,
         password_reset_sent_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id],
    );

    const resetUrl = getResetUrl(resetToken);

    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      fullName: user.full_name,
      resetUrl,
    });

    if (process.env.NODE_ENV !== "production" && !emailResult.sent) {
      return res.json({
        ...genericResponse,
        resetUrl,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      return res.json({
        ...genericResponse,
        resetUrl,
      });
    }

    return res.json(genericResponse);
  } catch (err) {
    console.error("Forgot password error:", err.code || "unknown");

    return res.status(500).json({
      error: "Unable to process password reset request",
    });
  }
}

export async function resetPassword(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const { token, password, confirmPassword } = req.body;

  if (!isValidResetToken(token)) {
    return res.status(400).json({
      error: "Invalid or expired password reset link",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      error: "Passwords do not match",
    });
  }

  try {
    const tokenHash = hashToken(token);

    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        full_name,
        password_hash,
        password_reset_expires_at
       FROM users
       WHERE password_reset_token_hash = $1
         AND password_reset_expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    if (!rows.length) {
      return res.status(400).json({
        error: "Invalid or expired password reset link",
      });
    }

    const user = rows[0];

    const passwordError = validateNewPassword(password, user.email);

    if (passwordError) {
      return res.status(400).json({
        error: passwordError,
      });
    }

    const samePassword = await bcrypt.compare(password, user.password_hash);

    if (samePassword) {
      return res.status(400).json({
        error: "New password must be different from your current password",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: updatedRows } = await pool.query(
      `UPDATE users
       SET
         password_hash = $1,
         password_reset_token_hash = NULL,
         password_reset_expires_at = NULL,
         password_reset_sent_at = NULL
       WHERE id = $2
         AND password_reset_token_hash = $3
         AND password_reset_expires_at > NOW()
       RETURNING
         id,
         email,
         full_name,
         role`,
      [passwordHash, user.id, tokenHash],
    );

    // This protects against a token being consumed concurrently.
    if (!updatedRows.length) {
      return res.status(400).json({
        error: "Invalid or expired password reset link",
      });
    }

    const updatedUser = updatedRows[0];

    await sendPasswordResetConfirmationEmail({
      to: updatedUser.email,
      fullName: updatedUser.full_name,
    });

    return res.json({
      message:
        "Password reset successfully. Please log in with your new password.",
    });
  } catch (err) {
    console.error("Reset password error:", err.code || "unknown");

    return res.status(500).json({
      error: "Password reset failed",
    });
  }
}

export default {
  forgotPassword,
  resetPassword,
};
