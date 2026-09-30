import pool from "../db/pool.js";

export async function searchDoctors(req, res) {
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

    if (maxFee !== undefined) {
      const fee = Number(maxFee);

      if (!Number.isFinite(fee) || fee < 0) {
        return res
          .status(400)
          .json({ error: "maxFee must be a valid non-negative number" });
      }

      query += ` AND d.fee <= $${idx++}`;
      params.push(fee);
    }

    if (minExperience !== undefined) {
      const experience = Number(minExperience);

      if (!Number.isFinite(experience) || experience < 0) {
        return res.status(400).json({
          error: "minExperience must be a valid non-negative number",
        });
      }

      query += ` AND d.experience_years >= $${idx++}`;
      params.push(experience);
    }

    if (language) {
      query += ` AND $${idx++} = ANY(d.languages)`;
      params.push(language);
    }

    if (search) {
      query += `
        AND (
          LOWER(u.full_name) LIKE LOWER($${idx})
          OR LOWER(d.specialization) LIKE LOWER($${idx})
        )
      `;
      params.push(`%${search}%`);
      idx++;
    }

    query += " ORDER BY d.rating DESC, d.experience_years DESC";

    const { rows } = await pool.query(query, params);

    if (dayOfWeek !== undefined) {
      const day = Number(dayOfWeek);

      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return res.status(400).json({
          error: "dayOfWeek must be an integer from 0 to 6",
        });
      }

      const available = [];

      for (const doctor of rows) {
        const { rows: availability } = await pool.query(
          `
            SELECT *
            FROM doctor_availability
            WHERE doctor_id = $1
              AND day_of_week = $2
            ORDER BY start_time
          `,
          [doctor.id, day],
        );

        if (availability.length) {
          available.push({
            ...doctor,
            availability,
          });
        }
      }

      return res.json(available);
    }

    res.json(rows);
  } catch (err) {
    console.error("Search doctors error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to search doctors" });
  }
}

export async function getDoctorById(req, res) {
  try {
    const { rows } = await pool.query(
      `
        SELECT d.*, u.full_name, u.email, u.phone
        FROM doctors d
        JOIN users u ON u.id = d.user_id
        WHERE d.id = $1
      `,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const { rows: availability } = await pool.query(
      `
        SELECT *
        FROM doctor_availability
        WHERE doctor_id = $1
        ORDER BY day_of_week, start_time
      `,
      [req.params.id],
    );

    res.json({
      ...rows[0],
      availability,
    });
  } catch (err) {
    console.error("Get doctor error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch doctor" });
  }
}

