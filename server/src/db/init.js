import bcrypt from 'bcryptjs';
import pool from './pool.js';

const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  experience_years INT DEFAULT 0,
  languages TEXT[] DEFAULT '{}',
  bio TEXT,
  rating DECIMAL(3,2) DEFAULT 4.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT DEFAULT 30
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (doctor_id, appointment_date, start_time)
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  ai_summary JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_specialization ON doctors(specialization);
CREATE INDEX IF NOT EXISTS idx_doctors_location ON doctors(location);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);
`;

async function init() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Database schema initialized successfully.');

    const hash = await bcrypt.hash('password123', 10);

    await client.query(`
      INSERT INTO users (email, password_hash, role, full_name, phone)
      VALUES
        ('admin@healthcare.com', $1, 'admin', 'System Admin', '555-0000'),
        ('patient@demo.com', $1, 'patient', 'Jane Patient', '555-1001'),
        ('doctor@demo.com', $1, 'doctor', 'Dr. John Smith', '555-2001'),
        ('sarah.lee@demo.com', $1, 'doctor', 'Dr. Sarah Lee', '555-2002'),
        ('michael.chen@demo.com', $1, 'doctor', 'Dr. Michael Chen', '555-2003'),
        ('emily.davis@demo.com', $1, 'doctor', 'Dr. Emily Davis', '555-2004')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);

    const doctorSeeds = [
      { email: 'doctor@demo.com', specialization: 'Cardiology', location: 'New York, NY', fee: 150, years: 12, languages: ['English', 'Spanish'], bio: 'Board-certified cardiologist specializing in preventive heart care.', days: [1, 2, 3, 4, 5] },
      { email: 'sarah.lee@demo.com', specialization: 'Dermatology', location: 'Los Angeles, CA', fee: 120, years: 8, languages: ['English', 'Korean'], bio: 'Expert in skin conditions, cosmetic dermatology, and mole screening.', days: [1, 2, 3, 4, 5] },
      { email: 'michael.chen@demo.com', specialization: 'Pediatrics', location: 'Chicago, IL', fee: 100, years: 10, languages: ['English', 'Mandarin'], bio: 'Compassionate pediatrician focused on child wellness and vaccinations.', days: [1, 2, 3, 4, 5, 6] },
      { email: 'emily.davis@demo.com', specialization: 'Orthopedics', location: 'Houston, TX', fee: 175, years: 15, languages: ['English'], bio: 'Orthopedic surgeon specializing in sports injuries and joint replacement.', days: [1, 3, 4, 5] },
    ];

    for (const seed of doctorSeeds) {
      const { rows: userRows } = await client.query(
        'SELECT id FROM users WHERE email = $1', [seed.email]
      );
      if (!userRows.length) continue;

      await client.query(`
        INSERT INTO doctors (user_id, specialization, location, fee, experience_years, languages, bio)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO NOTHING
      `, [userRows[0].id, seed.specialization, seed.location, seed.fee, seed.years, seed.languages, seed.bio]);

      const { rows: docRows } = await client.query(
        'SELECT id FROM doctors WHERE user_id = $1', [userRows[0].id]
      );

      if (docRows.length) {
        for (const day of seed.days) {
          await client.query(`
            INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time)
            SELECT $1, $2, '09:00', '17:00'
            WHERE NOT EXISTS (
              SELECT 1 FROM doctor_availability WHERE doctor_id = $1 AND day_of_week = $2
            )
          `, [docRows[0].id, day]);
        }
      }
    }

    console.log('Seed data inserted. Demo credentials: password123');
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch((err) => {
  console.error('Database init failed:', err);
  process.exit(1);
});
