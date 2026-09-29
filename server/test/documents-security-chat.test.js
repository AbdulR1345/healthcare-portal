import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { io } from "socket.io-client";
import { after, before, test } from "node:test";
import {
  closeTestPool,
  createFixture,
  futureDateForWeekday,
  getTestPool,
} from "./support/db.js";
import { startHarness, request } from "./support/harness.js";
import { clientSourceFiles } from "./support/safety.js";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
  await closeTestPool();
});

async function signIn(user) {
  const { response, data } = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(response.status, 200);
  return data.token;
}

async function uploadFixture(
  patient,
  token,
  content = "test fixture document bytes",
) {
  const form = new FormData();
  form.set(
    "file",
    new Blob([content], { type: "application/pdf" }),
    "fixture.pdf",
  );
  return request(harness.baseUrl, "/api/documents/upload", {
    token,
    method: "POST",
    body: form,
  });
}

async function createAppointmentRelationship(
  fixture,
  patientId,
  doctor,
  status = "scheduled",
) {
  return fixture.createAppointment({
    patientId,
    doctorId: doctor.doctorId,
    date: futureDateForWeekday(1),
    status,
  });
}

async function createChatRelationship(
  fixture,
  patient,
  doctor,
  status = "scheduled",
) {
  return fixture.createAppointment({
    patientId: patient.id,
    doctorId: doctor.doctorId,
    date: futureDateForWeekday(1),
    status,
  });
}

async function connectSocket(token) {
  const socket = io(harness.baseUrl, {
    auth: token ? { token } : {},
    transports: ["websocket"],
    reconnection: false,
    timeout: 3000,
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

function socketAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.timeout(3000).emit(event, payload, (error, result) => {
      resolve(
        error
          ? { ok: false, error: "Socket acknowledgement timed out" }
          : result,
      );
    });
  });
}

test("authenticated patient can upload a document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const result = await uploadFixture(patient, await signIn(patient));
  assert.equal(result.response.status, 201);
  assert.ok(result.data.id);
  assert.equal(result.data.patient_id, patient.id);
  assert.ok(result.data.file_url.startsWith("/api/documents/"));
});

test("patients can download their own documents", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token);
  const result = await fetch(
    `${harness.baseUrl}/api/documents/${upload.data.id}/download`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  assert.equal(result.status, 200);
  assert.equal(await result.text(), "test fixture document bytes");
});

test("a doctor with an active care relationship can access the patient's document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token);
  await createAppointmentRelationship(fixture, patient.id, doctor);
  const doctorToken = await signIn(doctor);
  const result = await fetch(
    `${harness.baseUrl}/api/documents/${upload.data.id}/download`,
    {
      headers: { Authorization: `Bearer ${doctorToken}` },
    },
  );
  assert.equal(result.status, 200);
  assert.equal(await result.text(), "test fixture document bytes");
});

