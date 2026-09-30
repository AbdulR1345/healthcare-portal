import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getMigrationFiles() {
  const files = await fs.readdir(migrationsDir);

  return files.filter((file) => file.endsWith(".sql")).sort();
}

async function migrate() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const migrationFiles = await getMigrationFiles();

    if (migrationFiles.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const filename of migrationFiles) {
      const { rows } = await client.query(
        "SELECT id FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (rows.length > 0) {
        console.log(`Already applied: ${filename}`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(migrationPath, "utf8");

      console.log(`Applying migration: ${filename}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );

        await client.query("COMMIT");

        console.log(`Applied successfully: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Database migration failed:", error.code || "unknown");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
