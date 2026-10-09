import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../db/pool.js";
import { storeDocument } from "../services/documentStorage.js";

export const DEMO_ACCOUNTS = [
  {
    email: "demo.patient@healthcare.local",
    password: "DemoPatient123!",
    role: "patient",
    fullName: "Demo Patient",
    phone: "555-0101",
  },
  {
    email: "demo.doctor@healthcare.local",
    password: "DemoDoctor123!",
    role: "doctor",
    fullName: "Demo Doctor",
    phone: "555-0102",
  },
];

const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || "UTC";
const DEMO_PATIENT_EMAIL = DEMO_ACCOUNTS[0].email;
const DEMO_DOCTOR_EMAIL = DEMO_ACCOUNTS[1].email;

class ReservedDemoEmailConflictError extends Error {}

function getClinicDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getClinicDateOffset(offsetDays) {
  const now = new Date();
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CLINIC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value }) => [type, value]),
  );

  const utcBase = Date.UTC(
    Number(nowParts.year),
    Number(nowParts.month) - 1,
    Number(nowParts.day),
  );
  const clinicDate = new Date(utcBase);
  clinicDate.setUTCDate(clinicDate.getUTCDate() + offsetDays);

  return getClinicDateString(clinicDate);
}

function getSafeDemoSummary() {
  return {
    documentType: "Annual health summary",
    keyInfo: [
      "Routine preventive review complete",
      "No urgent issues identified in the synthetic summary",
      "Follow-up appointment scheduled with Demo Doctor",
    ],
    abnormalValues: ["None noted in demo dataset"],
    followUp: "Continue routine care and attend the upcoming visit.",
    disclaimer:
      "This is synthetic demo content created for recruiter review only.",
  };
}

async function findUsersByNormalizedEmail(client, email) {
  const { rows } = await client.query(
    `SELECT id, role, is_demo
     FROM users
     WHERE LOWER(BTRIM(email)) = $1
     FOR UPDATE`,
    [email],
  );

  return rows;
}

function assertDedicatedDemoAccount(user, email) {
  if (user.role === "admin") {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${email} belongs to an admin account; refusing to modify it.`,
    );
  }

  if (!user.is_demo) {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${email} belongs to a non-demo account; refusing to modify it.`,
    );
  }
}

