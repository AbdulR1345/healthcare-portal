import pool from "../db/pool.js";

const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
];

const ALLOWED_TRANSITIONS = {
  scheduled: {
    patient: ["cancelled"],
    doctor: ["confirmed", "cancelled"],
    admin: ["confirmed", "cancelled"],
  },
  confirmed: {
    patient: ["cancelled"],
    doctor: ["completed", "cancelled"],
    admin: ["completed", "cancelled"],
  },
  completed: {
    patient: [],
    doctor: [],
    admin: [],
  },
  cancelled: {
    patient: [],
    doctor: [],
    admin: [],
  },
};

const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || "UTC";
const clinicDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isValidTime(value) {
  return (
    typeof value === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
  );
}

function normalizeTime(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.length === 5 ? `${value}:00` : value;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isFutureAppointment(appointmentDate, startTime) {
  const localParts = Object.fromEntries(
    clinicDateTimeFormatter
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const localDate = `${localParts.year}-${localParts.month}-${localParts.day}`;
  const localTime = `${localParts.hour}:${localParts.minute}:${localParts.second}`;
  return (
    appointmentDate > localDate ||
    (appointmentDate === localDate && normalizeTime(startTime) > localTime)
  );
}

function isEndTimeAfterStartTime(startTime, endTime) {
  return (
    timeToMinutes(normalizeTime(endTime)) >
    timeToMinutes(normalizeTime(startTime))
  );
}

async function getDoctorIdForUser(userId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM doctors
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );

  return rows[0]?.id || null;
}

async function getAppointmentForAuthorization(appointmentId) {
  const { rows } = await pool.query(
    `SELECT
       a.*,
       d.user_id AS doctor_user_id
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.id = $1
     LIMIT 1`,
    [appointmentId],
  );

  return rows[0] || null;
}

function canAccessAppointment(user, appointment) {
  if (user.role === "admin") {
    return true;
  }

  if (user.role === "patient" && appointment.patient_id === user.id) {
    return true;
  }

  if (user.role === "doctor" && appointment.doctor_user_id === user.id) {
    return true;
  }

  return false;
}

/**
 * Validates that a requested appointment exactly matches
 * one of the doctor's configured availability slots.
 *
 * Returns:
 * {
 *   valid: boolean,
 *   error?: string
 * }
 */
async function validateDoctorAvailability(
  client,
  doctorId,
  appointmentDate,
  startTime,
  endTime,
) {
  const normalizedStartTime = normalizeTime(startTime);
  const normalizedEndTime = normalizeTime(endTime);

  const { rows } = await client.query(
    `SELECT
       day_of_week,
       start_time,
       end_time,
       COALESCE(slot_duration_minutes, 30) AS slot_duration_minutes
     FROM doctor_availability
     WHERE doctor_id = $1
       AND day_of_week = EXTRACT(DOW FROM $2::date)::int
       AND start_time <= $3::time
       AND end_time >= $4::time
     ORDER BY start_time`,
    [doctorId, appointmentDate, normalizedStartTime, normalizedEndTime],
  );

  if (!rows.length) {
    return {
      valid: false,
      error: "The requested time is outside the doctor's availability",
    };
  }

  const requestedStart = timeToMinutes(normalizedStartTime);
  const requestedEnd = timeToMinutes(normalizedEndTime);
  const requestedDuration = requestedEnd - requestedStart;

  for (const availability of rows) {
    const availabilityStart = timeToMinutes(
      normalizeTime(availability.start_time),
    );

    const availabilityEnd = timeToMinutes(normalizeTime(availability.end_time));

    const slotDuration = Number(availability.slot_duration_minutes);

    const startsOnSlotBoundary =
      (requestedStart - availabilityStart) % slotDuration === 0;

    const durationMatches = requestedDuration === slotDuration;

    const insideAvailability =
      requestedStart >= availabilityStart && requestedEnd <= availabilityEnd;

    if (startsOnSlotBoundary && durationMatches && insideAvailability) {
      return {
        valid: true,
      };
    }
  }

  return {
    valid: false,
    error: "The requested time is not a valid appointment slot",
  };
}

async function createReminder(
  client,
  appointmentId,
  patientId,
  doctorName,
  appointmentDate,
  startTime,
) {
  await client.query(
    `INSERT INTO reminders (
       appointment_id,
       user_id,
       message,
       scheduled_for
     )
    VALUES ($1, $2, $3, (($4::date + $5::time - INTERVAL '1 day') AT TIME ZONE $6))`,
    [
      appointmentId,
      patientId,
      `Your appointment with ${
        doctorName || "your doctor"
      } is scheduled for tomorrow at ${startTime.slice(0, 5)}`,
      appointmentDate,
      normalizeTime(startTime),
      CLINIC_TIME_ZONE,
    ],
  );
}

async function updateReminder(
  client,
  appointmentId,
  appointmentDate,
  startTime,
) {
  await client.query(
    `UPDATE reminders
     SET
       scheduled_for = (($1::date + $2::time - INTERVAL '1 day') AT TIME ZONE $4),
       sent = FALSE
     WHERE appointment_id = $3`,
    [
      appointmentDate,
      normalizeTime(startTime),
      appointmentId,
      CLINIC_TIME_ZONE,
    ],
  );
}

export async function bookAppointment(req, res) {
  const { doctorId, appointmentDate, startTime, endTime, notes } = req.body;

  const patientId = req.user.id;

  if (!doctorId || !appointmentDate || !startTime || !endTime) {
    return res.status(400).json({
      error: "doctorId, appointmentDate, startTime, and endTime are required",
    });
  }

  if (!isValidDate(appointmentDate)) {
    return res.status(400).json({
      error: "Invalid appointment date",
    });
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return res.status(400).json({
      error: "Invalid appointment time",
    });
  }

  const normalizedStartTime = normalizeTime(startTime);
  const normalizedEndTime = normalizeTime(endTime);

  if (!isEndTimeAfterStartTime(normalizedStartTime, normalizedEndTime)) {
    return res.status(400).json({
      error: "endTime must be after startTime",
    });
  }

  if (!isFutureAppointment(appointmentDate, normalizedStartTime)) {
    return res.status(400).json({
      error: "Appointment must be scheduled for a future time",
    });
  }

  if (
    typeof notes !== "undefined" &&
    notes !== null &&
    typeof notes !== "string"
  ) {
    return res.status(400).json({
      error: "Notes must be a string",
    });
  }

  if (typeof notes === "string" && notes.length > 5000) {
    return res.status(400).json({
      error: "Notes must be 5000 characters or fewer",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: doctorRows } = await client.query(
      `SELECT
         d.id,
         u.full_name AS doctor_name
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1
       LIMIT 1`,
      [doctorId],
    );

    if (!doctorRows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Doctor not found",
      });
    }

    const doctor = doctorRows[0];

    const availability = await validateDoctorAvailability(
      client,
      doctorId,
      appointmentDate,
      normalizedStartTime,
      normalizedEndTime,
    );

    if (!availability.valid) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: availability.error,
      });
    }

    const { rows: conflict } = await client.query(
      `SELECT id
       FROM appointments
       WHERE doctor_id = $1
         AND appointment_date = $2
         AND status != 'cancelled'
         AND start_time < $4::time
         AND end_time > $3::time
       FOR UPDATE`,
      [doctorId, appointmentDate, normalizedStartTime, normalizedEndTime],
    );

    if (conflict.length) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "This slot is already booked. Please choose another time.",
      });
    }

    const { rows } = await client.query(
      `INSERT INTO appointments (
         patient_id,
         doctor_id,
         appointment_date,
         start_time,
         end_time,
         notes,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
       RETURNING
         id,
         patient_id,
         doctor_id,
         appointment_date::text AS appointment_date,
         start_time,
         end_time,
         status,
         notes,
         created_at`,
      [
        patientId,
        doctorId,
        appointmentDate,
        normalizedStartTime,
        normalizedEndTime,
        notes?.trim() || null,
      ],
    );

    const appointment = rows[0];

    await createReminder(
      client,
      appointment.id,
      patientId,
      doctor.doctor_name,
      appointmentDate,
      normalizedStartTime,
    );

    await client.query("COMMIT");

    return res.status(201).json(appointment);
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23505") {
      return res.status(409).json({
        error: "Double-booking prevented: slot unavailable",
      });
    }

    console.error("Book appointment error:", err.code || "unknown");

    return res.status(500).json({
      error: "Failed to book appointment",
    });
  } finally {
    client.release();
  }
}

