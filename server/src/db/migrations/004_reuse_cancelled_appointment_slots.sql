ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_doctor_id_appointment_date_start_time_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_active_doctor_slot
  ON appointments (doctor_id, appointment_date, start_time)
  WHERE status IN ('scheduled', 'confirmed', 'completed');