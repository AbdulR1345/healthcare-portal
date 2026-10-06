import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertProductionEmailConfiguration,
  isConfigured,
  sendPasswordResetEmail,
  sendReminderEmail,
  sendVerificationEmail,
} from "../src/services/emailService.js";

async function withEnvironment(values, callback) {
  const previous = new Map(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function withCapturedLogs(callback) {
  const messages = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => messages.push(args.join(" "));
  console.error = (...args) => messages.push(args.join(" "));

  try {
    return { result: await callback(), logs: messages.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function withMockedFetch(fetchImplementation, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const configuredEnvironment = {
  NODE_ENV: "test",
  RESEND_API_KEY: "test-resend-api-key",
  EMAIL_FROM: "Healthcare Portal <noreply@example.test>",
};

test("Resend configuration loads from the root environment file", () => {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const childEnvironment = { ...process.env };
  delete childEnvironment.RESEND_API_KEY;
  delete childEnvironment.EMAIL_FROM;

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import("./src/services/emailService.js").then(({ isConfigured }) => console.log(isConfigured()))',
    ],
    {
      cwd: serverDir,
      env: { ...childEnvironment, FORCE_COLOR: "0", NO_COLOR: "1" },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "true");
});

test("missing Resend configuration skips delivery safely in development", async () => {
  await withEnvironment(
    {
      NODE_ENV: "development",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
    },
    async () => {
      const verificationUrl = "https://portal.test/verify?token=verify-secret";
      const { result, logs } = await withCapturedLogs(() =>
        sendVerificationEmail({
          to: "patient@example.test",
          fullName: "Test Patient",
          verificationUrl,
        }),
      );

      assert.deepEqual(result, {
        sent: false,
        reason: "resend_not_configured",
      });
      assert.equal(isConfigured(), false);
      assert.doesNotMatch(logs, /verify-secret|https:\/\/portal\.test/);
    },
  );
});

test("production configuration requires both Resend environment variables", async () => {
  await withEnvironment({ NODE_ENV: "production" }, async () => {
    for (const configuration of [
      { RESEND_API_KEY: undefined, EMAIL_FROM: undefined },
      { RESEND_API_KEY: "test-resend-api-key", EMAIL_FROM: undefined },
      { RESEND_API_KEY: undefined, EMAIL_FROM: "noreply@example.test" },
    ]) {
      await withEnvironment(configuration, async () => {
        assert.equal(isConfigured(), false);
        assert.throws(assertProductionEmailConfiguration, /RESEND_API_KEY/);
      });
    }

    await withEnvironment(configuredEnvironment, async () => {
      assert.equal(isConfigured(), true);
      assert.doesNotThrow(assertProductionEmailConfiguration);
    });
  });
});

test("verification email sends its existing URL through Resend", async () => {
  const verificationUrl =
    "https://portal.test/verify-email?token=existing-verification-token";
  let request;

  await withEnvironment(configuredEnvironment, () =>
    withMockedFetch(
      async (url, options) => {
        request = { url: String(url), body: JSON.parse(options.body) };
        return new Response(JSON.stringify({ id: "email-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      async () => {
        const result = await sendVerificationEmail({
          to: "patient@example.test",
          fullName: "Test Patient",
          verificationUrl,
        });
        assert.deepEqual(result, { sent: true });
      },
    ),
  );

  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.body.from, configuredEnvironment.EMAIL_FROM);
  assert.equal(request.body.to, "patient@example.test");
  assert.equal(request.body.subject, "Verify your Healthcare Portal email");
  assert.ok(request.body.text.includes(verificationUrl));
  assert.ok(request.body.html.includes(verificationUrl));
});

test("password reset email sends its existing reset URL through Resend", async () => {
  const resetUrl =
    "https://portal.test/reset-password?token=existing-reset-token";
  let body;

  await withEnvironment(configuredEnvironment, () =>
    withMockedFetch(
      async (_url, options) => {
        body = JSON.parse(options.body);
        return new Response(JSON.stringify({ id: "email-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      async () => {
        const result = await sendPasswordResetEmail({
          to: "patient@example.test",
          fullName: "Test Patient",
          resetUrl,
        });
        assert.deepEqual(result, { sent: true });
      },
    ),
  );

  assert.equal(body.subject, "Reset your Healthcare Portal password");
  assert.ok(body.text.includes(resetUrl));
  assert.ok(body.html.includes(resetUrl));
});

test("Resend failures return a safe result without logging secrets or URLs", async () => {
  const apiKey = "test-resend-private-key";
  const verificationUrl =
    "https://portal.test/verify-email?token=verification-token-secret";
  const resetUrl =
    "https://portal.test/reset-password?token=reset-token-secret";

  await withEnvironment(
    {
      ...configuredEnvironment,
      RESEND_API_KEY: apiKey,
    },
    () =>
      withMockedFetch(
        async () =>
          new Response(
            JSON.stringify({
              message: `${apiKey} ${verificationUrl} ${resetUrl}`,
            }),
            {
              status: 422,
              headers: { "Content-Type": "application/json" },
            },
          ),
        async () => {
          const { result, logs } = await withCapturedLogs(() =>
            sendVerificationEmail({
              to: "patient@example.test",
              fullName: "Test Patient",
              verificationUrl,
            }),
          );
          assert.deepEqual(result, {
            sent: false,
            reason: "resend_send_failed",
          });
          assert.doesNotMatch(
            logs,
            /test-resend-private-key|verification-token-secret|reset-token-secret|https:\/\/portal\.test/,
          );
        },
      ),
  );
});

test("appointment reminders preserve their content through Resend", async () => {
  const message =
    "Your appointment with Dr. Lee is scheduled for tomorrow at 10:00 AM.";
  let body;

  await withEnvironment(configuredEnvironment, () =>
    withMockedFetch(
      async (_url, options) => {
        body = JSON.parse(options.body);
        return new Response(JSON.stringify({ id: "email-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      async () => {
        const result = await sendReminderEmail(
          "patient@example.test",
          "Appointment reminder",
          message,
        );
        assert.deepEqual(result, { sent: true });
      },
    ),
  );

  assert.equal(body.subject, "Appointment reminder");
  assert.equal(body.text, message);
  assert.ok(body.html.includes(message));
});
