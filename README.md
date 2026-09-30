# AI-Powered Healthcare Appointment & Patient Portal

An full-stack healthcare platform where patients discover doctors, book appointments, upload medical documents, get AI summaries, and chat with providers — with role-based dashboards for patients, doctors, and admins.

---

## Portfolio Value

This project demonstrates production-grade skills across the entire stack:

| Skill Area                  | Implementation                                                                  |
| --------------------------- | ------------------------------------------------------------------------------- |
| **Full-Stack Development**  | React frontend + Node.js/Express API + Python FastAPI microservice              |
| **Authentication & RBAC**   | JWT + bcrypt with Patient, Doctor, and Admin roles                              |
| **Scheduling Logic**        | Slot generation, double-booking prevention (`UNIQUE` constraint + `FOR UPDATE`) |
| **Real-Time Communication** | Socket.IO chat with read status and live notifications                          |
| **Secure File Management**  | Multer uploads with type/size validation, role-based document access            |
| **AI Integration**          | FastAPI service for document summarization and appointment assistant            |
| **Database Design**         | PostgreSQL with normalized schema, indexes, and relational integrity            |
| **Dashboards**              | Patient, Doctor, and Admin views with analytics                                 |
| **Deployment-Ready**        | Environment configs for Vercel, Render/Railway, and PostgreSQL                  |

---

## Tech Stack

| Layer        | Technologies                         |
| ------------ | ------------------------------------ |
| Frontend     | HTML5, CSS3, JavaScript, React, Vite |
| Backend      | Node.js, Express.js                  |
| Database     | PostgreSQL                           |
| Auth         | JWT, bcrypt                          |
| AI Layer     | Python, FastAPI, LLM API (optional)  |
| File Storage | Local / Cloudinary-ready             |
| Real-Time    | Socket.IO                            |
| Deployment   | Vercel, Render/Railway               |

---

## Project Structure

```
healthcare-portal/
├── client/          # React app — DoctorCard, Appointment, DocumentUpload, Chat
├── server/          # Node/Express — routes, controllers, middleware, Socket.IO
├── ai-service/      # Python FastAPI — summarizer.py, assistant.py
└── README.md
```

---

## Features

### 1. User Authentication

- Roles: **Patient**, **Doctor**, **Admin**
- `POST /api/auth/register` · `POST /api/auth/login`

### 2. Doctor Search

Filter by specialization, location, availability, fee, experience, and language.

> Example query: _"Cardiologists available this Saturday"_

### 3. Appointment Booking

Select doctor → view slots → book / cancel / reschedule  
Statuses: `scheduled` → `confirmed` → `completed`

### 4. Doctor Dashboard

Today's appointments, patient info, consultation management.

### 5. Medical Document Upload

PDF, JPG, PNG with role-based access controls.

### 6. AI Document Summarization

Document → extract text → AI processing → plain-language summary  
Output: document type, key info, abnormal values, follow-up  
_Disclaimer: For informational purposes only._

### 7. Doctor–Patient Chat

Text messaging, read status, real-time notifications via Socket.IO.

### 8. Appointment Reminders

Automated reminders: _"Your appointment with Dr. X is scheduled for tomorrow at 10:00 AM"_

### 9. Patient Dashboard

Upcoming/previous appointments, documents, messages, reminders.

### 10. Admin Dashboard

Total patients, doctors, appointments, completion rate, popular specializations.

```
completionRate = (completedAppointments / totalAppointments) × 100
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker Desktop (recommended) or local PostgreSQL 14+
- Python 3.10+ (optional, for AI service)

### Option A — One-Command Setup (Windows)

```powershell
.\scripts\setup.ps1
```

This will:

1. Start PostgreSQL via Docker
2. Install server + client dependencies
3. Create `.env` files
4. Initialize schema and seed 4 demo doctors

### Option B — Manual Setup

```bash
# 1. Install root development tooling
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Server
cd server
cp .env.example .env          # DATABASE_URL already matches Docker defaults
npm install
npm run db:init
npm run dev                   # http://localhost:5000

# 4. Client (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173

# 5. AI Service (optional, new terminal)
cd ai-service
pip install -r requirements.txt
python main.py                # http://localhost:8000
```

### Run and Test from the Project Root

After setup, the client and API can be started together with:

```powershell
npm run dev
```

Run the complete local validation suite with:

```powershell
npm test
```

This checks all server JavaScript syntax, builds the production client, and compiles the AI service Python files. The API health check is available at `http://localhost:5000/api/health`.

To build only the frontend:

```powershell
npm run build
```

### Email Reminders (Optional)

