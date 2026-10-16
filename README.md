# Carepath — Healthcare Appointment & Patient Portal

A full-stack portfolio/demo application where patients discover clinicians,
book appointments, upload medical documents, request summaries, and chat with
providers. It is not a certified clinical system; summaries are informational
only and do not provide medical advice, diagnosis, or treatment.

---

## Portfolio Value

This project demonstrates full-stack engineering across the following areas:

| Skill Area                  | Implementation                                                                  |
| --------------------------- | ------------------------------------------------------------------------------- |
| **Full-Stack Development**  | React frontend + Node.js/Express API + Python FastAPI microservice              |
| **Authentication & RBAC**   | JWT + bcrypt with Patient, Doctor, and Admin roles                              |
| **Scheduling Logic**        | Slot generation, double-booking prevention (`UNIQUE` constraint + `FOR UPDATE`) |
| **Real-Time Communication** | Socket.IO chat with read status and live notifications                          |
| **Private File Management** | Validated uploads, authorization checks, local development storage, private S3 in production |
| **AI Integration**          | Optional FastAPI service; rule-based fallback when the LLM is unavailable       |
| **Database Design**         | PostgreSQL with normalized schema, indexes, and relational integrity            |
| **Dashboards**              | Patient, Doctor, and Admin views with analytics                                 |
| **Deployment Configuration**| Vercel frontend, Render API/AI service, and PostgreSQL                           |

---

## Tech Stack

| Layer        | Technologies                         |
| ------------ | ------------------------------------ |
| Frontend     | HTML5, CSS3, JavaScript, React, Vite |
| Backend      | Node.js, Express.js                  |
| Database     | PostgreSQL                           |
| Auth         | JWT, bcrypt                          |
| AI Layer     | Python, FastAPI, LLM API (optional)  |
| File Storage | Local development / private S3 production |
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

Search doctors by name or specialty, review clinician profiles, and choose from
live available dates and times. Patients can book, cancel, or reschedule
appointments; appointment views separate upcoming, past, completed, and
cancelled visits.

Statuses: `scheduled` → `confirmed` → `completed` (or `cancelled`)

### 4. Doctor Dashboard

Today's appointments, patient info, consultation management.

### 5. Medical Document Upload

PDF, JPG, PNG with role-based access controls. Local filesystem storage is for
development only; production requires configured private S3-compatible storage.

### 6. AI Document Summarization

Document → extract text → optional LLM processing or rule-based fallback → summary
Output: document type, key info, abnormal values, follow-up  
_Disclaimer: For informational purposes only._

### 7. Doctor–Patient Chat

Text messaging, read status, real-time notifications via Socket.IO.

### 8. Appointment Reminders

Hourly reminder processing; email delivery requires a configured, working
Resend or SMTP provider. Undelivered reminders remain pending for retry.

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

- Node.js 20+
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
4. Initialize the local schema, apply migrations, and create synthetic demo data

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
npm run db:migrate
npm run demo:seed             # optional synthetic fixtures; local/non-production only
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

Run the repository's syntax/build/compile checks with:

```powershell
npm test
```

This checks server JavaScript syntax, builds the frontend, and compiles the AI
service Python files. It does not run the PostgreSQL-backed integration tests or
the Python unit tests.

To build only the frontend:

```powershell
npm run build
```

The backend integration suite requires a local PostgreSQL service. From the
project root, `npm run test:local` verifies that `DATABASE_URL` points to a
loopback host and creates/uses a separate database ending in `_test`; an
explicit `TEST_DATABASE_URL` is also required to be loopback and not
production-named. It never falls back to a remote or production database. The
test runner applies migrations to that isolated database and runs backend
integration tests and AI Python unit tests. To run only the Python unit tests, use
`npm --prefix server run test:ai`. There is no dedicated frontend unit-test
suite; `npm run build` is its available production-build check.

`npm run db:init` is local-development-only and refuses non-loopback or
production-named database targets. Follow it with `npm run db:migrate` to apply
the current schema. The development server itself does not run migrations.

### Transactional Email

The API supports Resend and SMTP. `EMAIL_PROVIDER` defaults to `resend`; set it to `smtp` to use a dedicated Gmail account for optional verification, password-reset, and appointment reminder emails. New accounts can sign in immediately without verifying their email.

