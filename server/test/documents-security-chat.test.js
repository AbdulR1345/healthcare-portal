import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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

async function uploadFixture(patient, token) {
  const form = new FormData();
  form.set(
    "file",
    new Blob(["test fixture document bytes"], { type: "application/pdf" }),
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
  const upload = await uploadFixture(patient, await signIn(patient));
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

test("chat messages require authentication and remain scoped to the requested pair", async (t) => {
  const fixture = await createFixture(t);
  const patient = await fixture.createUser();
  const doctor = await fixture.createUser("doctor");
  const unrelated = await fixture.createUser();
  const unauthenticated = await request(
    harness.baseUrl,
    `/api/chat/${doctor.id}`,
  );
  assert.equal(unauthenticated.response.status, 401);

  await getTestPool().query(
    `INSERT INTO messages (sender_id, receiver_id, content)
     VALUES ($1, $2, 'fixture message one'), ($3, $2, 'fixture message two')`,
    [patient.id, doctor.id, unrelated.id],
  );
  const messages = await request(harness.baseUrl, `/api/chat/${patient.id}`, {
    token: await signIn(doctor),
  });
  assert.equal(messages.response.status, 200);
  assert.equal(messages.data.length, 1);
  assert.equal(messages.data[0].sender_id, patient.id);
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
