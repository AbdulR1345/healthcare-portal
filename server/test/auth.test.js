import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { ipKeyGenerator } from "express-rate-limit";
import { createFixture, closeTestPool, getTestPool } from "./support/db.js";
import { startHarness, request, refreshCookie } from "./support/harness.js";
import { assertProductionEmailConfiguration } from "../src/services/emailService.js";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
  await closeTestPool();
});

test("production email configuration fails closed without Resend", () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
  };
  process.env.NODE_ENV = "production";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  assert.throws(assertProductionEmailConfiguration, /Resend configuration/);

  if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous.nodeEnv;
  for (const [name, value] of [
    ["RESEND_API_KEY", previous.apiKey],
    ["EMAIL_FROM", previous.from],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("health, readiness, and security headers are available", async () => {
  const health = await request(harness.baseUrl, "/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.data.status, "ok");
  assert.equal(
    health.response.headers.get("x-content-type-options"),
    "nosniff",
  );
  assert.equal(health.response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(health.response.headers.get("x-powered-by"), null);

  const readiness = await request(harness.baseUrl, "/api/ready");
  assert.equal(readiness.response.status, 200);
  assert.equal(readiness.data.status, "ready");
});

test("readiness returns a sanitized 503 when PostgreSQL is unavailable", async () => {
  const unavailableHarness = await startHarness({
    databaseUrlOverride: "postgres://test:test@127.0.0.1:1/healthcare_test",
  });
  try {
    const readiness = await request(unavailableHarness.baseUrl, "/api/ready");
    assert.equal(readiness.response.status, 503);
    assert.deepEqual(readiness.data, { error: "Service unavailable" });
  } finally {
    await unavailableHarness.close();
  }
});

test("concurrent migration runners complete under the database lock", async () => {
  const runMigration = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["src/db/migrate.js"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL,
        },
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });

  const results = await Promise.all([runMigration(), runMigration()]);
  assert.deepEqual(results, [
    { code: 0, signal: null },
    { code: 0, signal: null },
  ]);
});

test(
  "SIGTERM drains Socket.IO, HTTP, and database resources",
  { skip: process.platform === "win32" },
  async () => {
    const shutdownHarness = await startHarness();
    await shutdownHarness.close();
    assert.equal(shutdownHarness.exitCode, 0);
    assert.match(
      shutdownHarness.logs,
      /Received SIGTERM; shutting down gracefully\./,
    );
  },
);

test("development ignores untrusted forwarded IP headers", async (t) => {
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const result = await request(harness.baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.88" },
    body: { email: user.email, password: user.password },
  });
  assert.equal(result.response.status, 200);

  const { rows } = await getTestPool().query(
    "SELECT ip_address::text AS ip_address FROM auth_sessions WHERE id = $1",
    [result.data.session.id],
  );
  assert.notEqual(rows[0].ip_address, "203.0.113.88");
});

test("sensitive authentication routes return a clean 429 when limited", async () => {
  const limitedHarness = await startHarness({
    rateLimitOverrides: { LOGIN_RATE_LIMIT_MAX: "1" },
  });
  try {
    const options = {
      method: "POST",
      body: { email: "nobody@example.com", password: "incorrect" },
    };
    const first = await request(
      limitedHarness.baseUrl,
      "/api/auth/login",
      options,
    );
    const second = await request(
      limitedHarness.baseUrl,
      "/api/auth/login",
      options,
    );
    assert.equal(first.response.status, 401);
    assert.equal(second.response.status, 429);
    assert.equal(
      second.data.error,
      "Too many requests. Please try again later.",
    );
    assert.ok(second.response.headers.has("retry-after"));
  } finally {
    await limitedHarness.close();
  }
});

test("one registration request increments its PostgreSQL limiter once", async () => {
  const limiterHarness = await startHarness();
  try {
    const result = await request(limiterHarness.baseUrl, "/api/auth/register", {
      method: "POST",
      body: {},
    });
    assert.equal(result.response.status, 400);
    assert.doesNotMatch(limiterHarness.logs, /ERR_ERL_DOUBLE_COUNT/);

    const limiterKey = crypto
      .createHash("sha256")
      .update(
        `${limiterHarness.rateLimitNamespace}:REGISTRATION_RATE_LIMIT_MAX:${ipKeyGenerator("127.0.0.1")}`,
      )
      .digest("hex");
    const { rows } = await getTestPool().query(
      "SELECT hit_count FROM api_rate_limits WHERE limiter_key = $1",
      [limiterKey],
    );
    assert.equal(Number(rows[0]?.hit_count), 1);
  } finally {
    await limiterHarness.close();
  }
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

test("admin:create provisions a verified admin and refuses duplicate email", async () => {
  const email = `provision-${crypto.randomUUID()}@example.com`;
  const password = "Provision-Admin!8273x";
  let userId;

  const runAdminCreate = (env) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["src/scripts/createAdmin.js"], {
        cwd: process.cwd(),
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk.toString("utf8")));
      child.stderr.on("data", (chunk) => (output += chunk.toString("utf8")));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, output }));
    });

  try {
    const created = await runAdminCreate({
      ADMIN_EMAIL: email.toUpperCase(),
      ADMIN_PASSWORD: password,
    });
    assert.equal(created.code, 0, created.output);
    assert.equal(created.output.includes(password), false);

    const { rows } = await getTestPool().query(
      "SELECT id, email, role, email_verified, password_hash FROM users WHERE email = $1",
      [email],
    );
    assert.equal(rows.length, 1);
    userId = rows[0].id;
    assert.equal(rows[0].role, "admin");
    assert.equal(rows[0].email_verified, true);
    assert.notEqual(rows[0].password_hash, password);

    const duplicate = await runAdminCreate({
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: "Another-Admin!6249x",
    });
    assert.notEqual(duplicate.code, 0);
    assert.equal(duplicate.output.includes(password), false);

    const unchanged = await getTestPool().query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    assert.equal(unchanged.rows[0].password_hash, rows[0].password_hash);
  } finally {
    if (userId) {
      await getTestPool().query("DELETE FROM users WHERE id = $1", [userId]);
    }
  }
});

