import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import pool from "../db/pool.js";
import { generateVerificationToken, hashToken } from "../utils/authTokens.js";
import { sendVerificationEmail } from "../services/emailService.js";
import {
  createSession,
  rotateSession,
  revokeSession,
} from "../services/sessionService.js";
const VERIFICATION_TOKEN_TTL_HOURS = 24;
const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;

function sanitizedValidationErrors(result) {
  return result.array().map(({ path, msg }) => ({
    path,
    msg,
  }));
}

function isDemoModeEnabled() {
  return (process.env.DEMO_MODE_ENABLED ?? "false").trim().toLowerCase() === "true";
}

function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      is_demo: Boolean(user.is_demo),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    },
  );
}
function getVerificationExpiry() {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + VERIFICATION_TOKEN_TTL_HOURS);
  return expiry;
}

function getClientBaseUrl() {
  const configured = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    try {
      return new URL(configured[0]).origin;
    } catch {
      return configured[0].replace(/\/+$/, "");
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  throw new Error("CLIENT_URL must be configured in production.");
}

function getVerificationUrl(token) {
  return `${getClientBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function isValidVerificationToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

function isResendCooldownActive(sentAt) {
  if (!sentAt) {
    return false;
  }

  const elapsedSeconds = (Date.now() - new Date(sentAt).getTime()) / 1000;

  return elapsedSeconds < VERIFICATION_RESEND_COOLDOWN_SECONDS;
}

async function createAndSendVerificationEmail({ userId, email, fullName }) {
  const verificationToken = generateVerificationToken();
  const tokenHash = hashToken(verificationToken);
  const expiresAt = getVerificationExpiry();

  await pool.query(
    `UPDATE users
     SET
       email_verification_token_hash = $1,
       email_verification_expires_at = $2,
       email_verification_sent_at = NOW()
     WHERE id = $3
       AND email_verified = FALSE`,
    [tokenHash, expiresAt, userId],
  );

  const verificationUrl = getVerificationUrl(verificationToken);

  const emailResult = await sendVerificationEmail({
    to: email,
    fullName,
    verificationUrl,
  });

  return {
    emailResult,
    verificationUrl,
  };
}

async function verifyEmailToken(token, queryable = pool) {
  const tokenHash = hashToken(token);
  const { rows } = await queryable.query(
    `SELECT
      id,
      email,
      role,
      full_name,
      phone,
      email_verified
     FROM users
     WHERE email_verification_token_hash = $1
       AND email_verification_expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  if (!rows.length) {
    return { status: "invalid" };
  }

  const user = rows[0];

  if (user.email_verified) {
    return { status: "already-verified" };
  }

  const { rows: updatedRows } = await queryable.query(
    `UPDATE users
     SET
       email_verified = TRUE,
       email_verification_token_hash = NULL,
       email_verification_expires_at = NULL,
       email_verification_sent_at = NULL
     WHERE id = $1
       AND email_verified = FALSE
     RETURNING
       id,
       email,
       role,
       full_name,
       phone,
       email_verified`,
    [user.id],
  );

  if (!updatedRows.length) {
    return { status: "already-verified" };
  }

  return { status: "verified", user: updatedRows[0] };
}

export async function register(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const {
    email,
    password,
    role,
    fullName,
    phone,
    specialization,
    location,
    fee,
  } = req.body;

  const normalizedEmail = email.trim().toLowerCase();

  // Defense in depth:
  // Public registration must never create admin accounts.
  if (!["patient", "doctor"].includes(role)) {
    return res.status(403).json({
      error: "Invalid registration role",
    });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    if (existing.rows.length) {
      return res.status(409).json({
        error: "Email already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const verificationToken = generateVerificationToken();
    const verificationTokenHash = hashToken(verificationToken);
    const verificationExpiresAt = getVerificationExpiry();

    const client = await pool.connect();

    let user;

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO users (
          email,
          password_hash,
          role,
          full_name,
          phone,
          email_verified,
          email_verification_token_hash,
          email_verification_expires_at,
          email_verification_sent_at
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, NULL)
        RETURNING
          id,
          email,
          role,
          full_name,
          phone,
          email_verified`,
        [
          normalizedEmail,
          passwordHash,
          role,
          fullName,
          phone || null,
          verificationTokenHash,
          verificationExpiresAt,
        ],
      );

      user = rows[0];

      if (role === "doctor") {
        await client.query(
          `INSERT INTO doctors (
            user_id,
            specialization,
            location,
            fee
          )
          VALUES ($1, $2, $3, $4)`,
          [user.id, specialization, location, fee ?? 100],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const verificationUrl = getVerificationUrl(verificationToken);

    const response = {
      message: "Registration successful. You can log in now.",
      user,
      verificationRequired: false,
      emailSent: false,
    };

    // Only expose the local development URL.
    // Never expose verification tokens in production responses.
    if (process.env.NODE_ENV !== "production") {
      response.verificationUrl = verificationUrl;
    }

    return res.status(201).json(response);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Email already registered",
      });
    }

    console.error("Register error:", err.code || "unknown");

    return res.status(500).json({
      error: "Registration failed",
    });
  }
}

export async function demoLogin(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  if (!isDemoModeEnabled()) {
    return res.status(403).json({
      error: "Demo access is disabled on this deployment.",
    });
  }

  const { role } = req.body;
  const allowedRole = typeof role === "string" ? role.trim().toLowerCase() : "";

  if (!['patient', 'doctor'].includes(allowedRole)) {
    return res.status(400).json({
      error: "Demo access is only available for the patient and doctor roles.",
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        password_hash,
        role,
        full_name,
        phone,
        email_verified,
        is_demo
       FROM users
       WHERE role = $1
         AND is_demo = TRUE
       ORDER BY email ASC
       LIMIT 1`,
      [allowedRole],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Demo account is unavailable.",
      });
    }

    const user = rows[0];

    delete user.password_hash;

    const accessToken = signAccessToken(user);

    const { refreshToken, session } = await createSession({
      userId: user.id,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      user,
      token: accessToken,
      expiresIn: "15m",
      session: {
        id: session.id,
        expiresAt: session.expires_at,
      },
      demo: true,
    });
  } catch (err) {
    console.error("Demo login error:", err.code || "unknown");

    return res.status(500).json({
      error: "Demo login failed",
    });
  }
}

export async function login(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        password_hash,
        role,
        full_name,
        phone,
        email_verified,
        is_demo
       FROM users
       WHERE email = $1`,
      [normalizedEmail],
    );

    if (!rows.length) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    if (user.is_demo && !isDemoModeEnabled()) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    delete user.password_hash;

    const accessToken = signAccessToken(user);

    const { refreshToken, session } = await createSession({
      userId: user.id,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      user,
      token: accessToken,
      expiresIn: "15m",
      session: {
        id: session.id,
        expiresAt: session.expires_at,
      },
    });
  } catch (err) {
    console.error("Login error:", err.code || "unknown");

    return res.status(500).json({
      error: "Login failed",
    });
  }
}

export async function verifyEmail(req, res) {
  const { token } = req.query;

  if (!isValidVerificationToken(token)) {
    return res.status(400).json({
      error: "Invalid or expired verification link",
    });
  }

  try {
    const result = await verifyEmailToken(token);

    if (result.status === "already-verified") {
      return res.status(400).json({
        error: "Email is already verified",
      });
    }

    if (result.status === "invalid") {
      return res.status(400).json({
        error: "Invalid or expired verification link",
      });
    }

    return res.json({
      message: "Email verified successfully. You can now log in.",
      user: result.user,
    });
  } catch (err) {
    console.error("Email verification error:", err.code || "unknown");

    return res.status(500).json({
      error: "Email verification failed",
    });
  }
}

export async function devVerifyEmail(req, res) {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({
      error: "Not found",
    });
  }

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const normalizedEmail = req.body.email.trim().toLowerCase();
  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, email_verified
         FROM users
         WHERE email = $1
         LIMIT 1
         FOR UPDATE`,
        [normalizedEmail],
      );

      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (rows[0].email_verified) {
        await client.query("COMMIT");
        return res.json({
          message: "Email is already verified.",
        });
      }

      const verificationToken = generateVerificationToken();
      await client.query(
        `UPDATE users
         SET
           email_verification_token_hash = $1,
           email_verification_expires_at = $2
         WHERE id = $3
           AND email_verified = FALSE`,
        [
          hashToken(verificationToken),
          getVerificationExpiry(),
          rows[0].id,
        ],
      );

      const result = await verifyEmailToken(verificationToken, client);

      if (result.status !== "verified") {
        throw new Error("Development email verification did not complete.");
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      message: "Email verified successfully.",
    });
  } catch (err) {
    console.error(
      "Development email verification error:",
      err.code || "unknown",
    );

    return res.status(500).json({
      error: "Unable to verify email",
    });
  }
}

