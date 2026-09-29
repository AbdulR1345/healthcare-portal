import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { createFixture, closeTestPool, getTestPool } from "./support/db.js";
import { startHarness, request, refreshCookie } from "./support/harness.js";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
  await closeTestPool();
});

async function registerAccount(body) {
  return request(harness.baseUrl, "/api/auth/register", {
    method: "POST",
    body,
  });
}

async function loginAccount(email, password) {
  const result = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.response.status, 200, "fixture account should log in");
  assert.ok(
    typeof result.data.token === "string",
    "access token should be returned",
  );
  return {
    accessToken: result.data.token,
    cookie: refreshCookie(result.response),
  };
}

function resetTokenFromUrl(resetUrl) {
  assert.ok(
    typeof resetUrl === "string",
    "development reset link should be available to tests",
  );
  const token = new URL(resetUrl).searchParams.get("token");
  assert.ok(token, "reset link should contain a token");
  return token;
}

test("registration creates an unverified account and does not return access credentials", async (t) => {
  const fixture = await createFixture(t);
  const email = `registration-${crypto.randomUUID()}@example.com`;
  const password = "Unique-Registration!7284";
  const result = await registerAccount({
    email,
    password,
    role: "patient",
    fullName: "Registration Fixture",
  });
  if (result.data?.user?.id) fixture.trackUser(result.data.user.id);

  assert.equal(result.response.status, 201);
  assert.equal(result.data.user.email_verified, false);
  assert.equal(result.data.verificationRequired, true);
  assert.ok(typeof result.data.verificationUrl === "string");
  assert.equal("token" in result.data, false);
  assert.equal("refreshToken" in result.data, false);
});

test("duplicate email registration is rejected", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const result = await registerAccount({
    email: user.email.toUpperCase(),
    password: "Different-Registration!9382",
    role: "patient",
    fullName: "Duplicate Fixture",
  });
  assert.equal(result.response.status, 409);
});

test("invalid registration data is rejected before insertion", async () => {
  const result = await registerAccount({
    email: "not-an-email",
    password: "short",
    role: "admin",
    fullName: "",
  });
  assert.equal(result.response.status, 400);
  assert.ok(Array.isArray(result.data.errors));
});

test("verified user can log in and receives access and refresh credentials", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await loginAccount(user.email, user.password);
  assert.ok(login.accessToken.length > 0);
  assert.ok(login.cookie.startsWith("refreshToken="));
});

test("login is blocked until email verification", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser("patient", { emailVerified: false });
  const result = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, "EMAIL_NOT_VERIFIED");
});

test("email verification activates the registered account", async (t) => {
  const fixture = await createFixture(t);
  const email = `verify-${crypto.randomUUID()}@example.com`;
  const result = await registerAccount({
    email,
    password: "Unique-Verification!7284",
    role: "patient",
    fullName: "Verification Fixture",
  });
  assert.equal(result.response.status, 201);
  fixture.trackUser(result.data.user.id);
  const token = new URL(result.data.verificationUrl).searchParams.get("token");
  assert.ok(token);

  const verification = await request(
    harness.baseUrl,
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
  );
  assert.equal(verification.response.status, 200);
  const verified = await getTestPool().query(
    "SELECT email_verified FROM users WHERE id = $1",
    [result.data.user.id],
  );
  assert.equal(verified.rows[0].email_verified, true);
  const login = await loginAccount(email, "Unique-Verification!7284");
  assert.ok(login.accessToken.length > 0);
});

test("refresh token rotation invalidates the prior refresh session", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await loginAccount(user.email, user.password);
  const rotated = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(rotated.response.status, 200);
  assert.ok(typeof rotated.data.token === "string");
  const replacementCookie = refreshCookie(rotated.response);
  const replay = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(replay.response.status, 401);
  const replacement = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: replacementCookie,
  });
  assert.equal(replacement.response.status, 200);
});

test("logout revokes the refresh session and clears its cookie", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await loginAccount(user.email, user.password);
  const logout = await request(harness.baseUrl, "/api/auth/logout", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(logout.response.status, 200);
  assert.ok(
    (logout.response.headers.get("set-cookie") || "").startsWith(
      "refreshToken=;",
    ),
  );
  const result = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(result.response.status, 401);
});

test("revoked refresh sessions cannot be used", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await loginAccount(user.email, user.password);
  const hash = crypto
    .createHash("sha256")
    .update(login.cookie.slice("refreshToken=".length))
    .digest("hex");
  await getTestPool().query(
    "UPDATE auth_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1",
    [hash],
  );
  const result = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(result.response.status, 401);
});

test("password reset changes the password and consumes its token", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const forgot = await request(harness.baseUrl, "/api/auth/forgot-password", {
    method: "POST",
    body: { email: user.email },
  });
  assert.equal(forgot.response.status, 200);
  const token = resetTokenFromUrl(forgot.data.resetUrl);
  const reset = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body: {
      token,
      password: "Changed-Password!8372",
      confirmPassword: "Changed-Password!8372",
    },
  });
  assert.equal(reset.response.status, 200);
  const login = await loginAccount(user.email, "Changed-Password!8372");
  assert.ok(login.accessToken.length > 0);
});

test("invalid password reset token is rejected", async () => {
  const result = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body: {
      token: "0".repeat(64),
      password: "Changed-Password!8372",
      confirmPassword: "Changed-Password!8372",
    },
  });
  assert.equal(result.response.status, 400);
});

test("expired password reset token is rejected", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await getTestPool().query(
    `UPDATE users
     SET password_reset_token_hash = $1,
         password_reset_expires_at = NOW() - INTERVAL '1 minute'
     WHERE id = $2`,
    [tokenHash, user.id],
  );
  const result = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body: {
      token,
      password: "Changed-Password!8372",
      confirmPassword: "Changed-Password!8372",
    },
  });
  assert.equal(result.response.status, 400);
});

test("password reset token cannot be reused", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const forgot = await request(harness.baseUrl, "/api/auth/forgot-password", {
    method: "POST",
    body: { email: user.email },
  });
  const token = resetTokenFromUrl(forgot.data.resetUrl);
  const body = {
    token,
    password: "Changed-Password!8372",
    confirmPassword: "Changed-Password!8372",
  };
  const first = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body,
  });
  assert.equal(first.response.status, 200);
  const second = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body,
  });
  assert.equal(second.response.status, 400);
});

test("password reset revokes all existing refresh sessions", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await loginAccount(user.email, user.password);
  const forgot = await request(harness.baseUrl, "/api/auth/forgot-password", {
    method: "POST",
    body: { email: user.email },
  });
  const token = resetTokenFromUrl(forgot.data.resetUrl);
  const reset = await request(harness.baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body: {
      token,
      password: "Changed-Password!8372",
      confirmPassword: "Changed-Password!8372",
    },
  });
  assert.equal(reset.response.status, 200);
  const oldSession = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(oldSession.response.status, 401);
});
