import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
let testPool;

export function getTestPool() {
  if (!testPool) {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        "TEST_DATABASE_URL is required for integration fixtures.",
      );
    }
    testPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  }
  return testPool;
}

export async function closeTestPool() {
  if (testPool) {
    await testPool.end();
    testPool = undefined;
  }
}

export async function createFixture(t) {
  const userIds = [];
  t.after(async () => {
    if (userIds.length) {
      await getTestPool().query(
        "DELETE FROM users WHERE id = ANY($1::uuid[])",
        [userIds],
      );
    }
  });

  async function createUser(role = "patient", options = {}) {
    const password = options.password || "Fixture-Password!7284";
    const email =
      options.email || `test-${crypto.randomUUID()}@example.invalid`;
    const passwordHash = await bcrypt.hash(password, 4);
    const { rows } = await getTestPool().query(
      `INSERT INTO users (email, password_hash, role, full_name, email_verified)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, role, full_name, email_verified`,
      [
        email,
        passwordHash,
        role,
        options.fullName || `Test ${role}`,
        options.emailVerified ?? true,
      ],
    );
    const user = { ...rows[0], password };
    userIds.push(user.id);
    return user;
  }

  async function createDoctor(options = {}) {
    const user = await createUser("doctor", options);
    const { rows } = await getTestPool().query(
      `INSERT INTO doctors (user_id, specialization, location, fee)
       VALUES ($1, 'Family Medicine', 'Test Clinic', 50)
       RETURNING id`,
      [user.id],
    );
    const doctorId = rows[0].id;
    await getTestPool().query(
      `INSERT INTO doctor_availability
         (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
       VALUES ($1, $2, $3::time, $4::time, $5)`,
      [
        doctorId,
        options.dayOfWeek ?? 1,
        options.startTime ?? "09:00",
        options.endTime ?? "11:00",
        options.slotDurationMinutes ?? 30,
      ],
    );
    return { ...user, doctorId };
  }

  async function createAppointment({
    patientId,
    doctorId,
    date,
    startTime = "09:00",
    endTime = "09:30",
    status = "scheduled",
  }) {
    const { rows } = await getTestPool().query(
      `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, start_time, end_time, status)
       VALUES ($1, $2, $3, $4::time, $5::time, $6)
       RETURNING id, patient_id, doctor_id, appointment_date::text AS appointment_date,
                 start_time::text AS start_time, end_time::text AS end_time, status`,
      [patientId, doctorId, date, startTime, endTime, status],
    );
    return rows[0];
  }

  function trackUser(userId) {
    if (!userIds.includes(userId)) userIds.push(userId);
  }

  return { createUser, createDoctor, createAppointment, trackUser };
}

export function futureDateForWeekday(dayOfWeek, daysAhead = 14) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysAhead);
  while (date.getUTCDay() !== dayOfWeek) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
