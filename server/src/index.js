import http from "node:http";
import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import pool from "./db/pool.js";
import {
  sendReminderEmail,
} from "./services/emailService.js";
import { assertProductionStorageConfiguration } from "./services/documentStorage.js";
import authRoutes from "./routes/auth.js";
import doctorRoutes from "./routes/doctors.js";
import appointmentRoutes from "./routes/appointments.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import {
  MAX_MESSAGE_LENGTH,
  getCareRelationship,
  isUuid,
} from "./services/chatAuthorization.js";
import { globalApiLimiter } from "./middleware/rateLimit.js";

const isProduction = process.env.NODE_ENV === "production";
assertProductionStorageConfiguration();
const jwtSecret = process.env.JWT_SECRET || "";
const isPlaceholderSecret =
  /your[-_ ]|change[-_ ]in[-_ ]production|changeme|placeholder|default|example|test/i.test(
    jwtSecret,
  );
const isWeakSecret = jwtSecret.length < 32 || new Set(jwtSecret).size < 8;

if (isProduction && (isWeakSecret || isPlaceholderSecret)) {
  throw new Error(
    "JWT_SECRET must be configured with a strong production value.",
  );
}

const app = express();
const server = http.createServer(app);
app.set("trust proxy", isProduction ? 1 : false);

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      return origin.replace(/\/+$/, "");
    }
  })
  .filter(Boolean);

const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : isProduction
      ? []
      : ["http://localhost:5173"];

if (isProduction && allowedOrigins.length === 0) {
  throw new Error(
    "CLIENT_URL must be configured with an allowed frontend origin in production.",
  );
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "healthcare-portal-api" });
});

app.get("/api/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ready", service: "healthcare-portal-api" });
  } catch (err) {
    console.error("Readiness check failed:", err.code || "unknown");
    return res.status(503).json({ error: "Service unavailable" });
  }
});

app.use("/api", globalApiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, _next) => {
  if (err.code === "RATE_LIMIT_STORE_UNAVAILABLE") {
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "Uploaded file exceeds the 10 MB limit" });
  }

  if (err.status === 415) {
    return res.status(415).json({ error: "Unsupported document file type" });
  }

  if (
    err.name === "MulterError" ||
    (req.is("multipart/form-data") && err.status !== 413)
  ) {
    return res.status(400).json({ error: "Malformed document upload" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  if (
    err.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && err.status === 400 && "body" in err)
  ) {
    return res.status(400).json({ error: "Malformed JSON request" });
  }

  console.error("Unhandled request error:", err.code || err.type || "unknown");
  return res.status(err.status || 500).json({ error: "Request failed" });
});

const onlineUsers = new Map();
const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (firstId, secondId) =>
  `conversation:${[firstId, secondId].sort().join(":")}`;

function acknowledge(callback, result) {
  if (typeof callback === "function") callback(result);
}

