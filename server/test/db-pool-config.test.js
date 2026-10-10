import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { getDatabasePoolConfig } from "../src/db/poolConfig.js";

for (const [name, query] of [
  ["normal Render URL", ""],
  ["sslmode=disable", "?sslmode=disable"],
  ["sslmode=require", "?sslmode=require"],
]) {
  test(`Render PostgreSQL client enforces verified TLS for ${name}`, () => {
    const connectionString = `postgres://user:password@dpg-example-a.oregon-postgres.render.com/carepath${query}`;
    const client = new pg.Client(getDatabasePoolConfig(connectionString));
    const effectiveSsl = client.connectionParameters.ssl;

    assert.ok(effectiveSsl);
    assert.equal(effectiveSsl.rejectUnauthorized, true);
  });
}

test("Render PostgreSQL URLs use verified TLS and a bounded connection timeout", () => {
  const connectionString =
    "postgresql://user:password@dpg-example-a.oregon-postgres.render.com/carepath";
  const config = getDatabasePoolConfig(connectionString);

  assert.equal(config.connectionString, connectionString);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.connectionTimeoutMillis, 10_000);
});

test("non-Render PostgreSQL URLs retain their existing TLS behavior", () => {
  const connectionString = "postgresql://user:password@localhost/carepath";
  const config = getDatabasePoolConfig(connectionString);

  assert.equal(config.connectionString, connectionString);
  assert.equal(config.ssl, undefined);
  assert.equal(config.connectionTimeoutMillis, 10_000);
});

test("Render PostgreSQL URLs cannot disable verified TLS with URL parameters", () => {
  const config = getDatabasePoolConfig(
    "postgresql://user:password@dpg-example-a.oregon-postgres.render.com/carepath?sslmode=disable",
  );

  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});
