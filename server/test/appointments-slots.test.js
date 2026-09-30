import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  closeTestPool,
  createFixture,
  futureDateForWeekday,
  getTestPool,
} from "./support/db.js";
import { startHarness, request } from "./support/harness.js";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
  await closeTestPool();
});

async function book(
  patient,
  doctor,
  date,
  startTime = "09:00",
  endTime = "09:30",
  extra = {},
) {
  return request(harness.baseUrl, "/api/appointments", {
    method: "POST",
    token: patient.accessToken,
    body: {
      doctorId: doctor.doctorId,
      appointmentDate: date,
      startTime,
      endTime,
      ...extra,
    },
  });
}

async function signIn(user) {
  const { response, data } = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(response.status, 200);
  return data.token;
}

async function slots(doctor, token, date) {
  return request(
    harness.baseUrl,
    `/api/doctors/${doctor.doctorId}/slots?date=${date}`,
    { token },
  );
}

test("doctor availability generates the configured slots", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:30",
    slotDurationMinutes: 30,
  });
  const token = await signIn(await fixture.createUser());
  const date = futureDateForWeekday(1);
  const result = await slots(doctor, token, date);
  assert.equal(result.response.status, 200);
  assert.deepEqual(
    result.data.slots.map((slot) => [slot.startTime, slot.endTime]),
    [
      ["09:00:00", "09:30:00"],
      ["09:30:00", "10:00:00"],
      ["10:00:00", "10:30:00"],
    ],
  );
});

test("booked appointment slots disappear from availability", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const patient = await fixture.createUser();
  const patientToken = await signIn(patient);
  const date = futureDateForWeekday(1);
  await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
  });
  const result = await slots(doctor, patientToken, date);
  assert.equal(result.response.status, 200);
  assert.equal(
    result.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:00"),
    false,
  );
  assert.equal(
    result.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:30"),
    true,
  );
});

test("appointment dates and reminders preserve clinic-local calendar values", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const result = await book(
    { ...patient, accessToken: await signIn(patient) },
    doctor,
    date,
  );
  assert.equal(result.response.status, 201);
  assert.equal(result.data.appointment_date, date);

  const { rows } = await getTestPool().query(
    `SELECT
       a.appointment_date::text AS appointment_date,
       to_char(r.scheduled_for AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS reminder_local
     FROM appointments a
     JOIN reminders r ON r.appointment_id = a.id
     WHERE a.id = $1`,
    [result.data.id],
  );
  const expectedReminderDate = new Date(`${date}T00:00:00Z`);
  expectedReminderDate.setUTCDate(expectedReminderDate.getUTCDate() - 1);
  assert.equal(rows[0].appointment_date, date);
  assert.equal(
    rows[0].reminder_local,
    `${expectedReminderDate.toISOString().slice(0, 10)} 09:00:00`,
  );
});

test("cancelled appointments do not remain booked", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const date = futureDateForWeekday(1);
  await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
    status: "cancelled",
  });
  const result = await slots(doctor, token, date);
  assert.equal(
    result.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:00"),
    true,
  );
});

test("slot lookup rejects malformed and past dates", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const token = await signIn(await fixture.createUser());
  const malformed = await slots(doctor, token, "2026-02-31");
  const past = await slots(doctor, token, "2000-01-01");
  assert.equal(malformed.response.status, 400);
  assert.equal(past.response.status, 400);
});

test("overlapping appointments block every intersecting slot", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const date = futureDateForWeekday(1);
  await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
    startTime: "09:15",
    endTime: "09:45",
  });
  const result = await slots(doctor, token, date);
  assert.equal(
    result.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:00"),
    false,
  );
  assert.equal(
    result.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:30"),
    false,
  );
  const overlappingBooking = await book(
    { ...patient, accessToken: token },
    doctor,
    date,
  );
  assert.equal(overlappingBooking.response.status, 409);
});

test("patient can book an available slot", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const result = await book(
    { ...patient, accessToken: await signIn(patient) },
    doctor,
    date,
  );
  assert.equal(result.response.status, 201);
  assert.equal(result.data.patient_id, patient.id);
  assert.equal(result.data.status, "scheduled");
});

test("booking outside doctor availability is rejected", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const result = await book(
    { ...patient, accessToken: await signIn(patient) },
    doctor,
    date,
    "12:00",
    "12:30",
  );
  assert.equal(result.response.status, 409);
});

test("all active appointment statuses block booking their slots", async (t) => {
  const fixture = await createFixture(t);
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);

  for (const [status, startTime, endTime] of [
    ["scheduled", "09:00", "09:30"],
    ["confirmed", "09:30", "10:00"],
    ["completed", "10:00", "10:30"],
  ]) {
    const patient = await fixture.createUser();
    const otherPatient = await fixture.createUser();
    await fixture.createAppointment({
      patientId: patient.id,
      doctorId: doctor.doctorId,
      date,
      startTime,
      endTime,
      status,
    });
    const result = await book(
      { ...otherPatient, accessToken: await signIn(otherPatient) },
      doctor,
      date,
      startTime,
      endTime,
    );
    assert.equal(result.response.status, 409, `${status} must block the slot`);
  }
});

