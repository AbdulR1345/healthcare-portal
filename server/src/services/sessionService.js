import crypto from "node:crypto";
import pool from "../db/pool.js";

const REFRESH_TOKEN_TTL_DAYS = 30;

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRefreshTokenExpiry() {
  const expiry = new Date();

  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_TTL_DAYS);

  return expiry;
}

export async function createSession({ userId, userAgent, ipAddress }) {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = getRefreshTokenExpiry();

  const { rows } = await pool.query(
    `INSERT INTO auth_sessions (
      user_id,
      refresh_token_hash,
      expires_at,
      last_used_at,
      user_agent,
      ip_address
    )
    VALUES ($1, $2, $3, NOW(), $4, $5)
    RETURNING
      id,
      user_id,
      expires_at,
      created_at`,
    [userId, refreshTokenHash, expiresAt, userAgent || null, ipAddress || null],
  );

  return {
    refreshToken,
    session: rows[0],
  };
}

export async function rotateSession({ refreshToken, userAgent, ipAddress }) {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT
        id,
        user_id,
        expires_at,
        revoked_at
       FROM auth_sessions
       WHERE refresh_token_hash = $1
       LIMIT 1
       FOR UPDATE`,
      [refreshTokenHash],
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      return null;
    }

    const session = rows[0];

    if (
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      await client.query("ROLLBACK");
      return null;
    }

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

    const newExpiresAt = getRefreshTokenExpiry();

    const { rows: newRows } = await client.query(
      `INSERT INTO auth_sessions (
        user_id,
        refresh_token_hash,
        expires_at,
        last_used_at,
        user_agent,
        ip_address
      )
      VALUES ($1, $2, $3, NOW(), $4, $5)
      RETURNING
        id,
        user_id,
        expires_at,
        created_at`,
      [
        session.user_id,
        newRefreshTokenHash,
        newExpiresAt,
        userAgent || null,
        ipAddress || null,
      ],
    );

    await client.query(
      `UPDATE auth_sessions
       SET
         revoked_at = NOW(),
         replaced_by_session_id = $1,
         last_used_at = NOW()
       WHERE id = $2`,
      [newRows[0].id, session.id],
    );

    await client.query("COMMIT");

    return {
      userId: session.user_id,
      refreshToken: newRefreshToken,
      session: newRows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSession(refreshToken) {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const result = await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = NOW()
     WHERE refresh_token_hash = $1
       AND revoked_at IS NULL`,
    [refreshTokenHash],
  );

  return result.rowCount > 0;
}

export async function revokeAllUserSessions(userId) {
  await pool.query(
    `UPDATE auth_sessions
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId],
  );
}

export async function cleanupExpiredSessions() {
  await pool.query(
    `DELETE FROM auth_sessions
     WHERE expires_at < NOW()
        OR (
          revoked_at IS NOT NULL
          AND revoked_at < NOW() - INTERVAL '30 days'
        )`,
  );
}

export default {
  createSession,
  rotateSession,
  revokeSession,
  revokeAllUserSessions,
  cleanupExpiredSessions,
};
