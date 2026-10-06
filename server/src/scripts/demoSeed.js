import bcrypt from "bcryptjs";
import pool from "../db/pool.js";

const DEMO_ACCOUNTS = [
  {
    email: "demo.patient@healthcare.local",
    password: "DemoPatient123!",
    role: "patient",
    fullName: "Demo Patient",
    phone: "555-0101",
  },
  {
    email: "demo.doctor@healthcare.local",
    password: "DemoDoctor123!",
    role: "doctor",
    fullName: "Demo Doctor",
    phone: "555-0102",
  },
];

class ReservedDemoEmailConflictError extends Error {}

async function findUsersByNormalizedEmail(client, email) {
  const { rows } = await client.query(
    `SELECT id, role, is_demo
     FROM users
     WHERE LOWER(BTRIM(email)) = $1
     FOR UPDATE`,
    [email],
  );

  return rows;
}

function assertDedicatedDemoAccount(user, email) {
  if (user.role === "admin") {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${email} belongs to an admin account; refusing to modify it.`,
    );
  }

  if (!user.is_demo) {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${email} belongs to a non-demo account; refusing to modify it.`,
    );
  }
}

async function ensureDemoUser(client, account) {
  const { email, password, role, fullName, phone } = account;
  const normalizedEmail = email.trim().toLowerCase();
  let existingUsers = await findUsersByNormalizedEmail(client, normalizedEmail);

  if (existingUsers.length > 1) {
    throw new ReservedDemoEmailConflictError(
      `Reserved demo email ${normalizedEmail} matches multiple accounts; refusing to modify them.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;

  if (existingUsers.length === 0) {
    const { rows } = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        role,
        full_name,
        phone,
        email_verified,
        is_demo
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, role, is_demo`,
      [normalizedEmail, passwordHash, role, fullName, phone],
    );
    user = rows[0];

    if (!user) {
      existingUsers = await findUsersByNormalizedEmail(client, normalizedEmail);
      if (existingUsers.length !== 1) {
        throw new Error(
          `Could not safely create the reserved demo account ${normalizedEmail}.`,
        );
      }
    }
  }

  if (!user) {
    const existingUser = existingUsers[0];
    assertDedicatedDemoAccount(existingUser, normalizedEmail);

    const { rows } = await client.query(
      `UPDATE users
       SET password_hash = $1,
           role = $2,
           full_name = $3,
           phone = $4,
           email_verified = TRUE,
           is_demo = TRUE
       WHERE id = $5
         AND is_demo = TRUE
         AND role <> 'admin'
       RETURNING id, email, role, is_demo`,
      [passwordHash, role, fullName, phone, existingUser.id],
    );

    if (!rows[0]) {
      throw new ReservedDemoEmailConflictError(
        `Reserved demo email ${normalizedEmail} could not be safely reconciled.`,
      );
    }

    user = rows[0];
  }

  if (role === "doctor") {
    await client.query(
      `INSERT INTO doctors (
        user_id,
        specialization,
        location,
        fee,
        experience_years,
        languages,
        bio
      )
      VALUES ($1, 'General Practice', 'Remote Demo', 100, 10, ARRAY['English'], 'Demo doctor account for recruiter-led portfolio review.')
      ON CONFLICT (user_id) DO UPDATE SET
        specialization = EXCLUDED.specialization,
        location = EXCLUDED.location,
        fee = EXCLUDED.fee,
        experience_years = EXCLUDED.experience_years,
        languages = EXCLUDED.languages,
        bio = EXCLUDED.bio`,
      [user.id],
    );
  }

  return user;
}

async function seedDemoAccounts() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(722026, 2)");

    for (const account of DEMO_ACCOUNTS) {
      await ensureDemoUser(client, account);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log("Demo accounts ensured successfully.");
}

try {
  await seedDemoAccounts();
} catch (error) {
  const message =
    error instanceof ReservedDemoEmailConflictError
      ? error.message
      : error.code || "unexpected error";
  console.error("Demo seed failed:", message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