test("database rejects duplicate active appointment slots", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const otherPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
    status: "scheduled",
  });

  await assert.rejects(
    fixture.createAppointment({
      patientId: otherPatient.id,
      doctorId: doctor.doctorId,
      date,
      status: "confirmed",
    }),
    (error) => error.code === "23505",
  );
});

test("patient cannot book an appointment as another user", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const otherPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const result = await book(
    { ...patient, accessToken: await signIn(patient) },
    doctor,
    date,
    "09:00",
    "09:30",
    { patientId: otherPatient.id },
  );
  assert.equal(result.response.status, 201);
  assert.equal(result.data.patient_id, patient.id);
  assert.notEqual(result.data.patient_id, otherPatient.id);
});

test("patients can only list and update their own appointments", async (t) => {
  const fixture = await createFixture(t);
  const owner = await fixture.createUser();
  const unrelatedPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const appointment = await fixture.createAppointment({
    patientId: owner.id,
    doctorId: doctor.doctorId,
    date,
  });
  const ownerToken = await signIn(owner);
  const unrelatedToken = await signIn(unrelatedPatient);
  const ownList = await request(harness.baseUrl, "/api/appointments", {
    token: ownerToken,
  });
  const unrelatedList = await request(harness.baseUrl, "/api/appointments", {
    token: unrelatedToken,
  });
  assert.equal(
    ownList.data.some((item) => item.id === appointment.id),
    true,
  );
  assert.equal(
    unrelatedList.data.some((item) => item.id === appointment.id),
    false,
  );
  const update = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: unrelatedToken,
      body: { status: "cancelled" },
    },
  );
  assert.equal(update.response.status, 403);
});

test("doctor can confirm and complete a scheduled appointment", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const appointment = await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
  });
  const token = await signIn(doctor);
  const confirmed = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token,
      body: { status: "confirmed" },
    },
  );
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.data.status, "confirmed");
  const completed = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token,
      body: { status: "completed" },
    },
  );
  assert.equal(completed.response.status, 200);
  assert.equal(completed.data.status, "completed");
});

test("patient cannot make an invalid appointment state transition", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const appointment = await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
  });
  const result = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: await signIn(patient),
      body: { status: "completed" },
    },
  );
  assert.equal(result.response.status, 409);
});

test("reschedule rejects a slot occupied by another appointment", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const otherPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const ownAppointment = await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
  });
  await fixture.createAppointment({
    patientId: otherPatient.id,
    doctorId: doctor.doctorId,
    date,
    startTime: "09:30",
    endTime: "10:00",
  });
  const result = await request(
    harness.baseUrl,
    `/api/appointments/${ownAppointment.id}/reschedule`,
    {
      method: "PATCH",
      token: await signIn(patient),
      body: { appointmentDate: date, startTime: "09:30", endTime: "10:00" },
    },
  );
  assert.equal(result.response.status, 409);
});

test("cancelling an appointment restores its slot to availability", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const replacementPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const date = futureDateForWeekday(1);
  const appointment = await fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date,
  });
  const cancel = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: await signIn(patient),
      body: { status: "cancelled" },
    },
  );
  assert.equal(cancel.response.status, 200);
  const replacementToken = await signIn(replacementPatient);
  const available = await slots(doctor, replacementToken, date);
  assert.equal(
    available.data.slots.some((slot) => slot.startTime.slice(0, 5) === "09:00"),
    true,
  );
  const replacement = await book(
    { ...replacementPatient, accessToken: replacementToken },
    doctor,
    date,
  );
  assert.equal(replacement.response.status, 201);
  assert.equal(replacement.data.patient_id, replacementPatient.id);
  assert.equal(replacement.data.start_time.slice(0, 5), "09:00");
});

test("appointment status access is scoped to assigned doctors while admins may act", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const assignedDoctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const unrelatedDoctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const admin = await fixture.createUser("admin");
  const date = futureDateForWeekday(1);
  const appointment = await fixture.createAppointment({
    patientId: patient.id,
    doctorId: assignedDoctor.doctorId,
    date,
  });
  const denied = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: await signIn(unrelatedDoctor),
      body: { status: "confirmed" },
    },
  );
  assert.equal(denied.response.status, 403);
  const confirmed = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: await signIn(assignedDoctor),
      body: { status: "confirmed" },
    },
  );
  assert.equal(confirmed.response.status, 200);
  const completed = await request(
    harness.baseUrl,
    `/api/appointments/${appointment.id}/status`,
    {
      method: "PATCH",
      token: await signIn(admin),
      body: { status: "completed" },
    },
  );
  assert.equal(completed.response.status, 200);
});
