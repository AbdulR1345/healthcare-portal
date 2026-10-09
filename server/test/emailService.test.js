import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
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
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "test-resend-api-key",
  EMAIL_FROM: "Healthcare Portal <noreply@example.test>",
};

const smtpEnvironment = {
  NODE_ENV: "test",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "carepath@example.test",
  SMTP_PASS: "test-google-app-password",
  EMAIL_FROM: "Carepath <carepath@example.test>",
};

test("email configuration loads from the root environment file", () => {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const childEnvironment = { ...process.env };
  delete childEnvironment.EMAIL_PROVIDER;
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

test("production Resend configuration requires both provider environment variables", async () => {
  await withEnvironment(
    { NODE_ENV: "production", EMAIL_PROVIDER: "resend" },
    async () => {
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
    },
  );
});

test("production SMTP configuration requires credentials and matching sender", async () => {
  await withEnvironment(
    { NODE_ENV: "production", EMAIL_PROVIDER: "smtp" },
    async () => {
      for (const configuration of [
        {
          SMTP_HOST: undefined,
          SMTP_PORT: undefined,
          SMTP_SECURE: undefined,
          SMTP_USER: undefined,
          SMTP_PASS: undefined,
          EMAIL_FROM: undefined,
        },
        {
          ...smtpEnvironment,
          NODE_ENV: "production",
          SMTP_PASS: undefined,
        },
        {
          ...smtpEnvironment,
          NODE_ENV: "production",
          SMTP_PORT: "not-a-port",
        },
        {
          ...smtpEnvironment,
          NODE_ENV: "production",
          EMAIL_FROM: "Carepath <different@example.test>",
        },
      ]) {
        await withEnvironment(configuration, async () => {
          assert.equal(isConfigured(), false);
          assert.throws(assertProductionEmailConfiguration, /SMTP/);
        });
      }

      await withEnvironment(
        { ...smtpEnvironment, NODE_ENV: "production" },
        async () => {
          assert.equal(isConfigured(), true);
          assert.doesNotThrow(assertProductionEmailConfiguration);
        },
      );

      await withEnvironment(
        { EMAIL_PROVIDER: "unsupported" },
        async () => {
          assert.throws(
            assertProductionEmailConfiguration,
            /EMAIL_PROVIDER must be either resend or smtp/,
          );
        },
      );
    },
  );
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

test("SMTP sends verification email through a mocked Nodemailer transport", async () => {
  const verificationUrl =
    "https://portal.test/verify-email?token=existing-verification-token";
  const originalCreateTransport = nodemailer.createTransport;
  let transportOptions;
  let sentMessage;

  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      sendMail: async (message) => {
        sentMessage = message;
        return { messageId: "mock-email-id" };
      },
    };
  };

  try {
    await withEnvironment(smtpEnvironment, async () => {
      const result = await sendVerificationEmail({
        to: "patient@example.test",
        fullName: "Test Patient",
        verificationUrl,
      });
      assert.deepEqual(result, { sent: true });
    });
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }

  assert.deepEqual(transportOptions, {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpEnvironment.SMTP_USER,
      pass: smtpEnvironment.SMTP_PASS,
    },
  });
  assert.equal(sentMessage.from, smtpEnvironment.EMAIL_FROM);
  assert.equal(sentMessage.to, "patient@example.test");
  assert.equal(sentMessage.subject, "Verify your Healthcare Portal email");
  assert.ok(sentMessage.text.includes(verificationUrl));
  assert.ok(sentMessage.html.includes(verificationUrl));
});

test("SMTP failures never log credentials or email links", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  const failureEnvironment = {
    ...smtpEnvironment,
    SMTP_PASS: "different-test-google-app-password",
  };
  const verificationUrl =
    "https://portal.test/verify-email?token=verification-token-secret";
  nodemailer.createTransport = () => ({
    sendMail: async () => {
      throw new Error(`${failureEnvironment.SMTP_PASS} ${verificationUrl}`);
    },
  });

  try {
    await withEnvironment(failureEnvironment, async () => {
      const { result, logs } = await withCapturedLogs(() =>
        sendVerificationEmail({
          to: "patient@example.test",
          fullName: "Test Patient",
          verificationUrl,
        }),
      );
      assert.deepEqual(result, { sent: false, reason: "smtp_send_failed" });
      assert.doesNotMatch(
        logs,
        /different-test-google-app-password|verification-token-secret|https:\/\/portal\.test/,
      );
    });
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});
