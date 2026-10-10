/**
 * Centralized email service.
 *
 * Uses the configured provider (Resend by default) when configured.
 * Skips delivery during local development when the provider is not configured.
 */

import { Resend } from "resend";
import nodemailer from "nodemailer";
import "../config/env.js";

let resendClient = null;
let resendClientKey = null;
let smtpTransport = null;
let smtpTransportKey = null;

function getEmailProvider() {
  return process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "resend";
}

function getSmtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const portValue = process.env.SMTP_PORT?.trim();
  const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const port = Number(portValue);
  const secure = secureValue === "true";
  const missing = [];

  if (!host) missing.push("SMTP_HOST");
  if (!portValue || !Number.isInteger(port) || port < 1 || port > 65535) {
    missing.push("SMTP_PORT");
  }
  if (secureValue !== "true" && secureValue !== "false") {
    missing.push("SMTP_SECURE");
  }
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASS");
  if (!from) missing.push("EMAIL_FROM");

  const senderMatch = from?.match(
    /^\s*(?:[^<>]*<\s*)?([^<>\s]+@[^<>\s]+)(?:\s*>)?\s*$/,
  );
  if (
    user &&
    from &&
    (!senderMatch || senderMatch[1].toLowerCase() !== user.toLowerCase())
  ) {
    missing.push("EMAIL_FROM matching SMTP_USER");
  }

  return {
    config: { host, port, secure, user, pass, from },
    missing,
  };
}

export function isConfigured() {
  const provider = getEmailProvider();
  if (provider === "resend") {
    return Boolean(
      process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim(),
    );
  }
  return provider === "smtp" && getSmtpConfiguration().missing.length === 0;
}

export function assertProductionEmailConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  const provider = getEmailProvider();
  if (provider === "resend") {
    if (!isConfigured()) {
      throw new Error(
        "Production Resend configuration requires RESEND_API_KEY and EMAIL_FROM.",
      );
    }
    return;
  }

  if (provider === "smtp") {
    const { missing } = getSmtpConfiguration();
    if (missing.length > 0) {
      throw new Error(
        `Production SMTP configuration is invalid. Check: ${missing.join(", ")}.`,
      );
    }
    return;
  }

  throw new Error("EMAIL_PROVIDER must be either resend or smtp.");
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  if (!resendClient || resendClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClient.logError = () => {};
    resendClientKey = apiKey;
  }

  return resendClient;
}

function getSmtpTransport() {
  const { config } = getSmtpConfiguration();
  const transportKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass,
  });

  if (!smtpTransport || smtpTransportKey !== transportKey) {
    smtpTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    smtpTransportKey = transportKey;
  }

  return { transport: smtpTransport, from: config.from };
}

async function deliverEmail({ type, to, subject, text, html }) {
  if (!isConfigured()) {
    const reason = `${getEmailProvider()}_not_configured`;
    if (process.env.NODE_ENV === "production") {
      console.error(`${type} email unavailable: ${reason}`);
    } else {
      console.log(`[Email skipped - ${getEmailProvider()} not configured]`);
    }
    return { sent: false, reason };
  }

  try {
    if (getEmailProvider() === "smtp") {
      const { transport, from } = getSmtpTransport();
      await transport.sendMail({ from, to, subject, text, html });
    } else {
      const { error } = await getResendClient().emails.send({
        from: process.env.EMAIL_FROM.trim(),
        to,
        subject,
        text,
        html,
      });
      if (error) {
        console.error(`${type} email failed: resend_send_failed`);
        return { sent: false, reason: "resend_send_failed" };
      }
    }

    console.log(`${type} email sent`);
    return { sent: true };
  } catch {
    const reason =
      getEmailProvider() === "smtp" ? "smtp_send_failed" : "resend_send_failed";
    console.error(`${type} email failed: ${reason}`);
    return { sent: false, reason };
  }
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
  const safeName = escapeHtml(fullName || "there");
  const safeVerificationUrl = escapeHtml(verificationUrl);

  const subject = "Verify your Healthcare Portal email";

  const text = `Hello ${fullName || "there"},

Email verification is optional. You can sign in before verifying your address.

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
        Email verification is optional. You can sign in before verifying
        your address.
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

  return deliverEmail({ type: "Verification", to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
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

  return deliverEmail({ type: "Password reset", to, subject, text, html });
}

export async function sendPasswordResetConfirmationEmail({ to, fullName }) {
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

  return deliverEmail({
    type: "Password reset confirmation",
    to,
    subject,
    text,
    html,
  });
}

export async function sendReminderEmail(to, subject, message) {
  return deliverEmail({
    type: "Reminder",
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
}

export default {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendReminderEmail,
  isConfigured,
  assertProductionEmailConfiguration,
};