export async function resendVerificationEmail(req, res) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: sanitizedValidationErrors(errors),
    });
  }

  const normalizedEmail = req.body.email.trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        full_name,
        email_verified,
        email_verification_sent_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normalizedEmail],
    );

    // Same response whether the account exists or not.
    if (!rows.length || rows[0].email_verified) {
      return res.json({
        message:
          "If the account exists and requires verification, a verification email has been sent.",
      });
    }

    const user = rows[0];

    if (isResendCooldownActive(user.email_verification_sent_at)) {
      return res.json({
        message:
          "If the account exists and requires verification, a verification email has been sent.",
      });
    }

    const { verificationUrl } = await createAndSendVerificationEmail({
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
    });

    const response = {
      message:
        "If the account exists and requires verification, a verification email has been sent.",
    };

    if (process.env.NODE_ENV !== "production") {
      response.verificationUrl = verificationUrl;
    }

    return res.json(response);
  } catch (err) {
    console.error("Resend verification error:", err.code || "unknown");

    return res.status(500).json({
      error: "Unable to process verification email request",
    });
  }
}

export async function getProfile(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        role,
        full_name,
        phone,
        email_verified,
        created_at
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const profile = rows[0];

    if (profile.role === "doctor") {
      const { rows: docRows } = await pool.query(
        "SELECT * FROM doctors WHERE user_id = $1",
        [req.user.id],
      );

      profile.doctor = docRows[0] || null;
    }

    return res.json(profile);
  } catch (err) {
    console.error("Profile error:", err.code || "unknown");

    return res.status(500).json({
      error: "Failed to fetch profile",
    });
  }
}

