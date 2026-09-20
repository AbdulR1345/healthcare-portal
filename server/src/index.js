import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import pool from './db/pool.js';
import { sendReminderEmail } from './services/emailService.js';
import authRoutes from './routes/auth.js';
import doctorRoutes from './routes/doctors.js';
import appointmentRoutes from './routes/appointments.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, allowedOrigins[0]);
    }
  },
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'healthcare-portal-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  onlineUsers.set(socket.user.id, socket.id);

  socket.on('join_chat', ({ partnerId }) => {
    const room = [socket.user.id, partnerId].sort().join('-');
    socket.join(room);
  });

  socket.on('send_message', async ({ receiverId, content, appointmentId }) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, content, appointment_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [socket.user.id, receiverId, content, appointmentId || null]
      );

      const message = rows[0];
      const room = [socket.user.id, receiverId].sort().join('-');
      io.to(room).emit('new_message', { ...message, sender_name: socket.user.fullName });

      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket).emit('notification', {
          type: 'message',
          from: socket.user.fullName,
          preview: content.slice(0, 50),
        });
      }
    } catch (err) {
      console.error('Socket message error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('mark_read', async ({ senderId }) => {
    await pool.query(
      'UPDATE messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2',
      [socket.user.id, senderId]
    );
    const senderSocket = onlineUsers.get(senderId);
    if (senderSocket) {
      io.to(senderSocket).emit('messages_read', { by: socket.user.id });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.user.id);
  });
});

cron.schedule('0 * * * *', async () => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.email FROM reminders r
       JOIN users u ON u.id = r.user_id
       WHERE r.sent = false AND r.scheduled_for <= NOW()`
    );

    for (const reminder of rows) {
      console.log(`Reminder for ${reminder.email}: ${reminder.message}`);

      await sendReminderEmail(
        reminder.email,
        'Appointment Reminder — Healthcare Portal',
        reminder.message
      );

      await pool.query('UPDATE reminders SET sent = true WHERE id = $1', [reminder.id]);

      const userSocket = onlineUsers.get(reminder.user_id);
      if (userSocket) {
        io.to(userSocket).emit('notification', {
          type: 'reminder',
          message: reminder.message,
        });
      }
    }
  } catch (err) {
    console.error('Reminder cron error:', err);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Healthcare Portal API running on port ${PORT}`);
});

export { app, io };
