import bcrypt from "bcryptjs";
import pool from "../db/pool.js";
import { validateCredentials } from "../utils/credentialValidation.js";

async function createAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  }

  const { email, errors } = await validateCredentials(
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  );
  if (errors.length) {
    throw new Error(
      errors.map(({ path, msg }) => `${path}: ${msg}`).join("; "),
    );
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const { rowCount } = await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name, email_verified)
     VALUES ($1, $2, 'admin', 'System Administrator', TRUE)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, passwordHash],
  );

  if (!rowCount) {
    throw new Error(
      "An account with ADMIN_EMAIL already exists; no changes were made.",
    );
  }

  console.log("Administrator account created.");
}

try {
  await createAdmin();
} catch (error) {
  console.error(`Admin provisioning failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