export async function refreshAccessToken(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      error: "Refresh token required",
    });
  }

  try {
    const rotated = await rotateSession({
      refreshToken,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    });

    if (!rotated) {
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/auth",
      });

      return res.status(401).json({
        error: "Invalid or expired refresh session",
      });
    }

    const { rows } = await pool.query(
      `SELECT
        id,
        email,
        role,
        full_name,
        phone,
        email_verified
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [rotated.userId],
    );

    if (!rows.length) {
      await revokeSession(rotated.refreshToken);

      return res.status(401).json({
        error: "Unable to refresh session",
      });
    }

    const user = rows[0];

    const accessToken = signAccessToken(user);

    res.cookie("refreshToken", rotated.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      token: accessToken,
      expiresIn: "15m",
    });
  } catch (err) {
    console.error("Refresh token error:", err.code || "unknown");

    return res.status(500).json({
      error: "Unable to refresh session",
    });
  }
}

export async function logout(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    try {
      await revokeSession(refreshToken);
    } catch (err) {
      console.error("Logout session revocation error:", err.code || "unknown");
    }
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/auth",
  });

  return res.json({
    message: "Logged out successfully",
  });
}

export default {
  register,
  login,
  verifyEmail,
  devVerifyEmail,
  resendVerificationEmail,
  getProfile,
  refreshAccessToken,
  logout,
};
