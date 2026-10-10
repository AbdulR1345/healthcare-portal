import "../config/env.js";
import pg from "pg";
import { getDatabasePoolConfig } from "./poolConfig.js";

const { Pool } = pg;

const pool = new Pool(getDatabasePoolConfig(process.env.DATABASE_URL));

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err.code || "unknown");
});

export default pool;
