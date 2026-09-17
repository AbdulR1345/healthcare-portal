const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../db/pool');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, fullName: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, role, fullName, phone, specialization, location, fee } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, full_name, phone`,
        [email, passwordHash, role, fullName, phone || null]
      );
      const user = rows[0];

      if (role === 'doctor') {
        await client.query(
          `INSERT INTO doctors (user_id, specialization, location, fee)
           VALUES ($1, $2, $3, $4)`,
          [user.id, specialization || 'General Practice', location || 'Remote', fee || 100]
        );
      }

      await client.query('COMMIT');
      const token = signToken(user);
      res.status(201).json({ user, token });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, role, full_name, phone FROM users WHERE email = $1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    delete user.password_hash;
    const token = signToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function getProfile(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, role, full_name, phone, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    let profile = rows[0];
    if (profile.role === 'doctor') {
      const { rows: docRows } = await pool.query(
        'SELECT * FROM doctors WHERE user_id = $1',
        [req.user.id]
      );
      profile.doctor = docRows[0] || null;
    }

    res.json(profile);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

module.exports = { register, login, getProfile };
