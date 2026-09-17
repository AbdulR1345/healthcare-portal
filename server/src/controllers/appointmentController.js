const pool = require('../db/pool');

async function bookAppointment(req, res) {
  const { doctorId, appointmentDate, startTime, endTime, notes } = req.body;
  const patientId = req.user.id;

  if (!doctorId || !appointmentDate || !startTime || !endTime) {
    return res.status(400).json({ error: 'doctorId, appointmentDate, startTime, and endTime are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: conflict } = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND start_time = $3
       AND status != 'cancelled'
       FOR UPDATE`,
      [doctorId, appointmentDate, startTime]
    );

    if (conflict.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This slot is already booked. Please choose another time.' });
    }

    const { rows } = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
       RETURNING *`,
      [patientId, doctorId, appointmentDate, startTime, endTime, notes || null]
    );

    const appointment = rows[0];

    const reminderDate = new Date(`${appointmentDate}T${startTime}`);
    reminderDate.setDate(reminderDate.getDate() - 1);

    const { rows: doctorUser } = await client.query(
      `SELECT u.full_name FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = $1`,
      [doctorId]
    );

    await client.query(
      `INSERT INTO reminders (appointment_id, user_id, message, scheduled_for)
       VALUES ($1, $2, $3, $4)`,
      [
        appointment.id,
        patientId,
        `Your appointment with ${doctorUser[0]?.full_name || 'your doctor'} is scheduled for tomorrow at ${startTime.slice(0, 5)}`,
        reminderDate,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(appointment);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Double-booking prevented: slot unavailable' });
    }
    console.error('Book appointment error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  } finally {
    client.release();
  }
}

async function getMyAppointments(req, res) {
  try {
    let query;
    let params;

    if (req.user.role === 'doctor') {
      const { rows: doc } = await pool.query(
        'SELECT id FROM doctors WHERE user_id = $1',
        [req.user.id]
      );
      if (!doc.length) return res.json([]);

      query = `
        SELECT a.*, u.full_name AS patient_name, u.email AS patient_email,
               du.full_name AS doctor_name, d.specialization
        FROM appointments a
        JOIN users u ON u.id = a.patient_id
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users du ON du.id = d.user_id
        WHERE a.doctor_id = $1
        ORDER BY a.appointment_date DESC, a.start_time DESC
      `;
      params = [doc[0].id];
    } else {
      query = `
        SELECT a.*, du.full_name AS doctor_name, d.specialization, d.location
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users du ON du.id = d.user_id
        WHERE a.patient_id = $1
        ORDER BY a.appointment_date DESC, a.start_time DESC
      `;
      params = [req.user.id];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Get appointments error:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
}

async function updateAppointmentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const { rows: existing } = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Appointment not found' });

    const appt = existing[0];

    if (req.user.role === 'patient' && appt.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'doctor') {
      const { rows: doc } = await pool.query('SELECT id FROM doctors WHERE user_id = $1', [req.user.id]);
      if (!doc.length || doc[0].id !== appt.doctor_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { rows } = await pool.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
}

async function rescheduleAppointment(req, res) {
  const { id } = req.params;
  const { appointmentDate, startTime, endTime } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT * FROM appointments WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!existing.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appt = existing[0];
    if (appt.patient_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rows: conflict } = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND start_time = $3
       AND status != 'cancelled' AND id != $4`,
      [appt.doctor_id, appointmentDate, startTime, id]
    );

    if (conflict.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'New slot is unavailable' });
    }

    const { rows } = await client.query(
      `UPDATE appointments SET appointment_date = $1, start_time = $2, end_time = $3, status = 'scheduled'
       WHERE id = $4 RETURNING *`,
      [appointmentDate, startTime, endTime, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reschedule error:', err);
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  } finally {
    client.release();
  }
}

module.exports = {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
};