export async function getAvailableSlots(req, res) {
  const { doctorId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      error: "Date query parameter is required (YYYY-MM-DD)",
    });
  }

  if (!isValidDateString(date)) {
    return res.status(400).json({
      error: "Invalid date. Use YYYY-MM-DD",
    });
  }

  if (isPastDate(date)) {
    return res.status(400).json({
      error: "Cannot request appointment slots for a past date",
    });
  }

  try {
    const { rows: doctor } = await pool.query(
      `
        SELECT id
        FROM doctors
        WHERE id = $1
      `,
      [doctorId],
    );

    if (!doctor.length) {
      return res.status(404).json({
        error: "Doctor not found",
      });
    }

    /*
     * Calculate weekday from the calendar date itself rather than
     * new Date('YYYY-MM-DD').getDay(), which can be affected by
     * the server's timezone.
     *
     * PostgreSQL EXTRACT(DOW):
     * Sunday = 0
     * Monday = 1
     * ...
     * Saturday = 6
     */
    const { rows: weekdayRows } = await pool.query(
      `
        SELECT EXTRACT(DOW FROM $1::date)::integer AS day_of_week
      `,
      [date],
    );

    const dayOfWeek = weekdayRows[0].day_of_week;

    const { rows: availability } = await pool.query(
      `
        SELECT
          id,
          start_time,
          end_time,
          COALESCE(slot_duration_minutes, 30) AS slot_duration_minutes
        FROM doctor_availability
        WHERE doctor_id = $1
          AND day_of_week = $2
        ORDER BY start_time
      `,
      [doctorId, dayOfWeek],
    );

    if (!availability.length) {
      return res.json({
        doctorId,
        date,
        dayOfWeek,
        slots: [],
      });
    }

    /*
     * Get all non-cancelled appointments for this doctor/date.
     * We check actual time ranges later instead of only comparing
     * appointment start times.
     */
    const { rows: bookedAppointments } = await pool.query(
      `
        SELECT
          start_time,
          end_time
        FROM appointments
        WHERE doctor_id = $1
          AND appointment_date = $2
          AND status <> 'cancelled'
        ORDER BY start_time
      `,
      [doctorId, date],
    );

    const slots = [];
    const seenSlots = new Set();

    for (const availabilityWindow of availability) {
      const start = parseTime(availabilityWindow.start_time);
      const end = parseTime(availabilityWindow.end_time);
      const duration = Number(availabilityWindow.slot_duration_minutes);

      if (
        start === null ||
        end === null ||
        !Number.isInteger(duration) ||
        duration <= 0 ||
        end <= start
      ) {
        continue;
      }

      for (
        let current = start;
        current + duration <= end;
        current += duration
      ) {
        const slotStart = current;
        const slotEnd = current + duration;

        const startTime = formatTime(slotStart);
        const endTime = formatTime(slotEnd);

        const slotKey = `${startTime}-${endTime}`;

        if (seenSlots.has(slotKey)) {
          continue;
        }

        seenSlots.add(slotKey);

        const overlapsExistingAppointment = bookedAppointments.some(
          (appointment) => {
            const bookedStart = parseTime(appointment.start_time);
            const bookedEnd = parseTime(appointment.end_time);

            if (bookedStart === null || bookedEnd === null) {
              return false;
            }

            return slotStart < bookedEnd && slotEnd > bookedStart;
          },
        );

        if (!overlapsExistingAppointment) {
          slots.push({
            startTime,
            endTime,
            available: true,
          });
        }
      }
    }

    slots.sort((a, b) => {
      return parseTime(a.startTime) - parseTime(b.startTime);
    });

    res.json({
      doctorId,
      date,
      dayOfWeek,
      slotDurationMinutes: availability[0].slot_duration_minutes || 30,
      slots,
    });
  } catch (err) {
    console.error("Get slots error:", err.code || "unknown");
    res.status(500).json({
      error: "Failed to fetch available slots",
    });
  }
}

function isValidDateString(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isPastDate(date) {
  const today = new Date();

  const todayString =
    `${today.getFullYear()}-` +
    `${String(today.getMonth() + 1).padStart(2, "0")}-` +
    `${String(today.getDate()).padStart(2, "0")}`;

  return date < todayString;
}

function parseTime(timeValue) {
  if (!timeValue) {
    return null;
  }

  const parts = String(timeValue).split(":").map(Number);

  if (parts.length < 2) {
    return null;
  }

  const [hours, minutes] = parts;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

export async function aiAssistSearch(req, res) {
  const { query } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({
      error: "Query is required",
    });
  }

  try {
    const { rows: doctors } = await pool.query(`
      SELECT d.*, u.full_name, u.email, u.phone
      FROM doctors d
      JOIN users u ON u.id = d.user_id
      ORDER BY d.rating DESC
    `);

    const aiUrl = `${process.env.AI_SERVICE_URL || "http://localhost:8000"}/assist`;

    let result;

    try {
      const response = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AI_SERVICE_TOKEN
            ? { "X-AI-Service-Token": process.env.AI_SERVICE_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          query: query.trim(),
          doctors,
        }),
      });

      if (!response.ok) throw new Error("AI service request failed");
      result = await response.json();
    } catch {
      result = fallbackAssist(query, doctors);
    }

    res.json(result);
  } catch (err) {
    console.error("AI assist error:", err.code || "unknown");
    res.status(500).json({
      error: "AI assistant unavailable",
    });
  }
}

function fallbackAssist(query, doctors) {
  const q = query.toLowerCase();

  const suggestions = doctors.filter((doctor) => {
    const specialization = (doctor.specialization || "").toLowerCase();
    const location = (doctor.location || "").toLowerCase();
    const name = (doctor.full_name || "").toLowerCase();

    return q
      .split(/\s+/)
      .some(
        (word) =>
          word.length > 2 &&
          (specialization.includes(word) ||
            location.includes(word) ||
            name.includes(word)),
      );
  });

  return {
    query,
    response: suggestions.length
      ? `Found ${suggestions.length} doctor(s) matching "${query}"`
      : `No exact match for "${query}". Showing all available doctors.`,
    suggestions: suggestions.length
      ? suggestions.slice(0, 5)
      : doctors.slice(0, 5),
    disclaimer:
      "This assistant helps you find appointments. It does not provide medical advice.",
  };
}

export default {
  searchDoctors,
  getDoctorById,
  getAvailableSlots,
  aiAssistSearch,
};
