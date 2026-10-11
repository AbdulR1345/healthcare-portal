import pool from "../db/pool.js";

async function diagnoseClinicianCounts() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const { rows } = await pool.query(`
    SELECT u.role, u.is_demo, COUNT(*) AS clinician_profiles
    FROM doctors d
    JOIN users u ON u.id = d.user_id
    GROUP BY u.role, u.is_demo
    ORDER BY u.role, u.is_demo
  `);

  console.log(JSON.stringify(rows));
}

try {
  await diagnoseClinicianCounts();
} catch (error) {
  console.error(
    "Clinician count diagnostic failed; PostgreSQL error code:",
    error?.code || "unavailable",
  );
  process.exitCode = 1;
} finally {
  try {
    await pool.end();
  } catch (error) {
    console.error(
      "Database connection cleanup failed:",
      error?.code || "unknown database error",
    );
    process.exitCode = 1;
  }
}
