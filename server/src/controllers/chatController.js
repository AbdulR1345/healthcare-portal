const pool = require('../db/pool');

async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (partner_id)
         partner_id, partner_name, partner_role, last_message, last_at, unread_count
       FROM (
         SELECT
           CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS partner_id,
           u.full_name AS partner_name,
           u.role AS partner_role,
           m.content AS last_message,
           m.created_at AS last_at,
           (SELECT COUNT(*)::int FROM messages um
            WHERE um.receiver_id = $1 AND um.sender_id =
              CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
            AND um.is_read = false) AS unread_count
         FROM messages m
         JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END
         WHERE m.sender_id = $1 OR m.receiver_id = $1
         ORDER BY partner_id, m.created_at DESC
       ) sub
       ORDER BY partner_id, last_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

async function getMessages(req, res) {
  const { userId: partnerId } = req.params;
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC`,
      [userId, partnerId]
    );

    await pool.query(
      `UPDATE messages SET is_read = true
       WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false`,
      [userId, partnerId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

async function sendMessage(req, res) {
  const { receiverId, content, appointmentId } = req.body;

  if (!receiverId || !content?.trim()) {
    return res.status(400).json({ error: 'receiverId and content are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content, appointment_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, receiverId, content.trim(), appointmentId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

module.exports = { getConversations, getMessages, sendMessage };