async function ensureDemoUser(client, account) {
  const { email, password, role, fullName, phone } = account;
  const normalizedEmail = email.trim().toLowerCase();
  let existingUsers = await findUsersByNormalizedEmail(client, normalizedEmail);

  if (existingUsers.length > 1) {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${normalizedEmail} matches multiple accounts; refusing to modify them.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;

  if (existingUsers.length === 0) {
    const { rows } = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        role,
        full_name,
        phone,
        email_verified,
        is_demo
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, role, is_demo`,
      [normalizedEmail, passwordHash, role, fullName, phone],
    );
    user = rows[0];

    if (!user) {
      existingUsers = await findUsersByNormalizedEmail(client, normalizedEmail);
      if (existingUsers.length !== 1) {
        throw new Error(
          `Could not safely create the reserved demo account ${normalizedEmail}.`,
        );
      }
    }
  }

  if (!user) {
    const existingUser = existingUsers[0];
    assertDedicatedDemoAccount(existingUser, normalizedEmail);

    const { rows } = await client.query(
      `UPDATE users
       SET password_hash = $1,
           role = $2,
           full_name = $3,
           phone = $4,
           email_verified = TRUE,
           is_demo = TRUE
       WHERE id = $5
         AND is_demo = TRUE
         AND role <> 'admin'
       RETURNING id, email, role, is_demo`,
      [passwordHash, role, fullName, phone, existingUser.id],
    );

    if (!rows[0]) {
      throw new ReservedDemoEmailConflictError(
        `Reserved demo email ${normalizedEmail} could not be safely reconciled.`,
      );
    }

    user = rows[0];
  }

  if (role === "doctor") {
    const { rows: doctorRows } = await client.query(
      `SELECT id
       FROM doctors
       WHERE user_id = $1`,
      [user.id],
    );

    if (doctorRows.length) {
      await client.query(
        `UPDATE doctors
         SET specialization = $2,
             location = $3,
             fee = $4,
             experience_years = $5,
             languages = $6,
             bio = $7,
             rating = 4.8
         WHERE user_id = $1`,
        [
          user.id,
          "General Practice",
          "Remote Demo",
          110,
          12,
          ["English", "Spanish"],
          "Demo doctor profile created for recruiter review and portfolio demos.",
        ],
      );
    } else {
      await client.query(
        `INSERT INTO doctors (
          user_id,
          specialization,
          location,
          fee,
          experience_years,
          languages,
          bio,
          rating
        )
        VALUES ($1, 'General Practice', 'Remote Demo', 110, 12, ARRAY['English', 'Spanish'], 'Demo doctor profile created for recruiter review and portfolio demos.', 4.8)`,
        [user.id],
      );
    }

    const { rows: doctorProfile } = await client.query(
      `SELECT id FROM doctors WHERE user_id = $1`,
      [user.id],
    );
    const doctorId = doctorProfile[0]?.id;

    if (doctorId) {
      for (const dayOfWeek of [1, 2, 3, 4, 5]) {
        const exists = await client.query(
          `SELECT 1 FROM doctor_availability
           WHERE doctor_id = $1 AND day_of_week = $2 AND start_time = '09:00'::time AND end_time = '17:00'::time`,
          [doctorId, dayOfWeek],
        );

        if (!exists.rows.length) {
          await client.query(
            `INSERT INTO doctor_availability (
              doctor_id,
              day_of_week,
              start_time,
              end_time,
              slot_duration_minutes
            ) VALUES ($1, $2, '09:00', '17:00', 30)`,
            [doctorId, dayOfWeek],
          );
        }
      }
    }
  }

  return user;
}

async function ensureDemoAppointments(client, patientUserId, doctorUserId) {
  const { rows: doctorRows } = await client.query(
    `SELECT d.id
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     WHERE u.id = $1`,
    [doctorUserId],
  );

  if (!doctorRows.length) {
    throw new Error("Demo doctor profile is missing.");
  }

  const doctorId = doctorRows[0].id;
  const upcomingDate = getClinicDateOffset(12);
  const historicalDate = getClinicDateOffset(-14);
  const config = [
    {
      date: upcomingDate,
      startTime: "09:30",
      endTime: "10:00",
      status: "scheduled",
      notes: "Demo follow-up visit to review preventive care and next steps.",
    },
    {
      date: historicalDate,
      startTime: "11:00",
      endTime: "11:30",
      status: "completed",
      notes: "Demo annual health review completed successfully.",
    },
  ];

  const appointmentIds = [];

  for (const item of config) {
    const { rows } = await client.query(
      `SELECT id
       FROM appointments
       WHERE patient_id = $1
         AND doctor_id = $2
         AND appointment_date = $3::date
         AND start_time = $4::time`,
      [patientUserId, doctorId, item.date, item.startTime],
    );

    if (rows.length) {
      const appointmentId = rows[0].id;
      await client.query(
        `UPDATE appointments
         SET end_time = $1::time,
             status = $2,
             notes = $3,
             appointment_date = $4::date
         WHERE id = $5`,
        [item.endTime, item.status, item.notes, item.date, appointmentId],
      );
      appointmentIds.push(appointmentId);
      continue;
    }

    const { rows: inserted } = await client.query(
      `INSERT INTO appointments (
         patient_id,
         doctor_id,
         appointment_date,
         start_time,
         end_time,
         status,
         notes
       ) VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7)
       RETURNING id`,
      [
        patientUserId,
        doctorId,
        item.date,
        item.startTime,
        item.endTime,
        item.status,
        item.notes,
      ],
    );
    appointmentIds.push(inserted[0].id);
  }

  return appointmentIds;
}

async function ensureDemoDocument(client, patientUserId, appointmentId) {
  const existing = await client.query(
    `SELECT id, file_url
     FROM documents
     WHERE patient_id = $1
       AND file_name = 'Demo Annual Health Check Summary.pdf'
     ORDER BY uploaded_at DESC
     LIMIT 1`,
    [patientUserId],
  );

  if (existing.rows.length) {
    const fileUrl = existing.rows[0].file_url;
    const match = /^\/uploads\/([^/]+)$/.exec(fileUrl || "");
    if (match && match[1]) {
      return existing.rows[0].id;
    }
  }

  const storageKey = `${randomUUID()}.pdf`;
  const fileUrl = `/uploads/${storageKey}`;
  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 77 >>\nstream\nBT\n/F1 18 Tf\n50 80 Td\n(Demo Annual Health Check Summary) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000125 00000 n\n0000000574 00000 n\n0000000000 00000 n\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n640\n%%EOF\n",
  );

  await storeDocument(storageKey, pdfBuffer, "application/pdf");

  const { rows } = await client.query(
    `INSERT INTO documents (
       patient_id,
       appointment_id,
       file_name,
       file_url,
       file_type,
       ai_summary
     ) VALUES ($1, $2, 'Demo Annual Health Check Summary.pdf', $3, 'application/pdf', $4)
     RETURNING id`,
    [patientUserId, appointmentId, fileUrl, getSafeDemoSummary()],
  );

  return rows[0].id;
}

async function ensureDemoNotifications(client, patientUserId, doctorUserId, appointmentId) {
  const { rows: appointmentRows } = await client.query(
    `SELECT appointment_date::text AS appointment_date, start_time
     FROM appointments
     WHERE id = $1`,
    [appointmentId],
  );
  const appointment = appointmentRows[0];
  const reminderMessage = `Your upcoming appointment with Dr. Demo Doctor is scheduled for ${appointment.appointment_date}.`;

  const { rows: reminderRows } = await client.query(
    `SELECT id FROM reminders WHERE appointment_id = $1 AND user_id = $2 AND message = $3`,
    [appointmentId, patientUserId, reminderMessage],
  );

  if (!reminderRows.length) {
    await client.query(
      `INSERT INTO reminders (
         appointment_id,
         user_id,
         message,
         scheduled_for,
         sent
       ) VALUES ($1, $2, $3, ($4::date + $5::time - INTERVAL '1 day') AT TIME ZONE $6, FALSE)`,
      [
        appointmentId,
        patientUserId,
        reminderMessage,
        appointment.appointment_date,
        appointment.start_time,
        CLINIC_TIME_ZONE,
      ],
    );
  }

  const doctorMessage = `Hello Demo Patient, your appointment is confirmed for ${appointment.appointment_date} at ${appointment.start_time.slice(0, 5)}. Please arrive 10 minutes early.`;
  const patientMessage = "Hello Doctor, I wanted to confirm my upcoming appointment.";

  const messagePairs = [
    { senderId: patientUserId, receiverId: doctorUserId, content: patientMessage, isRead: true },
    { senderId: doctorUserId, receiverId: patientUserId, content: doctorMessage, isRead: false },
    { senderId: patientUserId, receiverId: doctorUserId, content: "Thank you, I’ll arrive early.", isRead: false },
  ];

  for (const message of messagePairs) {
    const { rows } = await client.query(
      `SELECT id
       FROM messages
       WHERE sender_id = $1
         AND receiver_id = $2
         AND appointment_id = $3
         AND content = $4`,
      [message.senderId, message.receiverId, appointmentId, message.content],
    );

    if (!rows.length) {
      await client.query(
        `INSERT INTO messages (
          sender_id,
          receiver_id,
          appointment_id,
          content,
          is_read
        ) VALUES ($1, $2, $3, $4, $5)`,
        [message.senderId, message.receiverId, appointmentId, message.content, message.isRead],
      );
    }
  }
}

async function ensureDemoCareRelationship(client) {
  const patientUser = await client.query(
    `SELECT id FROM users WHERE email = $1 AND is_demo = TRUE`,
    [DEMO_PATIENT_EMAIL],
  );
  const doctorUser = await client.query(
    `SELECT id FROM users WHERE email = $1 AND is_demo = TRUE`,
    [DEMO_DOCTOR_EMAIL],
  );

  if (!patientUser.rows.length || !doctorUser.rows.length) {
    throw new Error("Demo patient and doctor accounts are required.");
  }

  const patientId = patientUser.rows[0].id;
  const doctorId = doctorUser.rows[0].id;
  const appointmentIds = await ensureDemoAppointments(client, patientId, doctorId);
  const upcomingAppointmentId = appointmentIds.find((id) => id);
  const selectedDocumentId = await ensureDemoDocument(
    client,
    patientId,
    upcomingAppointmentId,
  );

  await ensureDemoNotifications(client, patientId, doctorId, upcomingAppointmentId);

  return { patientId, doctorId, selectedDocumentId, upcomingAppointmentId };
}

export async function seedDemoAccounts() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(722026, 2)");

    for (const account of DEMO_ACCOUNTS) {
      await ensureDemoUser(client, account);
    }

    const patient = await client.query(
      `SELECT id FROM users WHERE email = $1 AND is_demo = TRUE LIMIT 1`,
      [DEMO_PATIENT_EMAIL],
    );
    const doctor = await client.query(
      `SELECT id FROM users WHERE email = $1 AND is_demo = TRUE LIMIT 1`,
      [DEMO_DOCTOR_EMAIL],
    );

    if (!patient.rows.length || !doctor.rows.length) {
      throw new Error("Demo patient and doctor accounts were not created.");
    }

    await ensureDemoCareRelationship(client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log("Demo accounts and synthetic healthcare data ensured successfully.");
}

const __filename = fileURLToPath(import.meta.url);
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  try {
    await seedDemoAccounts();
  } catch (error) {
    const message =
      error instanceof ReservedDemoEmailConflictError
        ? error.message
        : error.code || "unexpected error";
    console.error("Demo seed failed:", message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

export { ReservedDemoEmailConflictError };