For a Gmail SMTP setup, enable 2-Step Verification on the dedicated account and create a Google App Password. Use the App Password, not the account password; remove any spaces Google inserts when displaying it. Configure these values in `server/.env` for local use or in the Render API service environment for production:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-carepath-gmail@gmail.com
SMTP_PASS=your-google-app-password
EMAIL_FROM=Carepath <your-carepath-gmail@gmail.com>
```

`EMAIL_FROM` must use the same email address as `SMTP_USER`. Keep all SMTP credentials server-side; never put them in `client/.env`, Vite variables, or frontend code. For Resend, set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to a sender address accepted by your Resend account. Email settings are optional for application startup and sign-in; when missing or unavailable, the API continues to allow registration and login, but verification, password-reset, and reminder emails cannot be delivered. Email verification remains available as an optional feature. Password resets still require a verified email address.

---

## Demo Access

The portfolio deployment can enable approved demo sessions without weakening production authentication. Demo access is intentionally limited to the `patient` and `doctor` roles and is unavailable unless `DEMO_MODE_ENABLED=true`. Seeded demo accounts are also blocked from normal email/password login unless demo mode is enabled; non-demo accounts continue to use normal login.

- Use `npm run demo:seed` only against a dedicated local loopback database
  to create or refresh the synthetic demo patient and
  four synthetic clinician profiles (General Practice, Cardiology,
  Dermatology, and Pediatrics). The seed is repeatable and refuses to modify a
  reserved demo email that belongs to a non-demo or admin account. It does not
  reset the database. If a reserved demo appointment slot has non-seed data, the
  transaction fails rather than overwriting that appointment.
- Never run demo seeding against a live patient/production database. The seed
  creates synthetic demo users, appointments, a document, reminders, and chat
  messages. The frontend does not receive demo passwords or login credentials.
- `npm run setup`, `scripts/setup.ps1`, and `scripts/setup.sh` initialize the
  local schema, apply migrations, and seed only after `db:init` has verified a
  loopback database target. Root `.env` values are loaded before `server/.env`;
  unset any process-level `DATABASE_URL` override and verify the target is local
  before running seed commands.
- Demo users are clearly marked as demo accounts internally and are not admins.
- Demo access is disabled unless `DEMO_MODE_ENABLED=true`. Registration and
  login do not depend on email delivery; verification, password reset, and
  email reminders do.

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
8. **Responsible summaries** — Informational disclaimer; rule-based fallback when LLM unavailable
9. **DB query optimization** — Indexes on specialization, location, appointments
10. **Deployment-ready config** — `.env.example` files for all services

---

## Bonus Features

| Feature                                 | Status                   |
| --------------------------------------- | ------------------------ |
| AI appointment assistant                | Directory matching; optional AI service with fallback |
| Appointment reminders                   | Email only when Resend or SMTP is configured |
| Calendar sync · Payments · Video        | 🔜 Roadmap               |
| PWA · Analytics · Digital prescriptions | 🔜 Roadmap               |

---

## Deployment Guide

### Architecture

```
Vercel (React)  →  Render Node API  →  Render PostgreSQL
                         ├──────────→  Render FastAPI AI service
                         └──────────→  Private S3-compatible document storage
```

The browser calls only the Node API; AI credentials remain server-side.
Production uploads require a private S3-compatible bucket. Render's local
filesystem is not durable document storage, and pre-existing local upload
files are not automatically copied into S3 when changing storage providers.

### Step 1 — Deploy Database + Backend + AI (Render)

1. Push the reviewed source to GitHub
2. Go to [render.com](https://render.com) → **New Blueprint**
3. Connect repo — Render reads `render.yaml` automatically
4. The API start command runs `npm start`, which applies pending migrations
   before starting the service; do not run `db:init` against the hosted database.
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
3. Set the project framework to Vite and use the default build command (`npm run build`) and output directory (`dist`)
4. Add environment variable:
   ```
   VITE_API_URL=https://your-api.onrender.com
   ```
5. Deploy — Vercel uses `client/vercel.json` automatically

### Step 3 — Configure Environment Variables

**Render — healthcare-api**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Auto from Render PostgreSQL |
| `JWT_SECRET` | Auto-generated, must be strong and unique per deployment |
| `JWT_EXPIRES_IN` | `7d` or `15m` depending on the desired access-token lifetime |
| `DEMO_MODE_ENABLED` | `false` by default; set to `true` only for the portfolio demo deployment |
| `CLIENT_URL` | `https://your-app.vercel.app` |
| `CLINIC_TIME_ZONE` | IANA timezone for clinic scheduling, for example `America/New_York` |
| `AI_SERVICE_URL` | Auto from healthcare-ai service |
| `AI_SERVICE_TOKEN` | Shared secret generated by the Render AI service |
| `AI_ASSIST_TIMEOUT_MS` | Optional doctor-assist request timeout in milliseconds; defaults to `15000` and is capped at `60000` |
| `MEDICAL_STORAGE_PROVIDER` | `s3` in production; use the configured private object-storage bucket |
| `S3_BUCKET` | Private production S3 bucket name |
| `S3_REGION` | AWS region for the bucket |
| `S3_ACCESS_KEY_ID` | Access key with object read/write permissions |
| `S3_SECRET_ACCESS_KEY` | Matching secret access key |
| `S3_ENDPOINT` | Optional custom S3-compatible endpoint |
| `S3_FORCE_PATH_STYLE` | `false` for AWS S3, `true` for custom endpoints |
| `S3_PREFIX` | Folder prefix such as `medical-documents` |
| `EMAIL_PROVIDER` | `smtp` for Gmail SMTP or `resend` (default) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | Dedicated Gmail account used as the SMTP sender |
| `SMTP_PASS` | Google App Password for that account (not its normal password) |
| `RESEND_API_KEY` | Set only when `EMAIL_PROVIDER=resend`; create a server-side API key in Resend |
| `EMAIL_FROM` | Sender for the selected provider; for SMTP, its email address must match `SMTP_USER` |