Add SMTP credentials to `server/.env` to send real email reminders:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Healthcare Portal <noreply@healthcare.com>
```

Without SMTP, reminders still work via in-app Socket.IO notifications and console logs.

---

## Demo Credentials

| Role    | Email                | Password    |
| ------- | -------------------- | ----------- |
| Patient | patient@demo.com     | password123 |
| Doctor  | doctor@demo.com      | password123 |
| Admin   | admin@healthcare.com | password123 |

---

## API Endpoints

| Method | Endpoint                       | Description              |
| ------ | ------------------------------ | ------------------------ |
| POST   | `/api/auth/register`           | Register user            |
| POST   | `/api/auth/login`              | Login                    |
| GET    | `/api/auth/profile`            | Get profile              |
| GET    | `/api/doctors`                 | Search doctors           |
| POST   | `/api/doctors/assist`          | AI appointment assistant |
| GET    | `/api/doctors/:id`             | Doctor details           |
| GET    | `/api/doctors/:id/slots?date=` | Available slots          |
| GET    | `/api/appointments`            | List appointments        |
| POST   | `/api/appointments`            | Book appointment         |
| PATCH  | `/api/appointments/:id/status` | Update status            |
| POST   | `/api/documents/upload`        | Upload document          |
| POST   | `/api/documents/:id/summarize` | AI summary               |
| GET    | `/api/chat/conversations`      | Chat list                |
| POST   | `/api/chat`                    | Send message             |
| GET    | `/api/admin/stats`             | Admin analytics          |

---

## Key Engineering Challenges Solved

1. **Double-booking prevention** — DB unique constraint + transactional locking
2. **Role-based access control** — JWT middleware with role guards
3. **Sensitive document protection** — Upload validation + patient/doctor access rules
4. **Reliable scheduling** — Availability-based slot generation
5. **Secure file uploads** — Type whitelist, size limits
6. **Real-time messaging** — Socket.IO with auth and read receipts
7. **Patient data access controls** — Query-level filtering by role
8. **Responsible AI summaries** — Disclaimers + fallback when LLM unavailable
9. **DB query optimization** — Indexes on specialization, location, appointments
10. **Deployment-ready config** — `.env.example` files for all services

---

## Bonus Features

| Feature                                 | Status                       |
| --------------------------------------- | ---------------------------- |
| AI appointment assistant                | ✅ Live in doctor search     |
| Email/SMS reminders                     | ✅ Email via SMTP (optional) |
| Calendar sync · Payments · Video        | 🔜 Roadmap                   |
| PWA · Analytics · Digital prescriptions | 🔜 Roadmap                   |

---

## Deployment Guide

### Architecture

```
Vercel (React)  →  Render (Node API + AI)  →  Render PostgreSQL
```

### Step 1 — Deploy Database + Backend + AI (Render)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Blueprint**
3. Connect repo — Render reads `render.yaml` automatically
4. After deploy, open **healthcare-api** → **Shell** and run:
   ```bash
   npm run db:init
   ```
5. Set `CLIENT_URL` on the API service to your Vercel URL (after Step 2)

### Create the First Production Administrator

After the API has applied database migrations, open the **healthcare-api** Render Shell and run:

```bash
export ADMIN_EMAIL='admin@your-domain.example'
read -s -p 'Admin password: ' ADMIN_PASSWORD
echo
export ADMIN_PASSWORD
npm run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Use a unique password that meets the registration password rules. The command creates a verified admin only when the email does not already exist; it never prints the password.

### Step 2 — Deploy Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Import Project**
2. Set **Root Directory** to `client`
3. Add environment variable:
   ```
   VITE_API_URL=https://your-api.onrender.com
   ```
4. Deploy — Vercel uses `client/vercel.json` automatically

### Step 3 — Configure Environment Variables

**Render — healthcare-api**

| Variable           | Value                                                               |
| ------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`     | Auto from Render PostgreSQL                                         |
| `JWT_SECRET`       | Auto-generated                                                      |
| `CLIENT_URL`       | `https://your-app.vercel.app`                                       |
| `CLINIC_TIME_ZONE` | IANA timezone for clinic scheduling, for example `America/New_York` |
| `AI_SERVICE_URL`   | Auto from healthcare-ai service                                     |
| `SMTP_*`           | Optional email settings                                             |

The API defaults `CLINIC_TIME_ZONE` to UTC if unset. Rate-limit counters are stored in PostgreSQL and shared across API instances; the API start command applies their migration automatically. `/api/health` is a lightweight liveness check, while `/api/ready` verifies PostgreSQL availability and is used by Render.

**Render — healthcare-ai**

| Variable         | Value                      |
| ---------------- | -------------------------- |
| `OPENAI_API_KEY` | Your OpenAI key (optional) |

**Vercel — client**

| Variable       | Value                           |
| -------------- | ------------------------------- |
| `VITE_API_URL` | `https://your-api.onrender.com` |

### Docker (Alternative)

```bash
docker compose up -d                          # PostgreSQL only
docker build -t healthcare-api ./server       # Build API image
docker build -t healthcare-ai ./ai-service    # Build AI image
```

---

## License

MIT