test("an unrelated doctor receives forbidden for a patient's document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const unrelatedDoctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const upload = await uploadFixture(patient, await signIn(patient));
  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/download`,
    {
      token: await signIn(unrelatedDoctor),
    },
  );
  assert.equal(result.response.status, 403);
});

test("unauthenticated document downloads are rejected", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const upload = await uploadFixture(patient, await signIn(patient));
  const result = await fetch(
    `${harness.baseUrl}/api/documents/${upload.data.id}/download`,
  );
  assert.equal(result.status, 401);
});

test("a guessed document ID cannot bypass authorization or reveal existence", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const guessedId = crypto.randomUUID();
  const result = await request(
    harness.baseUrl,
    `/api/documents/${guessedId}/download`,
    {
      token: await signIn(patient),
    },
  );
  assert.equal(result.response.status, 404);
});

test("document summarization follows the same care authorization rules", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const unrelatedDoctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const upload = await uploadFixture(patient, await signIn(patient));
  const aiCallsBefore = harness.ai.requestCount;
  const denied = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    {
      method: "POST",
      token: await signIn(unrelatedDoctor),
    },
  );
  assert.equal(denied.response.status, 403);
  assert.equal(harness.ai.requestCount, aiCallsBefore);
});

test("Node sends its internal AI credential only to the AI service", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const upload = await uploadFixture(
    patient,
    await signIn(patient),
    "%PDF-1.4\nfixture",
  );
  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    {
      method: "POST",
      token: await signIn(patient),
    },
  );
  assert.equal(result.response.status, 200);
  assert.equal(harness.ai.lastAuthorization, harness.aiToken);
  assert.equal(JSON.stringify(result.data).includes(harness.aiToken), false);
});

test("medical documents are not exposed through public /uploads paths", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const upload = await uploadFixture(patient, await signIn(patient));
  const { rows } = await getTestPool().query(
    "SELECT file_url FROM documents WHERE id = $1",
    [upload.data.id],
  );
  const filename = path.basename(rows[0].file_url);
  const result = await fetch(
    `${harness.baseUrl}/uploads/${encodeURIComponent(filename)}`,
  );
  assert.equal(result.status, 404);
});

test("malformed JSON receives a sanitized 400 response", async () => {
  const result = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.data.error, "Malformed JSON request");
});

test("oversized JSON receives a 413 response", async () => {
  const body = `{"value":"${"x".repeat(101 * 1024)}"}`;
  const result = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    body,
  });
  assert.equal(result.response.status, 413);
  assert.equal(result.data.error, "Request body too large");
});

test("protected routes reject requests without authentication", async () => {
  const result = await request(harness.baseUrl, "/api/appointments");
  assert.equal(result.response.status, 401);
});

test("protected routes reject invalid authentication", async () => {
  const result = await request(harness.baseUrl, "/api/appointments", {
    token: "invalid.test.token",
  });
  assert.equal(result.response.status, 401);
});

test("admin-only routes reject authenticated non-admin users", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const result = await request(harness.baseUrl, "/api/admin/stats", {
    token: await signIn(patient),
  });
  assert.equal(result.response.status, 403);
});

test("a patient can message an assigned doctor without choosing the sender", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  const appointment = await createChatRelationship(fixture, patient, doctor);
  const unauthenticated = await request(
    harness.baseUrl,
    `/api/chat/${doctor.id}`,
  );
  assert.equal(unauthenticated.response.status, 401);

  const sent = await request(harness.baseUrl, "/api/chat", {
    method: "POST",
    token: await signIn(patient),
    body: {
      receiverId: doctor.id,
      senderId: doctor.id,
      content: "Please confirm my follow-up appointment.",
      appointmentId: "00000000-0000-4000-8000-000000000000",
    },
  });
  assert.equal(sent.response.status, 201);
  assert.equal(sent.data.sender_id, patient.id);
  assert.equal(sent.data.receiver_id, doctor.id);
  assert.equal(sent.data.appointment_id, appointment.id);
});

test("an assigned doctor can read the patient conversation", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor);
  await getTestPool().query(
    "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, 'Care history')",
    [patient.id, doctor.id],
  );

  const result = await request(harness.baseUrl, `/api/chat/${patient.id}`, {
    token: await signIn(doctor),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].content, "Care history");
});

test("an unrelated patient cannot message or read a doctor's conversation", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const unrelatedPatient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor);

  const token = await signIn(unrelatedPatient);
  const sent = await request(harness.baseUrl, "/api/chat", {
    method: "POST",
    token,
    body: { receiverId: doctor.id, content: "Hello" },
  });
  const read = await request(harness.baseUrl, `/api/chat/${doctor.id}`, {
    token,
  });
  assert.equal(sent.response.status, 404);
  assert.equal(read.response.status, 404);
});

test("an unrelated doctor cannot access a patient's conversation", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const assignedDoctor = await fixture.createDoctor();
  const unrelatedDoctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, assignedDoctor);

  const result = await request(harness.baseUrl, `/api/chat/${patient.id}`, {
    token: await signIn(unrelatedDoctor),
  });
  assert.equal(result.response.status, 404);
});

test("an arbitrary conversation or message ID cannot reveal messages", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  const otherPatient = await fixture.createUser();
  const message = await getTestPool().query(
    "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, 'Private') RETURNING id",
    [patient.id, doctor.id],
  );
  const token = await signIn(otherPatient);
  const guessedPartner = await request(
    harness.baseUrl,
    `/api/chat/${patient.id}`,
    { token },
  );
  const guessedMessage = await request(
    harness.baseUrl,
    `/api/chat/${message.rows[0].id}`,
    { token },
  );
  assert.equal(guessedPartner.response.status, 404);
  assert.equal(guessedMessage.response.status, 404);
});

test("cancelled-only relationships cannot create or retrieve a conversation", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor, "cancelled");
  const token = await signIn(patient);

  const sent = await request(harness.baseUrl, "/api/chat", {
    method: "POST",
    token,
    body: { receiverId: doctor.id, content: "Follow-up" },
  });
  const history = await request(harness.baseUrl, `/api/chat/${doctor.id}`, {
    token,
  });
  assert.equal(sent.response.status, 404);
  assert.equal(history.response.status, 404);
  const { rows } = await getTestPool().query(
    "SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1 AND receiver_id = $2",
    [patient.id, doctor.id],
  );
  assert.equal(rows[0].count, 0);
});

test("completed appointment relationships retain authorized history", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  const appointment = await createChatRelationship(
    fixture,
    patient,
    doctor,
    "completed",
  );
  await getTestPool().query(
    `INSERT INTO messages (sender_id, receiver_id, content, appointment_id)
     VALUES ($1, $2, 'Completed visit history', $3)`,
    [doctor.id, patient.id, appointment.id],
  );
  const reply = await request(harness.baseUrl, "/api/chat", {
    method: "POST",
    token: await signIn(doctor),
    body: { receiverId: patient.id, content: "Doctor follow-up" },
  });
  assert.equal(reply.response.status, 201);
  assert.equal(reply.data.sender_id, doctor.id);
  assert.equal(reply.data.appointment_id, appointment.id);

  const history = await request(harness.baseUrl, `/api/chat/${patient.id}`, {
    token: await signIn(doctor),
  });
  assert.equal(history.response.status, 200);
  assert.ok(
    history.data.some(
      (message) => message.content === "Completed visit history",
    ),
  );
});

test("message validation rejects empty and oversized content", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor);
  const token = await signIn(patient);

  for (const content of ["  ", "x".repeat(5001)]) {
    const result = await request(harness.baseUrl, "/api/chat", {
      method: "POST",
      token,
      body: { receiverId: doctor.id, content },
    });
    assert.equal(result.response.status, 400);
  }
});

test("message history is bounded and conversations include appointment partners", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor);
  await getTestPool().query(
    `INSERT INTO messages (sender_id, receiver_id, content)
     SELECT $1, $2, 'History ' || sequence::text
     FROM generate_series(1, 125) AS sequence`,
    [patient.id, doctor.id],
  );

  const token = await signIn(patient);
  const history = await request(
    harness.baseUrl,
    `/api/chat/${doctor.id}?limit=10000`,
    { token },
  );
  const olderHistory = await request(
    harness.baseUrl,
    `/api/chat/${doctor.id}?limit=30&before=${history.data[0].id}`,
    { token },
  );
  const conversations = await request(
    harness.baseUrl,
    "/api/chat/conversations",
    { token },
  );
  assert.equal(history.response.status, 200);
  assert.equal(history.data.length, 100);
  assert.equal(olderHistory.response.status, 200);
  assert.equal(olderHistory.data.length, 25);
  assert.equal(
    olderHistory.data.some((message) =>
      history.data.some((item) => item.id === message.id),
    ),
    false,
  );
  assert.equal(conversations.data.length, 1);
  assert.equal(conversations.data[0].partner_id, doctor.id);
});

test("unauthenticated Socket.IO connections are rejected", async () => {
  const socket = io(harness.baseUrl, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 3000,
  });
  const error = await new Promise((resolve) =>
    socket.once("connect_error", resolve),
  );
  assert.match(error.message, /Authentication required/);
  socket.close();
});

test("unauthorized socket room joins and sends are rejected", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const unrelatedDoctor = await fixture.createDoctor();
  const socket = await connectSocket(await signIn(patient));
  t.after(() => socket.disconnect());

  const join = await socketAck(socket, "join_chat", {
    partnerId: unrelatedDoctor.id,
  });
  const send = await socketAck(socket, "send_message", {
    receiverId: unrelatedDoctor.id,
    content: "Unauthorized",
  });
  assert.equal(join.ok, false);
  assert.equal(send.ok, false);
});

test("authorized Socket.IO participants can exchange messages", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  const appointment = await createChatRelationship(fixture, patient, doctor);
  const patientSocket = await connectSocket(await signIn(patient));
  const doctorSocket = await connectSocket(await signIn(doctor));
  t.after(() => {
    patientSocket.disconnect();
    doctorSocket.disconnect();
  });

  assert.equal(
    (await socketAck(patientSocket, "join_chat", { partnerId: doctor.id })).ok,
    true,
  );
  assert.equal(
    (await socketAck(doctorSocket, "join_chat", { partnerId: patient.id })).ok,
    true,
  );
  const incomingMessage = new Promise((resolve) =>
    doctorSocket.once("new_message", resolve),
  );
  const empty = await socketAck(patientSocket, "send_message", {
    receiverId: doctor.id,
    content: "  ",
  });
  const oversized = await socketAck(patientSocket, "send_message", {
    receiverId: doctor.id,
    content: "x".repeat(5001),
  });
  assert.equal(empty.ok, false);
  assert.equal(oversized.ok, false);
  const sent = await socketAck(patientSocket, "send_message", {
    receiverId: doctor.id,
    senderId: doctor.id,
    content: "Socket follow-up",
  });
  const received = await incomingMessage;
  assert.equal(sent.ok, true);
  assert.equal(sent.message.sender_id, patient.id);
  assert.equal(sent.message.appointment_id, appointment.id);
  assert.equal(received.content, "Socket follow-up");
});

test("authorized socket conversations expose typing and presence only in-room", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor();
  await createChatRelationship(fixture, patient, doctor);
  const patientSocket = await connectSocket(await signIn(patient));
  const doctorSocket = await connectSocket(await signIn(doctor));
  t.after(() => {
    patientSocket.disconnect();
    doctorSocket.disconnect();
  });

  await socketAck(patientSocket, "join_chat", { partnerId: doctor.id });
  const presence = new Promise((resolve) =>
    patientSocket.once("presence", resolve),
  );
  const joined = await socketAck(doctorSocket, "join_chat", {
    partnerId: patient.id,
  });
  assert.equal(joined.partnerOnline, true);
  assert.equal((await presence).userId, doctor.id);
  const typing = new Promise((resolve) => doctorSocket.once("typing", resolve));
  const result = await socketAck(patientSocket, "typing", {
    partnerId: doctor.id,
  });
  assert.equal(result.ok, true);
  assert.equal((await typing).userId, patient.id);
});

test("frontend source does not contain the internal AI service credential", async () => {
  const sourceFiles = await clientSourceFiles();
  const sources = await Promise.all(
    sourceFiles.map((file) => fs.readFile(file, "utf8")),
  );
  assert.equal(
    sources.some((source) =>
      /AI_SERVICE_TOKEN|integration-test-only-ai-token/.test(source),
    ),
    false,
  );
});

test("a patient can process their own pending document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  assert.equal(upload.data.ai_processing_status, "pending");

  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token },
  );
  const stored = await getTestPool().query(
    "SELECT ai_summary, ai_processing_status, ai_processing_finished_at FROM documents WHERE id = $1",
    [upload.data.id],
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.data.ai_processing_status, "completed");
  assert.equal(result.data.ai_summary.documentType, "Test report");
  assert.equal(stored.rows[0].ai_processing_status, "completed");
  assert.equal(stored.rows[0].ai_summary.documentType, "Test report");
  assert.ok(stored.rows[0].ai_processing_finished_at);
});

test("an authorized doctor can process a patient's document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createDoctor({ dayOfWeek: 1 });
  const upload = await uploadFixture(
    patient,
    await signIn(patient),
    "%PDF-1.4\nfixture",
  );
  await createAppointmentRelationship(fixture, patient.id, doctor);

  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token: await signIn(doctor) },
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ai_processing_status, "completed");
});

test("an unrelated patient cannot process another patient's document", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const unrelatedPatient = await fixture.createUser();
  const upload = await uploadFixture(
    patient,
    await signIn(patient),
    "%PDF-1.4\nfixture",
  );
  const before = harness.ai.requestCount;
  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token: await signIn(unrelatedPatient) },
  );
  assert.equal(result.response.status, 403);
  assert.equal(harness.ai.requestCount, before);
});

test("invalid document IDs return not found without invoking AI", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const before = harness.ai.requestCount;
  const result = await request(
    harness.baseUrl,
    "/api/documents/not-a-document-id/summarize",
    { method: "POST", token: await signIn(patient) },
  );
  assert.equal(result.response.status, 404);
  assert.equal(harness.ai.requestCount, before);
});

test("completed documents reuse their summary without another AI request", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  const route = `/api/documents/${upload.data.id}/summarize`;
  const first = await request(harness.baseUrl, route, {
    method: "POST",
    token,
  });
  const before = harness.ai.requestCount;
  const second = await request(harness.baseUrl, route, {
    method: "POST",
    token,
  });

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.data.ai_summary, first.data.ai_summary);
  assert.equal(harness.ai.requestCount, before);
});

test("processing documents cannot trigger duplicate AI requests", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  const route = `/api/documents/${upload.data.id}/summarize`;
  const before = harness.ai.requestCount;
  harness.ai.setBehavior({ delay: 150 });
  t.after(() => harness.ai.setBehavior());

  const firstRequest = request(harness.baseUrl, route, {
    method: "POST",
    token,
  });
  await harness.ai.waitForRequestCount(before + 1);
  const duplicate = await request(harness.baseUrl, route, {
    method: "POST",
    token,
  });
  const first = await firstRequest;

  assert.equal(duplicate.response.status, 202);
  assert.equal(duplicate.data.ai_processing_status, "processing");
  assert.equal(first.response.status, 200);
  assert.equal(harness.ai.requestCount, before + 1);
});

test("AI failure records a safe failed state without logging document contents", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const privateMarker = "PRIVATE-MEDICAL-CONTENT-DO-NOT-LOG";
  const upload = await uploadFixture(
    patient,
    token,
    `%PDF-1.4\n${privateMarker}`,
  );
  harness.ai.setBehavior({ status: 503 });
  t.after(() => harness.ai.setBehavior());

  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token },
  );
  const stored = await getTestPool().query(
    "SELECT ai_processing_status, ai_processing_error FROM documents WHERE id = $1",
    [upload.data.id],
  );

  assert.equal(result.response.status, 503);
  assert.equal(result.data.ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_error, "AI_SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(result.data).includes(harness.aiToken), false);
  assert.equal(harness.logs.includes(privateMarker), false);
});

test("AI timeout marks processing failed", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  harness.ai.setBehavior({ delay: 1000 });
  t.after(() => harness.ai.setBehavior());

  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token },
  );
  const stored = await getTestPool().query(
    "SELECT ai_processing_status, ai_processing_error FROM documents WHERE id = $1",
    [upload.data.id],
  );

  assert.equal(result.response.status, 503);
  assert.equal(result.data.ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_error, "AI_SERVICE_TIMEOUT");
});

test("malformed AI responses fail safely without saving a summary", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  harness.ai.setBehavior({ rawBody: "not-json" });
  t.after(() => harness.ai.setBehavior());

  const result = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token },
  );
  const stored = await getTestPool().query(
    "SELECT ai_summary, ai_processing_status, ai_processing_error FROM documents WHERE id = $1",
    [upload.data.id],
  );

  assert.equal(result.response.status, 502);
  assert.equal(result.data.ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_status, "failed");
  assert.equal(stored.rows[0].ai_processing_error, "INVALID_AI_RESPONSE");
  assert.equal(stored.rows[0].ai_summary, null);
});

test("missing and unsupported document files cannot start processing", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const token = await signIn(patient);
  const upload = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  const stored = await getTestPool().query(
    "SELECT file_url FROM documents WHERE id = $1",
    [upload.data.id],
  );
  await fs.unlink(
    path.join(harness.uploadDir, path.basename(stored.rows[0].file_url)),
  );

  const missing = await request(
    harness.baseUrl,
    `/api/documents/${upload.data.id}/summarize`,
    { method: "POST", token },
  );
  assert.equal(missing.response.status, 404);

  const empty = await uploadFixture(patient, token, "");
  const emptyResult = await request(
    harness.baseUrl,
    `/api/documents/${empty.data.id}/summarize`,
    { method: "POST", token },
  );
  assert.equal(emptyResult.response.status, 422);

  const second = await uploadFixture(patient, token, "%PDF-1.4\nfixture");
  await getTestPool().query(
    "UPDATE documents SET file_type = 'text/plain' WHERE id = $1",
    [second.data.id],
  );
  const unsupported = await request(
    harness.baseUrl,
    `/api/documents/${second.data.id}/summarize`,
    { method: "POST", token },
  );
  assert.equal(unsupported.response.status, 415);
});
