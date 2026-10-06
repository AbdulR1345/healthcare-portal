import { spawnSync } from "node:child_process";
import "../src/config/env.js";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const serverDir = path.dirname(path.dirname(__filename));

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (process.env.TEST_DATABASE_URL) {
    const result = spawnSync(process.execPath, ["test/run.js"], {
      cwd: serverDir,
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is required to derive a local test database.");
  }

  let normalUrl;
  try {
    normalUrl = new URL(process.env.DATABASE_URL);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const host = normalUrl.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    fail(
      "test:local only creates test databases on loopback PostgreSQL hosts.",
    );
  }
  if (!/^postgres(?:ql)?:$/.test(normalUrl.protocol)) {
    fail("DATABASE_URL must use PostgreSQL.");
  }

  const normalDatabase = decodeURIComponent(normalUrl.pathname.slice(1));
  if (!normalDatabase || /(?:_|-)test$/i.test(normalDatabase)) {
    fail("Set DATABASE_URL to the normal local database, not a test database.");
  }
  if (/prod/i.test(normalDatabase)) {
    fail(
      "Refusing to derive a test database from a production-named database.",
    );
  }

  const testDatabase = `${normalDatabase}_test`;
  if (!/^[a-zA-Z0-9_-]+$/.test(testDatabase)) {
    fail(
      "The local database name cannot be safely used to create a test database.",
    );
  }

  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await admin.connect();
    const { rows } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDatabase],
    );
    if (!rows.length) {
      await admin.query(`CREATE DATABASE "${testDatabase}"`);
    }
  } catch {
    fail(
      "Could not prepare the isolated local test database; no existing database was modified.",
    );
  } finally {
    await admin.end().catch(() => {});
  }

  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${testDatabase}`;
  const result = spawnSync(process.execPath, ["test/run.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      TEST_DATABASE_URL: testUrl.toString(),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(() => fail("Unable to run the isolated local test suite."));
