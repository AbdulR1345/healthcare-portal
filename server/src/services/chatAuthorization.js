import pool from "../db/pool.js";

export const MAX_MESSAGE_LENGTH = 5000;
export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 100;

export function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function getCareRelationship(userId, partnerId) {
  const { rows } = await pool.query(
    `SELECT a.id AS appointment_id
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users patient ON patient.id = a.patient_id AND patient.role = 'patient'
     JOIN users doctor ON doctor.id = d.user_id AND doctor.role = 'doctor'
     WHERE ((a.patient_id = $1 AND d.user_id = $2)
         OR (a.patient_id = $2 AND d.user_id = $1))
       AND a.status <> 'cancelled'
     ORDER BY (a.status IN ('scheduled', 'confirmed')) DESC,
              a.appointment_date DESC,
              a.created_at DESC
     LIMIT 1`,
    [userId, partnerId],
  );

  return rows[0] || null;
}

export function parseMessageLimit(value) {
  if (value === undefined) return DEFAULT_MESSAGE_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  if (limit < 1) return null;
  return Math.min(limit, MAX_MESSAGE_LIMIT);
}
