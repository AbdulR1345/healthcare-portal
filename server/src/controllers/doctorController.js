const pool = require('../db/pool');

async function searchDoctors(req, res) {
  const {
    specialization,
    location,
    maxFee,
    minExperience,
    language,
    dayOfWeek,
    search,
  } = req.query;

  try {
    let query = `
      SELECT d.*, u.full_name, u.email, u.phone
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (specialization) {
      query += ` AND LOWER(d.specialization) LIKE LOWER($${idx++})`;
      params.push(`%${specialization}%`);
    }
    if (location) {
      query += ` AND LOWER(d.location) LIKE LOWER($${idx++})`;
      params.push(`%${location}%`);
    }
    if (maxFee) {
      query += ` AND d.fee <= $${idx++}`;
      params.push(Number(maxFee));
    }
    if (minExperience) {
      query += ` AND d.experience_years >= $${idx++}`;
      params.push(Number(minExperience));
    }
    if (language) {
      query += ` AND $${idx++} = ANY(d.languages)`;
      params.push(language);
    }
    if (search) {
      query += ` AND (LOWER(u.full_name) LIKE LOWER($${idx}) OR LOWER(d.specialization) LIKE LOWER($${idx}))`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY d.rating DESC, d.experience_years DESC';

    const { rows } = await pool.query(query, params);

    if (dayOfWeek !== undefined) {
      const day = Number(dayOfWeek);
      const available = [];
      for (const doctor of rows) {
        const { rows: slots } = await pool.query(
          'SELECT * FROM doctor_availability WHERE doctor_id = $1 AND day_of_week = $2',
          [doctor.id, day]
        );
        if (slots.length) available.push({ ...doctor, availability: slots });
      }
      return res.json(available);
    }

    res.json(rows);
  } catch (err) {
    console.error('Search doctors error:', err);
    res.status(500).json({ error: 'Failed to search doctors' });
  }
}

async function getDoctorById(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.full_name, u.email, u.phone
       FROM doctors d JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Doctor not found' });

    const { rows: availability } = await pool.query(
      'SELECT * FROM doctor_availability WHERE doctor_id = $1 ORDER BY day_of_week',
      [req.params.id]
    );

    res.json({ ...rows[0], availability });
  } catch (err) {
    console.error('Get doctor error:', err);
    res.status(500).json({ error: 'Failed to fetch doctor' });
  }
}

async function getAvailableSlots(req, res) {
  const { doctorId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date query parameter required (YYYY-MM-DD)' });
  }

  try {
    const appointmentDate = new Date(date);
    const dayOfWeek = appointmentDate.getDay();

    const { rows: availability } = await pool.query(
      'SELECT * FROM doctor_availability WHERE doctor_id = $1 AND day_of_week = $2',
      [doctorId, dayOfWeek]
    );

    if (!availability.length) {
      return res.json({ slots: [] });
    }

    const { rows: booked } = await pool.query(
      `SELECT start_time, end_time FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND status != 'cancelled'`,
      [doctorId, date]
    );

    const bookedTimes = new Set(booked.map((b) => b.start_time));

    const slots = [];
    for (const avail of availability) {
      let current = parseTime(avail.start_time);
      const end = parseTime(avail.end_time);
      const duration = avail.slot_duration_minutes || 30;

      while (current + duration <= end) {
        const startStr = formatTime(current);
        const endStr = formatTime(current + duration);
        if (!bookedTimes.has(startStr)) {
          slots.push({ startTime: startStr, endTime: endStr });
        }
        current += duration;
      }
    }

    res.json({ date, slots });
  } catch (err) {
    console.error('Get slots error:', err);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
}

function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

async function aiAssistSearch(req, res) {
  const { query } = req.body;
  if (!query?.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const { rows: doctors } = await pool.query(`
      SELECT d.*, u.full_name, u.email, u.phone
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      ORDER BY d.rating DESC
    `);

    const aiUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/assist`;
    let result;

    try {
      const response = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), doctors }),
      });
      result = await response.json();
    } catch {
      result = fallbackAssist(query, doctors);
    }

    res.json(result);
  } catch (err) {
    console.error('AI assist error:', err);
    res.status(500).json({ error: 'AI assistant unavailable' });
  }
}

function fallbackAssist(query, doctors) {
  const q = query.toLowerCase();
  const suggestions = doctors.filter((d) => {
    const spec = (d.specialization || '').toLowerCase();
    const loc = (d.location || '').toLowerCase();
    const name = (d.full_name || '').toLowerCase();
    return q.split(' ').some((word) => word.length > 2 && (spec.includes(word) || loc.includes(word) || name.includes(word)));
  });

  return {
    query,
    response: suggestions.length
      ? `Found ${suggestions.length} doctor(s) matching "${query}"`
      : `No exact match for "${query}". Showing all available doctors.`,
    suggestions: suggestions.length ? suggestions.slice(0, 5) : doctors.slice(0, 5),
    disclaimer: 'This assistant helps you find appointments. It does not provide medical advice.',
  };
}

module.exports = { searchDoctors, getDoctorById, getAvailableSlots, aiAssistSearch };