export async function getMyAppointments(req, res) {
  try {
    if (req.user.role === "admin") {
      const { rows } = await pool.query(
        `SELECT
           a.id,
           a.patient_id,
           a.doctor_id,
           a.appointment_date::text AS appointment_date,
           a.start_time,
           a.end_time,
           a.status,
           a.notes,
           a.created_at,
           pu.full_name AS patient_name,
           pu.email AS patient_email,
           du.full_name AS doctor_name,
           d.specialization,
           d.location
         FROM appointments a
         JOIN users pu ON pu.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
         JOIN users du ON du.id = d.user_id
         ORDER BY
           a.appointment_date DESC,
           a.start_time DESC`,
      );

      return res.json(rows);
    }

    if (req.user.role === "doctor") {
      const doctorId = await getDoctorIdForUser(req.user.id);

      if (!doctorId) {
        return res.json([]);
      }

      const { rows } = await pool.query(
        `SELECT
           a.id,
           a.patient_id,
           a.doctor_id,
           a.appointment_date::text AS appointment_date,
           a.start_time,
           a.end_time,
           a.status,
           a.notes,
           a.created_at,
           u.full_name AS patient_name,
           u.email AS patient_email,
           du.full_name AS doctor_name,
           d.specialization,
           d.location
         FROM appointments a
         JOIN users u ON u.id = a.patient_id
         JOIN doctors d ON d.id = a.doctor_id
         JOIN users du ON du.id = d.user_id
         WHERE a.doctor_id = $1
         ORDER BY
           a.appointment_date DESC,
           a.start_time DESC`,
        [doctorId],
      );

      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT
         a.id,
         a.patient_id,
         a.doctor_id,
         a.appointment_date::text AS appointment_date,
         a.start_time,
         a.end_time,
         a.status,
         a.notes,
         a.created_at,
         du.full_name AS doctor_name,
         d.specialization,
         d.location
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       WHERE a.patient_id = $1
       ORDER BY
         a.appointment_date DESC,
         a.start_time DESC`,
      [req.user.id],
    );

    return res.json(rows);
  } catch (err) {
    console.error("Get appointments error:", err.code || "unknown");

    return res.status(500).json({
      error: "Failed to fetch appointments",
    });
  }
}

export async function updateAppointmentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!APPOINTMENT_STATUSES.includes(status)) {
    return res.status(400).json({
      error: "Invalid status",
    });
  }

  try {
    const appointment = await getAppointmentForAuthorization(id);

    if (!appointment) {
      return res.status(404).json({
        error: "Appointment not found",
      });
    }

    if (!canAccessAppointment(req.user, appointment)) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const allowedTransitions =
      ALLOWED_TRANSITIONS[appointment.status]?.[req.user.role] || [];

    if (!allowedTransitions.includes(status)) {
      return res.status(409).json({
        error: `Cannot change appointment from ${appointment.status} to ${status}`,
      });
    }

    const { rows } = await pool.query(
      `UPDATE appointments
       SET status = $1
       WHERE id = $2
         AND status = $3
       RETURNING
         id,
         patient_id,
         doctor_id,
         appointment_date::text AS appointment_date,
         start_time,
         end_time,
         status,
         notes,
         created_at`,
      [status, id, appointment.status],
    );

    if (!rows.length) {
      return res.status(409).json({
        error: "Appointment status changed before this request completed",
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("Update appointment error:", err.code || "unknown");

    return res.status(500).json({
      error: "Failed to update appointment",
    });
  }
}

export async function rescheduleAppointment(req, res) {
  const { appointmentDate, startTime, endTime } = req.body;

  const { id } = req.params;

  if (!appointmentDate || !startTime || !endTime) {
    return res.status(400).json({
      error: "appointmentDate, startTime, and endTime are required",
    });
  }

  if (!isValidDate(appointmentDate)) {
    return res.status(400).json({
      error: "Invalid appointment date",
    });
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return res.status(400).json({
      error: "Invalid appointment time",
    });
  }

  const normalizedStartTime = normalizeTime(startTime);
  const normalizedEndTime = normalizeTime(endTime);

  if (!isEndTimeAfterStartTime(normalizedStartTime, normalizedEndTime)) {
    return res.status(400).json({
      error: "endTime must be after startTime",
    });
  }

  if (!isFutureAppointment(appointmentDate, normalizedStartTime)) {
    return res.status(400).json({
      error: "Appointment must be scheduled for a future time",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      `SELECT
         a.*,
         d.user_id AS doctor_user_id
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE a.id = $1
       FOR UPDATE`,
      [id],
    );

    if (!existing.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Appointment not found",
      });
    }

    const appointment = existing[0];

    const isPatientOwner =
      req.user.role === "patient" && appointment.patient_id === req.user.id;

    const isAdmin = req.user.role === "admin";

    if (!isPatientOwner && !isAdmin) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        error: "Access denied",
      });
    }

    if (!["scheduled", "confirmed"].includes(appointment.status)) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "Only scheduled or confirmed appointments can be rescheduled",
      });
    }

    const availability = await validateDoctorAvailability(
      client,
      appointment.doctor_id,
      appointmentDate,
      normalizedStartTime,
      normalizedEndTime,
    );

    if (!availability.valid) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: availability.error,
      });
    }

    const { rows: conflict } = await client.query(
      `SELECT id
       FROM appointments
       WHERE doctor_id = $1
         AND appointment_date = $2
         AND status != 'cancelled'
         AND id != $4
         AND start_time < $5::time
         AND end_time > $3::time
       FOR UPDATE`,
      [
        appointment.doctor_id,
        appointmentDate,
        normalizedStartTime,
        id,
        normalizedEndTime,
      ],
    );

    if (conflict.length) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "New slot is unavailable",
      });
    }

    const { rows } = await client.query(
      `UPDATE appointments
       SET
         appointment_date = $1,
         start_time = $2,
         end_time = $3,
         status = 'scheduled'
       WHERE id = $4
       RETURNING
         id,
         patient_id,
         doctor_id,
         appointment_date::text AS appointment_date,
         start_time,
         end_time,
         status,
         notes,
         created_at`,
      [appointmentDate, normalizedStartTime, normalizedEndTime, id],
    );

    await updateReminder(client, id, appointmentDate, normalizedStartTime);

    await client.query("COMMIT");

    return res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23505") {
      return res.status(409).json({
        error: "New slot is unavailable",
      });
    }

    console.error("Reschedule error:", err.code || "unknown");

    return res.status(500).json({
      error: "Failed to reschedule appointment",
    });
  } finally {
    client.release();
  }
}

export default {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
};
