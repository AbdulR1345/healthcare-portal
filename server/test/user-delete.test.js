import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deleteUserByEmail,
  normalizeEmail,
} from "../src/scripts/deleteUser.js";

function createFakePool({ rows = [], deleteError } = {}) {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith("SELECT")) return { rows };
      if (sql.startsWith("DELETE")) {
        if (deleteError) throw deleteError;
        return { rowCount: 1 };
      }
      return { rowCount: null };
    },
    release() {},
  };
  return {
    queries,
    connect: async () => client,
  };
}

test("normalizes email before lookup and deletes only a patient in a transaction", async () => {
  const user = {
    id: "user-id",
    email: "test@example.invalid",
    role: "patient",
  };
  const pool = createFakePool({ rows: [user] });

  assert.equal(
    normalizeEmail("  TEST@Example.Invalid "),
    "test@example.invalid",
  );
  const result = await deleteUserByEmail(pool, "  TEST@Example.Invalid ");

  assert.deepEqual(result, { exists: true, user });
  assert.equal(pool.queries[0].sql, "BEGIN");
  assert.match(pool.queries[1].sql, /LOWER\(BTRIM\(email\)\) = \$1/);
  assert.deepEqual(pool.queries[1].values, ["test@example.invalid"]);
  assert.equal(pool.queries[2].sql, "DELETE FROM users WHERE id = $1");
  assert.deepEqual(pool.queries[2].values, ["user-id"]);
  assert.equal(pool.queries[3].sql, "COMMIT");
});

test("commits cleanly when no matching user exists", async () => {
  const pool = createFakePool();

  const result = await deleteUserByEmail(pool, "missing@example.invalid");

  assert.deepEqual(result, { exists: false, user: null });
  assert.equal(pool.queries[0].sql, "BEGIN");
  assert.match(pool.queries[1].sql, /^SELECT/);
  assert.equal(pool.queries[2].sql, "COMMIT");
});

test("rolls back when deletion fails", async () => {
  const pool = createFakePool({
    rows: [{ id: "user-id", email: "test@example.invalid", role: "doctor" }],
    deleteError: new Error("foreign key restriction"),
  });

  await assert.rejects(
    deleteUserByEmail(pool, "test@example.invalid"),
    /foreign key restriction/,
  );
  assert.equal(pool.queries.at(-1).sql, "ROLLBACK");
});

test("refuses admin accounts and rolls back without deleting them", async () => {
  const pool = createFakePool({
    rows: [{ id: "admin-id", email: "admin@example.invalid", role: "admin" }],
  });

  await assert.rejects(
    deleteUserByEmail(pool, "admin@example.invalid"),
    /Only patient or doctor accounts/,
  );
  assert.equal(pool.queries.at(-1).sql, "ROLLBACK");
  assert.equal(
    pool.queries.some(({ sql }) => sql.startsWith("DELETE")),
    false,
  );
});