function reportSocketError(socket, callback, message) {
  const error = { ok: false, error: message };
  acknowledge(callback, error);
  socket.emit("chat_error", { error: message });
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (!isUuid(user.id) || !["patient", "doctor"].includes(user.role)) {
      return next(new Error("Invalid token"));
    }
    socket.user = user;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userSockets = onlineUsers.get(socket.user.id) || new Set();
  userSockets.add(socket.id);
  onlineUsers.set(socket.user.id, userSockets);
  socket.join(userRoom(socket.user.id));
  socket.data.chatRooms = new Map();

  socket.on("join_chat", async (payload = {}, callback) => {
    const partnerId = payload?.partnerId;
    if (!isUuid(partnerId) || partnerId === socket.user.id) {
      return reportSocketError(socket, callback, "Conversation not found");
    }

    try {
      const relationship = await getCareRelationship(socket.user.id, partnerId);
      if (!relationship) {
        return reportSocketError(socket, callback, "Conversation not found");
      }

      const room = conversationRoom(socket.user.id, partnerId);
      await socket.join(room);
      socket.data.chatRooms.set(room, partnerId);
      socket
        .to(room)
        .emit("presence", { userId: socket.user.id, online: true });
      acknowledge(callback, {
        ok: true,
        partnerOnline: (onlineUsers.get(partnerId)?.size || 0) > 0,
      });
      socket.emit("presence", {
        userId: partnerId,
        online: (onlineUsers.get(partnerId)?.size || 0) > 0,
      });
    } catch (error) {
      console.error(
        "Socket conversation authorization failed:",
        error.code || "unknown",
      );
      reportSocketError(socket, callback, "Unable to open conversation");
    }
  });

  socket.on("send_message", async (payload = {}, callback) => {
    const { receiverId, content } = payload || {};
    if (!isUuid(receiverId) || receiverId === socket.user.id) {
      return reportSocketError(socket, callback, "Conversation not found");
    }
    if (typeof content !== "string" || !content.trim()) {
      return reportSocketError(socket, callback, "Message content is required");
    }
    if (content.trim().length > MAX_MESSAGE_LENGTH) {
      return reportSocketError(
        socket,
        callback,
        "Message exceeds the maximum length",
      );
    }

    try {
      const relationship = await getCareRelationship(
        socket.user.id,
        receiverId,
      );
      if (!relationship) {
        return reportSocketError(socket, callback, "Conversation not found");
      }

      const room = conversationRoom(socket.user.id, receiverId);
      await socket.join(room);
      socket.data.chatRooms.set(room, receiverId);
      const { rows } = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, content, appointment_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          socket.user.id,
          receiverId,
          content.trim(),
          relationship.appointment_id,
        ],
      );

      const message = rows[0];
      io.to(room).emit("new_message", {
        ...message,
        sender_name: socket.user.fullName,
      });

      io.to(userRoom(receiverId)).emit("notification", {
        type: "message",
        from: socket.user.fullName,
      });
      acknowledge(callback, { ok: true, message });
    } catch (err) {
      console.error("Socket message error:", err.code || "unknown");
      reportSocketError(socket, callback, "Failed to send message");
    }
  });

  socket.on("mark_read", async (payload = {}, callback) => {
    const senderId = payload?.senderId;
    if (!isUuid(senderId) || senderId === socket.user.id) {
      return reportSocketError(socket, callback, "Conversation not found");
    }

    try {
      const relationship = await getCareRelationship(socket.user.id, senderId);
      if (!relationship) {
        return reportSocketError(socket, callback, "Conversation not found");
      }
      const room = conversationRoom(socket.user.id, senderId);
      await pool.query(
        `UPDATE messages SET is_read = true
         WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false`,
        [socket.user.id, senderId],
      );
      io.to(room).emit("messages_read", { by: socket.user.id });
      acknowledge(callback, { ok: true });
    } catch (error) {
      console.error("Socket mark-read error:", error.code || "unknown");
      reportSocketError(socket, callback, "Unable to update read status");
    }
  });

  for (const event of ["typing", "stop_typing"]) {
    socket.on(event, async (payload = {}, callback) => {
      const partnerId = payload?.partnerId;
      if (!isUuid(partnerId) || partnerId === socket.user.id) {
        return reportSocketError(socket, callback, "Conversation not found");
      }

      try {
        const relationship = await getCareRelationship(
          socket.user.id,
          partnerId,
        );
        if (!relationship) {
          return reportSocketError(socket, callback, "Conversation not found");
        }
        const room = conversationRoom(socket.user.id, partnerId);
        if (!socket.data.chatRooms.has(room)) {
          return reportSocketError(
            socket,
            callback,
            "Join the conversation first",
          );
        }
        socket.to(room).emit(event, { userId: socket.user.id });
        acknowledge(callback, { ok: true });
      } catch (error) {
        console.error(
          "Socket typing authorization failed:",
          error.code || "unknown",
        );
        reportSocketError(socket, callback, "Unable to update typing status");
      }
    });
  }

  socket.on("disconnect", () => {
    const sockets = onlineUsers.get(socket.user.id);
    sockets?.delete(socket.id);
    if (sockets?.size) return;
    onlineUsers.delete(socket.user.id);
    for (const [room] of socket.data.chatRooms) {
      socket
        .to(room)
        .emit("presence", { userId: socket.user.id, online: false });
    }
  });
});

const reminderTask = cron.schedule("0 * * * *", async () => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.email FROM reminders r
       JOIN users u ON u.id = r.user_id
       WHERE r.sent = false AND r.scheduled_for <= NOW()`,
    );

    for (const reminder of rows) {
      await sendReminderEmail(
        reminder.email,
        "Appointment Reminder — Healthcare Portal",
        reminder.message,
      );

      await pool.query("UPDATE reminders SET sent = true WHERE id = $1", [
        reminder.id,
      ]);

      io.to(userRoom(reminder.user_id)).emit("notification", {
        type: "reminder",
        message: reminder.message,
      });
    }

    await pool.query("DELETE FROM api_rate_limits WHERE reset_at < NOW()");
  } catch (err) {
    console.error("Reminder cron error:", err.code || "unknown");
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Healthcare Portal API running on port ${PORT}`);
});

let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully.`);
  reminderTask.stop();

  const forcedShutdown = setTimeout(() => {
    server.closeAllConnections();
    io.disconnectSockets(true);
    console.error("Graceful shutdown deadline exceeded.");
    process.exit(1);
  }, 10000);
  forcedShutdown.unref();

  try {
    await new Promise((resolve) => io.close(resolve));
    await pool.end();
    clearTimeout(forcedShutdown);
  } catch (error) {
    console.error("Graceful shutdown failed:", error.code || "unknown");
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export { app, io };