test("JWT_EXPIRES_IN controls access-token expiry", async (t) => {
  const expiryHarness = await startHarness({
    rateLimitOverrides: { JWT_EXPIRES_IN: "2m" },
  });
  t.after(() => expiryHarness.close());
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await request(expiryHarness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(login.response.status, 200);
  const [, encodedPayload] = login.data.token.split(".");
  const claims = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString(),
  );
  assert.equal(claims.exp - claims.iat, 120);
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

test(
  "development email verification uses the existing token flow safely",
  async (t) => {
    const developmentHarness = await startHarness({ nodeEnv: "development" });
    t.after(() => developmentHarness.close());

    const fixture = await createFixture(t);
    const unverifiedUser = await fixture.createUser("patient", {
      email: `dev-verify-${crypto.randomUUID()}@example.com`,
      emailVerified: false,
    });
    const rejectedCredentials = await request(
      developmentHarness.baseUrl,
      "/api/auth/dev/verify-email",
      {
        method: "POST",
        body: {
          email: unverifiedUser.email,
          id: unverifiedUser.id,
          token: "client-supplied-verification-token",
        },
      },
    );
    assert.equal(rejectedCredentials.response.status, 400);
    assert.doesNotMatch(
      JSON.stringify(rejectedCredentials.data),
      /client-supplied-verification-token/,
    );
    const unchangedUser = await getTestPool().query(
      "SELECT email_verified FROM users WHERE id = $1",
      [unverifiedUser.id],
    );
    assert.equal(unchangedUser.rows[0].email_verified, false);

    const verified = await request(
      developmentHarness.baseUrl,
      "/api/auth/dev/verify-email",
      {
        method: "POST",
        body: { email: unverifiedUser.email.toUpperCase() },
      },
    );
    assert.equal(verified.response.status, 200);
    assert.deepEqual(verified.data, {
      message: "Email verified successfully.",
    });

    const verifiedRow = await getTestPool().query(
      `SELECT
        email_verified,
        email_verification_token_hash,
        email_verification_expires_at
       FROM users
       WHERE id = $1`,
      [unverifiedUser.id],
    );
    assert.equal(verifiedRow.rows[0].email_verified, true);
    assert.equal(verifiedRow.rows[0].email_verification_token_hash, null);
    assert.equal(verifiedRow.rows[0].email_verification_expires_at, null);

    const alreadyVerifiedUser = await fixture.createUser("patient", {
      email: `dev-verified-${crypto.randomUUID()}@example.com`,
    });
    const alreadyVerified = await request(
      developmentHarness.baseUrl,
      "/api/auth/dev/verify-email",
      {
        method: "POST",
        body: { email: alreadyVerifiedUser.email },
      },
    );
    assert.equal(alreadyVerified.response.status, 200);
    assert.deepEqual(alreadyVerified.data, {
      message: "Email is already verified.",
    });

    const unknown = await request(
      developmentHarness.baseUrl,
      "/api/auth/dev/verify-email",
      {
        method: "POST",
        body: { email: `unknown-${crypto.randomUUID()}@example.com` },
      },
    );
    assert.equal(unknown.response.status, 404);
    assert.deepEqual(unknown.data, { error: "User not found" });

    for (const response of [verified.data, alreadyVerified.data, unknown.data]) {
      assert.doesNotMatch(
        JSON.stringify(response),
        /token|password|cookie|session/i,
      );
    }
  },
);

test(
  "email verification helper rejects non-development environments without modifying users",
  async (t) => {
    const fixture = await createFixture(t);
    const user = await fixture.createUser("patient", {
      email: `guard-verify-${crypto.randomUUID()}@example.com`,
      emailVerified: false,
    });
    const before = await getTestPool().query(
      `SELECT
        email_verified,
        email_verification_token_hash,
        email_verification_expires_at,
        password_hash
       FROM users
       WHERE id = $1`,
      [user.id],
    );
    const query = {
      method: "POST",
      body: { email: user.email },
    };

    const testEnvironment = await request(
      harness.baseUrl,
      "/api/auth/dev/verify-email",
      query,
    );
    assert.equal(testEnvironment.response.status, 404);
    assert.deepEqual(testEnvironment.data, { error: "Not found" });

    const productionHarness = await startHarness({ nodeEnv: "production" });
    t.after(() => productionHarness.close());
    const production = await request(
      productionHarness.baseUrl,
      "/api/auth/dev/verify-email",
      query,
    );
    assert.equal(production.response.status, 404);
    assert.deepEqual(production.data, { error: "Not found" });

    const unchanged = await getTestPool().query(
      `SELECT
        email_verified,
        email_verification_token_hash,
        email_verification_expires_at,
        password_hash
       FROM users
       WHERE id = $1`,
      [user.id],
    );
    assert.equal(unchanged.rows[0].email_verified, false);
    assert.equal(unchanged.rows[0].email_verification_token_hash, null);
    assert.equal(unchanged.rows[0].email_verification_expires_at, null);
    assert.equal(
      unchanged.rows[0].password_hash,
      before.rows[0].password_hash,
    );
    assert.doesNotMatch(
      JSON.stringify(production.data),
      /token|password|cookie|session/i,
    );
  },
);

test("production responses and logs never expose verification or reset tokens", async (t) => {
  const productionHarness = await startHarness({ nodeEnv: "production" });
  t.after(() => productionHarness.close());
  const fixture = await createFixture(t);
  const email = `production-${crypto.randomUUID()}@example.com`;
  const registration = await request(
    productionHarness.baseUrl,
    "/api/auth/register",
    {
      method: "POST",
      body: {
        email,
        password: "Unique-Production!7284",
        role: "patient",
        fullName: "Production Fixture",
      },
    },
  );
  assert.equal(registration.response.status, 201);
  fixture.trackUser(registration.data.user.id);
  assert.equal("verificationUrl" in registration.data, false);

  const forgot = await request(
    productionHarness.baseUrl,
    "/api/auth/forgot-password",
    { method: "POST", body: { email } },
  );
  assert.equal(forgot.response.status, 200);
  assert.equal("resetUrl" in forgot.data, false);
  assert.equal(
    forgot.data.message,
    "If that email address is registered, a password reset link has been sent.",
  );
  assert.doesNotMatch(
    productionHarness.logs,
    /Verification URL|Password Reset URL|[?&]token=[a-f0-9]{64}/i,
  );
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
  const independentLogin = await loginAccount(user.email, user.password);
  const replay = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: login.cookie,
  });
  assert.equal(replay.response.status, 401);
  const replacement = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: replacementCookie,
  });
  assert.equal(replacement.response.status, 401);
  const independent = await request(harness.baseUrl, "/api/auth/refresh", {
    method: "POST",
    cookie: independentLogin.cookie,
  });
  assert.equal(independent.response.status, 200);
});

