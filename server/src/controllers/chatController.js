import pool from "../db/pool.js";
import {
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LENGTH,
  getCareRelationship,
  isUuid,
  parseMessageLimit,
} from "../services/chatAuthorization.js";

export async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `WITH partners AS (
         SELECT DISTINCT CASE
           WHEN a.patient_id = $1 THEN d.user_id
           ELSE a.patient_id
         END AS partner_id
         FROM appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN users patient ON patient.id = a.patient_id AND patient.role = 'patient'
         JOIN users doctor ON doctor.id = d.user_id AND doctor.role = 'doctor'
         WHERE a.status <> 'cancelled'
           AND (a.patient_id = $1 OR d.user_id = $1)
       )
       SELECT p.partner_id,
              u.full_name AS partner_name,
              u.role AS partner_role,
              latest.content AS last_message,
              latest.created_at AS last_at,
              (SELECT COUNT(*)::int FROM messages unread
               WHERE unread.receiver_id = $1
                 AND unread.sender_id = p.partner_id
                 AND unread.is_read = false) AS unread_count
       FROM partners p
       JOIN users u ON u.id = p.partner_id
       LEFT JOIN LATERAL (
         SELECT m.content, m.created_at
         FROM messages m
         WHERE (m.sender_id = $1 AND m.receiver_id = p.partner_id)
            OR (m.sender_id = p.partner_id AND m.receiver_id = $1)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1
       ) latest ON true
       ORDER BY latest.created_at DESC NULLS LAST, u.full_name`,
      [userId],
    );
    res.json(rows);
  } catch (err) {
    console.error("Get conversations error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
}

export async function getMessages(req, res) {
  const { userId: partnerId } = req.params;
  const userId = req.user.id;
  const limit = parseMessageLimit(req.query.limit);

  if (!isUuid(partnerId)) {
    return res.status(400).json({ error: "Invalid conversation participant" });
  }
  if (partnerId === userId) {
    return res.status(400).json({ error: "Cannot message yourself" });
  }
  const beforeId = req.query.before;
  if (beforeId !== undefined && !isUuid(beforeId)) {
    return res.status(400).json({ error: "Invalid message cursor" });
  }
  if (limit === null) {
    return res.status(400).json({ error: "Invalid message limit" });
  }

  try {
    const relationship = await getCareRelationship(userId, partnerId);
    if (!relationship) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { rows } = await pool.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
           OR (m.sender_id = $2 AND m.receiver_id = $1))
         AND ($4::uuid IS NULL OR (m.created_at, m.id) < (
           SELECT cursor.created_at, cursor.id
           FROM messages cursor
           WHERE cursor.id = $4
             AND ((cursor.sender_id = $1 AND cursor.receiver_id = $2)
               OR (cursor.sender_id = $2 AND cursor.receiver_id = $1))
         ))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      [userId, partnerId, limit, beforeId || null],
    );

    if (rows.length) {
      await pool.query(
        `UPDATE messages SET is_read = true
         WHERE id = ANY($1::uuid[]) AND receiver_id = $2 AND is_read = false`,
        [rows.map((message) => message.id), userId],
      );
    }

    res.json(rows.reverse());
  } catch (err) {
    console.error("Get messages error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch messages" });
  }
}

export async function sendMessage(req, res) {
  const { receiverId, content } = req.body;

  if (!isUuid(receiverId)) {
    return res.status(400).json({ error: "A valid receiverId is required" });
  }
  if (receiverId === req.user.id) {
    return res.status(400).json({ error: "Cannot message yourself" });
  }
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }
  if (content.trim().length > MAX_MESSAGE_LENGTH) {
    return res
      .status(400)
      .json({ error: "Message exceeds the maximum length" });
  }

  try {
    const relationship = await getCareRelationship(req.user.id, receiverId);
    if (!relationship) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content, appointment_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, receiverId, content.trim(), relationship.appointment_id],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Send message error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to send message" });
  }
}

export default { getConversations, getMessages, sendMessage };
