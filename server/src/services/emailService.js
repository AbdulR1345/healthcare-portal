/**
 * Optional email service for appointment reminders.
 * Falls back to console logging when SMTP is not configured.
 */

let transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendReminderEmail(to, subject, message) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[Email skipped - SMTP not configured] To: ${to} | ${subject}: ${message}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: message,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Healthcare Portal Reminder</h2>
          <p>${message}</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 1.5rem 0;" />
          <p style="font-size: 12px; color: #64748b;">
            This is an automated reminder from Healthcare Portal.
          </p>
        </div>
      `,
    });
    console.log(`Reminder email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendReminderEmail, isConfigured };
