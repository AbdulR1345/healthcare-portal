import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getTestPool } from "./support/db.js";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "../src/scripts/demoSeed.js";

before(async () => {
  await seedDemoAccounts();
});

after(async () => {
  await seedDemoAccounts();
});

async function getUser(email) {
  const { rows } = await getTestPool().query(
    `SELECT id, email, role, full_name, is_demo
     FROM users
     WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

async function getDoctorProfile(userId) {
  const { rows } = await getTestPool().query(
    `SELECT * FROM doctors WHERE user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function getDoctorAppointments(doctorId) {
  const { rows } = await getTestPool().query(
    `SELECT * FROM appointments WHERE doctor_id = $1 ORDER BY appointment_date DESC, start_time DESC`,
    [doctorId],
  );
  return rows;
}

test("demo patient and doctor accounts exist and are marked as demo accounts", async () => {
  for (const account of DEMO_ACCOUNTS) {
    const user = await getUser(account.email);
    assert.ok(user, `${account.email} should exist`);
    assert.equal(user.is_demo, true);
    assert.equal(user.role, account.role);
  }
});

test("demo doctor profile is created and valid", async () => {
  const doctorUser = await getUser(DEMO_ACCOUNTS[1].email);
  const profile = await getDoctorProfile(doctorUser.id);
  assert.ok(profile);
  assert.equal(profile.specialization, "General Practice");
  assert.ok(profile.location);
  assert.ok(Number(profile.fee) > 0);
  assert.ok(profile.experience_years >= 1);
});

test("demo seed produces future and historical appointments", async () => {
  const patient = await getUser(DEMO_ACCOUNTS[0].email);
  const doctor = await getUser(DEMO_ACCOUNTS[1].email);
  const doctorProfile = await getDoctorProfile(doctor.id);
  const appointments = await getDoctorAppointments(doctorProfile.id);
  assert.ok(
    appointments.some(
      (appointment) =>
        appointment.patient_id === patient.id && appointment.status === "scheduled",
    ),
  );
  assert.ok(
    appointments.some(
      (appointment) =>
        appointment.patient_id === patient.id && appointment.status === "completed",
    ),
  );

  const upcoming = appointments.find(
    (appointment) =>
      appointment.patient_id === patient.id && appointment.status === "scheduled",
  );
  const historical = appointments.find(
    (appointment) =>
      appointment.patient_id === patient.id && appointment.status === "completed",
  );

  assert.ok(new Date(upcoming.appointment_date).getTime() > Date.now());
  assert.ok(new Date(historical.appointment_date).getTime() < Date.now());
  assert.ok(upcoming.start_time < upcoming.end_time);
});

test("demo patient can retrieve their appointments and demo doctor can retrieve authorized appointments", async () => {
  const patient = await getUser(DEMO_ACCOUNTS[0].email);
  const doctor = await getUser(DEMO_ACCOUNTS[1].email);
  const doctorProfile = await getDoctorProfile(doctor.id);
  const patientAppointments = await getTestPool().query(
    `SELECT * FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC`,
    [patient.id],
  );
  const doctorAppointments = await getTestPool().query(
    `SELECT * FROM appointments WHERE doctor_id = $1 ORDER BY appointment_date DESC`,
    [doctorProfile.id],
  );

  assert.ok(patientAppointments.rows.length >= 2);
  assert.ok(doctorAppointments.rows.length >= 2);
  assert.ok(doctorAppointments.rows.some((appointment) => appointment.patient_id === patient.id));
});

test("demo patient can access their document and demo doctor can access it through the care relationship", async () => {
  const patient = await getUser(DEMO_ACCOUNTS[0].email);
  const doctor = await getUser(DEMO_ACCOUNTS[1].email);
  const doc = await getTestPool().query(
    `SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
    [patient.id],
  );
  assert.ok(doc.rows.length > 0);
  assert.equal(doc.rows[0].file_name, "Demo Annual Health Check Summary.pdf");

  const allowedDoctor = await getTestPool().query(
    `SELECT 1
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = $1
       AND d.user_id = $2
       AND a.status IN ('scheduled', 'confirmed', 'completed')
     LIMIT 1`,
    [patient.id, doctor.id],
  );
  assert.ok(allowedDoctor.rows.length > 0);
});

test("demo conversation exists and both demo identities can retrieve it", async () => {
  const patient = await getUser(DEMO_ACCOUNTS[0].email);
  const doctor = await getUser(DEMO_ACCOUNTS[1].email);
  const conversation = await getTestPool().query(
    `SELECT m.*, u.full_name AS sender_name
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
     ORDER BY m.created_at ASC`,
    [patient.id, doctor.id],
  );
  assert.ok(conversation.rows.length >= 2);
  assert.ok(conversation.rows.some((message) => message.content.includes("upcoming appointment")));
});

test("demo notification exists for the demo patient", async () => {
  const patient = await getUser(DEMO_ACCOUNTS[0].email);
  const reminder = await getTestPool().query(
    `SELECT * FROM reminders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [patient.id],
  );
  assert.ok(reminder.rows.length > 0);
  assert.match(reminder.rows[0].message, /appointment/i);
});

test("running demo seed twice does not duplicate records", async () => {
  const before = {
    users: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM users WHERE email IN ($1, $2)", [DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[1].email])).rows[0].count,
    appointments: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM appointments WHERE patient_id IN (SELECT id FROM users WHERE email = $1)", [DEMO_ACCOUNTS[0].email])).rows[0].count,
    messages: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM messages WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id IN (SELECT id FROM users WHERE email = $1))", [DEMO_ACCOUNTS[0].email])).rows[0].count,
  };

  await seedDemoAccounts();

  const after = {
    users: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM users WHERE email IN ($1, $2)", [DEMO_ACCOUNTS[0].email, DEMO_ACCOUNTS[1].email])).rows[0].count,
    appointments: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM appointments WHERE patient_id IN (SELECT id FROM users WHERE email = $1)", [DEMO_ACCOUNTS[0].email])).rows[0].count,
    messages: (await getTestPool().query("SELECT COUNT(*)::int AS count FROM messages WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id IN (SELECT id FROM users WHERE email = $1))", [DEMO_ACCOUNTS[0].email])).rows[0].count,
  };

  assert.deepEqual(after, before);
});
