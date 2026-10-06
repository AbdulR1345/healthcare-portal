import "../config/env.js";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export async function deleteUserByEmail(pool, email, { onUserFound } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("A non-empty email address is required.");
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const { rows } = await client.query(
      `SELECT id, email, role
       FROM users
       WHERE LOWER(BTRIM(email)) = $1
       FOR UPDATE`,
      [normalizedEmail],
    );

    if (rows.length > 1) {
      throw new Error("Multiple users match this normalized email.");
    }

    if (rows.length === 0) {
      await client.query("COMMIT");
      transactionStarted = false;
      return { exists: false, user: null };
    }

    const user = rows[0];
    onUserFound?.(user);
    if (!["patient", "doctor"].includes(user.role)) {
      throw new Error("Only patient or doctor accounts can be deleted.");
    }

    const result = await client.query("DELETE FROM users WHERE id = $1", [
      user.id,
    ]);
    if (result.rowCount !== 1) {
      throw new Error("The matched user could not be deleted.");
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return { exists: true, user };
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "Refusing to run: NODE_ENV must be explicitly set to development.",
    );
    process.exitCode = 1;
    return;
  }

  const emails = process.argv.slice(2);
  if (emails.length !== 1 || !normalizeEmail(emails[0])) {
    console.error("Usage: npm run user:delete -- <email>");
    process.exitCode = 1;
    return;
  }

  const { default: pool } = await import("../db/pool.js");
  try {
    const result = await deleteUserByEmail(pool, emails[0], {
      onUserFound(user) {
        console.log("User exists: yes");
        console.log(`User ID: ${user.id}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
      },
    });
    if (!result.exists) {
      console.log(`User exists: no (${normalizeEmail(emails[0])})`);
      return;
    }

    console.log("Account and related records deleted.");
  } catch (error) {
    console.error("User deletion failed; the transaction was rolled back.");
    if (error.code) console.error(`PostgreSQL error code: ${error.code}`);
    else console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  main().catch(() => {
    console.error("User deletion could not be started.");
    process.exitCode = 1;
  });
}
