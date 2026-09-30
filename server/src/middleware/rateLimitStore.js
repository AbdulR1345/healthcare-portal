import crypto from "node:crypto";
import pool from "../db/pool.js";

export default class PostgresRateLimitStore {
  constructor(name) {
    this.name = name;
    this.windowMs = 0;
    this.namespace = process.env.RATE_LIMIT_NAMESPACE || "";
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  getKey(key) {
    return crypto
      .createHash("sha256")
      .update(`${this.namespace}:${this.name}:${key}`)
      .digest("hex");
  }

  async increment(key) {
    const limiterKey = this.getKey(key);
    try {
      const { rows } = await pool.query(
        `INSERT INTO api_rate_limits (limiter_key, hit_count, reset_at)
         VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
         ON CONFLICT (limiter_key) DO UPDATE SET
           hit_count = CASE
             WHEN api_rate_limits.reset_at <= NOW() THEN 1
             ELSE api_rate_limits.hit_count + 1
           END,
           reset_at = CASE
             WHEN api_rate_limits.reset_at <= NOW()
               THEN NOW() + ($2 * INTERVAL '1 millisecond')
             ELSE api_rate_limits.reset_at
           END
         RETURNING hit_count, reset_at`,
        [limiterKey, this.windowMs],
      );
      return {
        totalHits: Number(rows[0].hit_count),
        resetTime: new Date(rows[0].reset_at),
      };
    } catch {
      const error = new Error("Rate-limit storage is unavailable");
      error.code = "RATE_LIMIT_STORE_UNAVAILABLE";
      error.status = 503;
      throw error;
    }
  }

  async decrement(key) {
    await pool.query(
      `UPDATE api_rate_limits
       SET hit_count = GREATEST(hit_count - 1, 0)
       WHERE limiter_key = $1`,
      [this.getKey(key)],
    );
  }

  async resetKey(key) {
    await pool.query("DELETE FROM api_rate_limits WHERE limiter_key = $1", [
      this.getKey(key),
    ]);
  }
}
