/**
 * Centralized email service.
 *
 * Uses SMTP when configured.
 * Falls back to console logging during local development
 * when SMTP credentials are not configured.
 */

import nodemailer from "nodemailer";

let transporter = null;

export function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isConfigured()) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendVerificationEmail({ to, fullName, verificationUrl }) {
  const transport = getTransporter();

  const safeName = escapeHtml(fullName || "there");
  const safeVerificationUrl = escapeHtml(verificationUrl);

  const subject = "Verify your Healthcare Portal email";

  const text = `Hello ${fullName || "there"},

Please verify your email address to activate your Healthcare Portal account.

Verify your email:
${verificationUrl}

This verification link will expire after a limited period.

If you did not create this account, you can safely ignore this email.

Healthcare Portal`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin-bottom: 16px;">Verify your email</h2>

      <p>Hello ${safeName},</p>

      <p>
        Please verify your email address to activate your
        Healthcare Portal account.
      </p>

      <p style="margin: 28px 0;">
        <a
          href="${safeVerificationUrl}"
          style="
            display: inline-block;
            padding: 12px 20px;
            background: #0d9488;
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          "
        >
          Verify Email
        </a>
      </p>

      <p style="font-size: 14px; color: #475569;">
        This verification link will expire after a limited period.
      </p>

      <p style="font-size: 14px; color: #475569;">
        If you did not create this account, you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />

      <p style="font-size: 12px; color: #64748b;">
        This is an automated email from Healthcare Portal.
      </p>
    </div>
  `;

  if (!transport) {
    console.log(`[Email skipped - SMTP not configured] To: ${to} | ${subject}`);
    console.log(`[Verification URL] ${verificationUrl}`);

    return {
      sent: false,
      reason: "smtp_not_configured",
    };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    console.log(`Verification email sent to ${to}`);

    return {
      sent: true,
    };
  } catch (err) {
    console.error(`Failed to send verification email to ${to}:`, err.message);

    return {
      sent: false,
      reason: err.message,
    };
  }
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const transport = getTransporter();

  const safeName = escapeHtml(fullName || "there");
  const safeResetUrl = escapeHtml(resetUrl);

  const subject = "Reset your Healthcare Portal password";

  const text = `Hello ${fullName || "there"},

We received a request to reset your Healthcare Portal password.

Reset your password:
${resetUrl}

This password reset link will expire after 1 hour and can only be used once.

If you did not request a password reset, you can safely ignore this email.

Healthcare Portal`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin-bottom: 16px;">Reset your password</h2>

      <p>Hello ${safeName},</p>

      <p>
        We received a request to reset your Healthcare Portal password.
      </p>

      <p style="margin: 28px 0;">
        <a
          href="${safeResetUrl}"
          style="
            display: inline-block;
            padding: 12px 20px;
            background: #0d9488;
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          "
        >
          Reset Password
        </a>
      </p>

      <p style="font-size: 14px; color: #475569;">
        This link expires after 1 hour and can only be used once.
      </p>

      <p style="font-size: 14px; color: #475569;">
        If you did not request this password reset, you can safely ignore this email.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />

      <p style="font-size: 12px; color: #64748b;">
        This is an automated email from Healthcare Portal.
      </p>
    </div>
  `;

  if (!transport) {
    console.log(`[Email skipped - SMTP not configured] To: ${to} | ${subject}`);
    console.log(`[Password Reset URL] ${resetUrl}`);

    return {
      sent: false,
      reason: "smtp_not_configured",
    };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    console.log(`Password reset email sent to ${to}`);

    return {
      sent: true,
    };
  } catch (err) {
    console.error(`Failed to send password reset email to ${to}:`, err.message);

    return {
      sent: false,
      reason: err.message,
    };
  }
}

export async function sendPasswordResetConfirmationEmail({ to, fullName }) {
  const transport = getTransporter();

  const safeName = escapeHtml(fullName || "there");

  const subject = "Your Healthcare Portal password was reset";

  const text = `Hello ${fullName || "there"},

Your Healthcare Portal password was successfully reset.

If you did not perform this action, please contact support immediately.

Healthcare Portal`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2>Password reset successful</h2>

      <p>Hello ${safeName},</p>

      <p>
        Your Healthcare Portal password was successfully reset.
      </p>

      <p style="font-size: 14px; color: #475569;">
        If you did not perform this action, please contact support immediately.
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />

      <p style="font-size: 12px; color: #64748b;">
        This is an automated email from Healthcare Portal.
      </p>
    </div>
  `;

  if (!transport) {
    console.log(`[Email skipped - SMTP not configured] To: ${to} | ${subject}`);

    return {
      sent: false,
      reason: "smtp_not_configured",
    };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    console.log(`Password reset confirmation sent to ${to}`);

    return {
      sent: true,
    };
  } catch (err) {
    console.error(
      `Failed to send password reset confirmation to ${to}:`,
      err.message,
    );

    return {
      sent: false,
      reason: err.message,
    };
  }
}

export async function sendReminderEmail(to, subject, message) {
  const transport = getTransporter();

  if (!transport) {
    console.log(
      `[Email skipped - SMTP not configured] To: ${to} | ${subject}: ${message}`,
    );

    return {
      sent: false,
      reason: "smtp_not_configured",
    };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Healthcare Portal Reminder</h2>
          <p>${escapeHtml(message)}</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 1.5rem 0;" />
          <p style="font-size: 12px; color: #64748b;">
            This is an automated reminder from Healthcare Portal.
          </p>
        </div>
      `,
    });

    console.log(`Reminder email sent to ${to}`);

    return {
      sent: true,
    };
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message);

    return {
      sent: false,
      reason: err.message,
    };
  }
}

export default {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendReminderEmail,
  isConfigured,
};