test("production refresh and logout require a trusted frontend origin", async (t) => {
  const productionHarness = await startHarness({ nodeEnv: "production" });
  t.after(() => productionHarness.close());
  const fixture = await createFixture(t);
  const user = await fixture.createUser();
  const login = await request(productionHarness.baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  assert.equal(login.response.status, 200);
  const cookie = refreshCookie(login.response);

  const rejectedRefresh = await request(
    productionHarness.baseUrl,
    "/api/auth/refresh",
    {
      method: "POST",
      cookie,
      headers: { Origin: "https://attacker.example" },
    },
  );
  assert.equal(rejectedRefresh.response.status, 403);

  const allowedRefresh = await request(
    productionHarness.baseUrl,
    "/api/auth/refresh",
    {
      method: "POST",
      cookie,
      headers: { Origin: "http://localhost:5173" },
    },
  );
  assert.equal(allowedRefresh.response.status, 200);
  const rotatedCookie = refreshCookie(allowedRefresh.response);

  const rejectedLogout = await request(
    productionHarness.baseUrl,
    "/api/auth/logout",
    {
      method: "POST",
      cookie: rotatedCookie,
      headers: { Origin: "https://attacker.example" },
    },
  );
  assert.equal(rejectedLogout.response.status, 403);

  const allowedLogout = await request(
    productionHarness.baseUrl,
    "/api/auth/logout",
    {
      method: "POST",
      cookie: rotatedCookie,
      headers: { Origin: "http://localhost:5173" },
    },
  );
  assert.equal(allowedLogout.response.status, 200);
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