The API defaults `CLINIC_TIME_ZONE` to UTC if unset. Rate-limit counters are stored in PostgreSQL and shared across API instances; the API start command applies their migration automatically. `/api/health` is a lightweight liveness check, while `/api/ready` verifies PostgreSQL availability and is used by Render. In production, `CLIENT_URL` must be set explicitly; the server does not fall back to localhost for cross-origin auth or email links.

**Render — healthcare-ai**

| Variable | Value |
| --- | --- |
| `PORT` | Render assigns this automatically; the app listens on `$PORT` |
| `AI_SERVICE_TOKEN` | Shared secret matching the backend service token |
| `OPENAI_API_KEY` | Optional; without it the service uses a rule-based fallback |
| `LLM_MODEL` | Example: `gpt-4o-mini` |

**Vercel — client**

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://your-api.onrender.com` |

Keep the app and AI service on Render subdomains unless you purchase a custom domain later. The repository includes a root `.env.example` file with local-development and deployment placeholders for all required configuration.

### Hosting limitations and database backups

The configured Render PostgreSQL free instance is scheduled to expire on
November 8, 2026. Confirm the date and current retention/export options in the
Render dashboard before that deadline. A backup file existing locally does not
prove that it is complete or restorable. Keep database exports outside GitHub,
restrict access to them, and never paste their contents into an issue or chat.

The schema uses PostgreSQL and the migrations use `uuid-ossp`. Alternatives to
evaluate include paid Render PostgreSQL, [Neon](https://neon.tech/),
[Supabase](https://supabase.com/), and [Railway](https://railway.com/). Verify
each provider's current plan limits, connection pooling, backup retention,
region, SSL settings, and extension support before choosing; free-tier policies
can change.

For a safe backup check, first identify whether the export is a plain SQL script
or a `pg_dump` archive without printing its contents. For a custom archive,
`pg_restore --list` checks whether its archive catalog can be read. For either
format, test a restore into a separate, empty, disposable local PostgreSQL
database, never the source database. Use `psql` with `ON_ERROR_STOP` for plain
SQL, or `pg_restore --exit-on-error --no-owner` for a custom archive. Then
verify schema objects, row counts, constraints, and representative application
reads without exposing patient values. Do not consider the backup validated
until the isolated restore and application checks complete successfully.

Suggested migration sequence:

1. Create a new PostgreSQL database and verify SSL, `uuid-ossp`, connection
   limits, and network access.
2. Restore the export into a disposable database there and run the test suite
   against that database before scheduling a cutover.
3. Take a fresh source backup, pause writes for the final export/import, and
   compare schema and table counts without printing patient data.
4. Update only the Render API's `DATABASE_URL` dashboard setting, deploy the
   reviewed API commit, and smoke-test health/readiness, sign-in, booking,
   document authorization, and chat. Keep the old database intact until the
   new instance is verified and rollback is no longer needed.
5. Migrate document objects separately to durable private storage; a PostgreSQL
   restore does not include files stored on a Render filesystem or S3 bucket.

### Docker (Alternative)

```bash
docker compose up -d                          # PostgreSQL only
docker build -t healthcare-api ./server       # Build API image
docker build -t healthcare-ai ./ai-service    # Build AI image
```

---

## License

MIT
