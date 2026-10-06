import { spawnSync } from "node:child_process";
import "../src/config/env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const serverDir = path.resolve(path.dirname(__filename), "..");

function databaseTarget(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("Database URLs must be valid PostgreSQL connection URLs.");
  }

  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }

  return {
    host: ["localhost", "127.0.0.1", "::1"].includes(
      parsed.hostname.toLowerCase(),
    )
      ? "loopback"
      : parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

function getTestDatabaseUrl() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required. Set it to a dedicated PostgreSQL database ending in _test; the test runner will not fall back to DATABASE_URL.",
    );
  }

  const testTarget = databaseTarget(testDatabaseUrl);
  if (!/(?:_|-)test$/i.test(testTarget.database)) {
    throw new Error(
      "TEST_DATABASE_URL database name must end in _test or -test.",
    );
  }

  if (process.env.DATABASE_URL) {
    const normalTarget = databaseTarget(process.env.DATABASE_URL);
    if (
      testTarget.host === normalTarget.host &&
      testTarget.port === normalTarget.port &&
      testTarget.database === normalTarget.database
    ) {
      throw new Error("TEST_DATABASE_URL must not point to DATABASE_URL.");
    }
  }

  return testDatabaseUrl;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: serverDir,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

let testDatabaseUrl;
try {
  testDatabaseUrl = getTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const setupEnv = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: testDatabaseUrl,
};

const migrationStatus = run(process.execPath, ["src/db/migrate.js"], setupEnv);
if (migrationStatus !== 0) process.exit(migrationStatus);

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
};
const nodeStatus = run(
  process.execPath,
  [
    "--test",
    ...process.argv.slice(2),
    "test/auth.test.js",
    "test/emailService.test.js",
    "test/appointments-slots.test.js",
    "test/documents-security-chat.test.js",
    "test/user-delete.test.js",
  ],
  testEnv,
);
if (nodeStatus !== 0) process.exit(nodeStatus);

const pythonStatus = run(
  process.env.PYTHON || "python",
  [
    "-m",
    "unittest",
    "discover",
    "-s",
    "../ai-service",
    "-p",
    "test_*.py",
    "-v",
  ],
  testEnv,
);
process.exitCode = pythonStatus;
