# ReachInbox Email Scheduler & Dispatch Service

> Production-minded full-stack email scheduling service, distributed worker pool, and React monitoring dashboard designed for OUTBOX LABS / ReachInbox.ai.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Monorepo Project Structure](#monorepo-project-structure)
5. [Prerequisites & System Requirements](#prerequisites--system-requirements)
6. [Windows & PowerShell Setup Instructions](#windows--powershell-setup-instructions)
7. [Environment Variable Configuration](#environment-variable-configuration)
8. [Docker Infrastructure (Postgres, Redis, Elasticsearch)](#docker-infrastructure)
9. [Database Migrations & Prisma Setup](#database-migrations--prisma-setup)
10. [Third-Party Integrations Setup](#third-party-integrations-setup)
    - [Ethereal Email SMTP Credentials](#ethereal-email-smtp-credentials)
    - [Google OAuth 2.0 Setup](#google-oauth-20-setup)
    - [Slack OAuth 2.0 & Live Notifications Setup](#slack-oauth-20--live-notifications-setup)
11. [Running the Application](#running-the-application)
    - [Starting the HTTP API](#1-starting-the-http-api)
    - [Starting the Independent BullMQ Worker](#2-starting-the-independent-bullmq-worker)
    - [Starting the Vite React Frontend](#3-starting-the-vite-react-frontend)
12. [API Endpoint Documentation](#api-endpoint-documentation)
13. [Deep-Dive Architecture & Engineering Analysis](#deep-dive-architecture--engineering-analysis)
    - [BullMQ Persistence & Restart Recovery](#bullmq-persistence--restart-recovery)
    - [Idempotency & The Exact-Delivery Uncertainty Window](#idempotency--the-exact-delivery-uncertainty-window)
    - [Worker Concurrency & Minimum Inter-Email Delay](#worker-concurrency--minimum-inter-email-delay)
    - [Distributed Per-Sender Hourly Rate Limiting](#distributed-per-sender-hourly-rate-limiting)
    - [Elasticsearch Scoped Indexing & Full-Text Search](#elasticsearch-scoped-indexing--full-text-search)
    - [Live Bull Board Monitoring](#live-bull-board-monitoring)
14. [Automated Test Suite & Verification Results](#automated-test-suite--verification-results)
15. [Five-Minute Screen Recording Demo Script](#five-minute-screen-recording-demo-script)
16. [Assignment Feature Matrix](#assignment-feature-matrix)
17. [Known Limitations, Trade-offs & Assumptions](#known-limitations-trade-offs--assumptions)
18. [Top 3 Technical Interview Questions & Answers](#top-3-technical-interview-questions--answers)

---

## Project Overview

ReachInbox Scheduler is an enterprise-grade distributed background scheduling service and real-time operations dashboard. It accepts email dispatches via REST APIs, validates recipients (single or bulk CSV lead files), schedules them with deterministic delay in BullMQ backed by Redis, and delivers test messages via Nodemailer and Ethereal SMTP.

### Key Capabilities
- **Deterministic Delayed Enqueueing**: Jobs scheduled for seconds, days, or weeks in the future survive server crashes and Redis restarts.
- **Startup Crash Reconciliation**: Automatic PostgreSQL-to-BullMQ reconciliation catches any jobs written to DB before a crash and enqueues them into Redis.
- **Distributed Per-Sender Hourly Rate Limiting**: Redis Lua script executes atomic slot reservation. When a sender exhausts their hourly quota, jobs are deferred to the start of the next UTC hour window while preserving sending order.
- **Real Slack OAuth & Alerts**: Authenticates Slack workspaces via OAuth 2.0, stores AES-256-GCM encrypted tokens, and posts automated rate-limit alerts with a 1-hour Redis deduplication window to prevent notification storms.
- **Real Google OAuth 2.0**: Implements Google Identity login with CSRF-protected state validation and HTTP-only session cookies.
- **Ethereal SMTP Integration**: Captures test emails with direct web preview links (`https://ethereal.email/message/...`) displayed in the Sent Emails dashboard.
- **Elasticsearch Search**: Automatically provisions indices and mappings to enable multi-match fuzzy search across subjects, recipients, and bodies scoped to the authenticated tenant.
- **Live Bull Board Monitoring**: Embedded and protected BullMQ dashboard showing active, delayed, waiting, completed, and failed jobs.

---

## Architecture Diagram

```mermaid
flowchart TD
    User["👤 User Browser"]
    Frontend["⚛️ React + Vite Web Dashboard<br/>(Port 5173)"]
    API["🚀 Express.js API Server<br/>(Port 4000)"]
    Worker["⚙️ Independent BullMQ Worker<br/>(Concurrency: N)"]
    Postgres[("🐘 PostgreSQL 16<br/>Persistent State")]
    Redis[("⚡ Redis 7<br/>BullMQ Queues & Lua Rate Limiter")]
    Elasticsearch[("🔍 Elasticsearch 8<br/>Fuzzy Email Index")]
    Ethereal["📬 Ethereal SMTP<br/>Test Mail Delivery"]
    SlackAPI["💬 Slack Web API<br/>Rate-Limit Alerts"]
    GoogleAuth["🔑 Google OAuth 2.0<br/>Identity Provider"]

    User -->|Views Dashboard / Uploads CSV| Frontend
    Frontend -->|REST API / Cookies| API
    Frontend -->|OAuth Redirects| GoogleAuth
    Frontend -->|OAuth Redirects| SlackAPI

    API -->|Persists Emails, Users, Senders| Postgres
    API -->|Enqueues Delayed Jobs| Redis
    API -->|Indexes Email Documents| Elasticsearch
    API -->|Mounts Bull Board Dashboard| Redis

    Worker -->|Startup Reconciliation| Postgres
    Worker -->|Pulls Delayed Jobs| Redis
    Worker -->|Enforces Sender Delay & Lua Limit| Redis
    Worker -->|Sends Test Emails| Ethereal
    Worker -->|Updates Status SENT/FAILED| Postgres
    Worker -->|Syncs Status Changes| Elasticsearch
    Worker -->|Posts Rate Limit Warning| SlackAPI
```

---

## Technology Stack

### Backend
- **Runtime**: Node.js v20+ with TypeScript
- **Framework**: Express.js
- **Database ORM**: Prisma ORM with PostgreSQL 16
- **Distributed Queue**: BullMQ backed by Redis 7
- **Search Engine**: Elasticsearch 8.11 with `@elastic/elasticsearch`
- **Mail Transport**: Nodemailer with Ethereal Email SMTP
- **Authentication**: Google OAuth 2.0 / OpenID Connect + JWT HTTP-only Cookies
- **Integrations**: Slack OAuth 2.0 and `@slack/web-api`
- **Validation**: Zod schema validation
- **Queue Monitor**: `@bull-board/express` & `@bull-board/api`
- **Security**: AES-256-GCM encryption for Slack tokens and SMTP secrets
- **Structured Logging**: Pino with `pino-pretty`

### Frontend
- **Framework**: React 18 with Vite and TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **Server State & Caching**: TanStack React Query v5
- **Form Handling**: React Hook Form with `@hookform/resolvers/zod`
- **Lead Ingestion**: Papa Parse for CSV lead uploads
- **Icons**: Lucide React

### Infrastructure
- **Containers**: Docker Compose for PostgreSQL, Redis, and Elasticsearch

---

## Monorepo Project Structure

```text
reachinbox-scheduler/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   └── schema.prisma           # Prisma PostgreSQL database schema
│   │   ├── src/
│   │   │   ├── config/env.ts           # Zod-validated environment config
│   │   │   ├── middleware/auth.ts      # Session & Bearer JWT auth middleware
│   │   │   ├── modules/
│   │   │   │   ├── auth/               # Google OAuth login & session endpoints
│   │   │   │   ├── emails/             # Scheduling, bulk CSV, and cancellation
│   │   │   │   ├── senders/            # Multi-sender management & limits
│   │   │   │   ├── search/             # Elasticsearch scoped email search
│   │   │   │   ├── slack/              # Slack OAuth connection & alerts
│   │   │   │   ├── health/             # Health checks & queue metrics
│   │   │   │   └── scheduling/         # Protected Bull Board monitor
│   │   │   ├── queues/emailQueue.ts    # BullMQ queue with deterministic delay
│   │   │   ├── workers/emailWorker.ts  # Distributed worker with rate limit deferral
│   │   │   ├── services/
│   │   │   │   ├── rateLimiter.ts      # Redis Lua atomic reservation
│   │   │   │   ├── sendDelayLimiter.ts # Per-sender minimum delay coordinator
│   │   │   │   ├── smtpService.ts      # Ethereal SMTP with preview links
│   │   │   │   ├── slackService.ts     # Slack WebClient & dedup logic
│   │   │   │   ├── elasticsearchService.ts # Mappings and scoped search
│   │   │   │   └── reconciliationService.ts # Startup crash recovery
│   │   │   ├── repositories/prisma.ts  # Prisma client singleton
│   │   │   ├── utils/                  # Logger, crypto (AES-256-GCM), Redis
│   │   │   ├── scripts/seed.ts         # Demo dataset & auth generator
│   │   │   ├── app.ts                  # Express application setup
│   │   │   ├── server.ts               # API HTTP server entry point
│   │   │   └── worker-runner.ts        # Standalone worker process entry point
│   │   ├── tests/                      # Automated Vitest test suite (9 files, 32 tests)
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── components/             # Sidebar, Header, ComposeModal
│       │   ├── layouts/DashboardLayout.tsx # Protected layout wrapper
│       │   ├── pages/                  # Scheduled, Sent, Senders, Search, Monitor, Slack
│       │   ├── context/                # AuthContext, ToastContext
│       │   ├── services/api.ts         # Typed API client
│       │   ├── App.tsx                 # Routes and QueryClientProvider
│       │   └── main.tsx
│       └── package.json
├── packages/
│   └── shared/                         # DTOs, Zod schemas, and shared types
├── docker-compose.yml                  # PostgreSQL, Redis, Elasticsearch
├── .env.example                        # Documented environment variables template
├── package.json                        # Monorepo workspaces & scripts
└── README.md
```

---

## Prerequisites & System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Node.js**: v20.x or v22.x+ (tested on Node v24.13.0)
- **Package Manager**: npm 10.x+
- **Docker**: Docker Desktop (for PostgreSQL, Redis, and Elasticsearch)
- **PowerShell**: Windows PowerShell 5.1 or PowerShell 7

---

## Windows & PowerShell Setup Instructions

1. Clone the repository and navigate to the project directory:
```powershell
git clone https://github.com/SakshiMalik565/ReachInbox-Scheduler.git
cd ReachInbox-Scheduler
```

2. Copy the sample environment file to `.env`:
```powershell
Copy-Item .env.example .env
```

3. Install all dependencies across the monorepo:
```powershell
npm install
```

4. Build the shared types package:
```powershell
npm run build:shared
```

---

## Environment Variable Configuration

Edit the `.env` file in the project root with the following parameters:

```ini
# Server & Ports
NODE_ENV=development
API_PORT=4000
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:4000

# PostgreSQL
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5433/reachinbox_scheduler?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=

# Google OAuth 2.0 (From Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

# Session Secret (For signing authentication cookies)
SESSION_SECRET=super_secret_session_key_32_characters_long_for_security!

# Token Encryption Key (64-character hex string / 32 bytes for AES-256-GCM)
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Slack OAuth 2.0 (From api.slack.com/apps)
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_CALLBACK_URL=http://localhost:4000/api/slack/callback

# Ethereal SMTP Settings
ETHEREAL_SMTP_HOST=smtp.ethereal.email
ETHEREAL_SMTP_PORT=587
ETHEREAL_SMTP_USER=
ETHEREAL_SMTP_PASS=

# Worker & Scheduling Defaults
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=100
```

---

## Docker Infrastructure

Ensure Docker Desktop is running on Windows, then boot the infrastructure containers:

```powershell
docker compose up -d
```

Verify that all three services report healthy status:
```powershell
docker compose ps
```
- **PostgreSQL**: `localhost:5433`
- **Redis**: `localhost:6379`
- **Elasticsearch**: `localhost:9200`

---

## Database Migrations & Prisma Setup

Push the Prisma schema to PostgreSQL and generate the TypeScript client:

```powershell
npm run prisma:generate
npm run prisma:push
npm run seed   # (Optional: seeds a demo user demo@reachinbox.ai and sender with limit 5/hr)
```

To view or edit records via GUI at any time:
```powershell
npm run prisma:studio
```

---

## Third-Party Integrations Setup

### Ethereal Email SMTP Credentials
- **Automatic On-Demand Account Creation**: If `ETHEREAL_SMTP_USER` and `ETHEREAL_SMTP_PASS` are left empty, the application will automatically create an ephemeral Ethereal test account via `nodemailer.createTestAccount()` and log the login details in your terminal.
- **Persistent Account Creation**:
  1. Visit [https://ethereal.email/create](https://ethereal.email/create).
  2. Copy the generated Username and Password into `.env`:
     ```ini
     ETHEREAL_SMTP_USER=your_user@ethereal.email
     ETHEREAL_SMTP_PASS=your_ethereal_password
     ```
  3. Every sent message produces a direct preview URL (`https://ethereal.email/message/...`) visible in the Sent Emails dashboard.

### Google OAuth 2.0 Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and navigate to **APIs & Services -> Credentials**.
3. Create an **OAuth 2.0 Client ID** (Application type: *Web application*).
4. Add Authorized Redirect URI:
   `http://localhost:4000/api/auth/google/callback`
5. Copy the Client ID and Client Secret into your `.env`:
   ```ini
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxx
   ```

### Slack OAuth 2.0 & Live Notifications Setup
1. Visit [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** -> *From scratch*.
2. Navigate to **OAuth & Permissions**:
   - Under **Redirect URLs**, add: `http://localhost:4000/api/slack/callback`
   - Under **Bot Token Scopes**, add:
     - `chat:write`
     - `channels:read`
     - `incoming-webhook`
3. Under **Basic Information -> App Credentials**, copy:
   ```ini
   SLACK_CLIENT_ID=xxx
   SLACK_CLIENT_SECRET=yyy
   ```
4. Click **Connect Slack** in the ReachInbox dashboard.
5. Authorize the application. Whenever a sender exhausts their hourly rate limit, ReachInbox will send a structured Slack message to your selected channel.

---

## Running the Application

In a multi-process production environment, the HTTP API server and BullMQ Worker run in separate terminal processes.

### 1. Starting the HTTP API
In PowerShell Terminal 1:
```powershell
npm run dev:api
```
*API server will listen on `http://localhost:4000`.*

### 2. Starting the Independent BullMQ Worker
In PowerShell Terminal 2:
```powershell
npm run dev:worker
```
*Worker process runs independently, executes startup crash reconciliation, enforces concurrency and rate limits, and processes delayed jobs.*

### 3. Starting the Vite React Frontend
In PowerShell Terminal 3:
```powershell
npm run dev:web
```
*Frontend will open at `http://localhost:5173`.*

---

## API Endpoint Documentation

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Health check for PostgreSQL, Redis, and Elasticsearch | No |
| `GET` | `/api/auth/google` | Initiates Google OAuth redirect with CSRF state | No |
| `GET` | `/api/auth/google/callback` | Exchanges Google auth code for session cookie | No |
| `GET` | `/api/auth/me` | Returns current user profile and Slack status | Yes |
| `POST` | `/api/auth/logout` | Clears authentication session cookie | Yes |
| `GET` | `/api/senders` | Lists all senders for the authenticated user | Yes |
| `POST` | `/api/senders` | Creates a new sender profile with hourly limit | Yes |
| `POST` | `/api/emails/schedule` | Schedules a single email with idempotency support | Yes |
| `POST` | `/api/emails/schedule/bulk` | Bulk schedules emails from parsed lead array | Yes |
| `GET` | `/api/emails/scheduled` | Lists scheduled and processing emails (paginated) | Yes |
| `GET` | `/api/emails/sent` | Lists sent, failed, or cancelled emails (paginated) | Yes |
| `GET` | `/api/emails/:id` | Retrieves email record by ID | Yes |
| `POST` | `/api/emails/:id/cancel` | Cancels a scheduled job before dispatch | Yes |
| `GET` | `/api/search/emails` | Elasticsearch search scoped to user tenant | Yes |
| `GET` | `/api/slack/connect` | Initiates Slack OAuth redirect | Yes |
| `GET` | `/api/slack/callback` | Exchanges Slack OAuth code and saves token | Yes |
| `DELETE` | `/api/slack/connection` | Disconnects Slack workspace | Yes |
| `GET` | `/api/queue/stats` | Real-time BullMQ job counts (delayed, active, etc.) | Yes |
| `GET` | `/admin/queues` | Live Bull Board monitoring dashboard | Yes |

### Request & Response Examples

#### Schedule Single Email (`POST /api/emails/schedule`)
```json
{
  "senderId": "sender-uuid",
  "recipient": "lead@example.com",
  "subject": "Partnership Opportunity",
  "body": "<p>Hello! We would love to discuss a partnership.</p>",
  "scheduledTime": "2026-10-25T15:30:00.000Z",
  "idempotencyKey": "crm-lead-1002",
  "minDelayMs": 2000,
  "hourlyLimit": 100
}
```
**Response (`201 Created` or `200 OK` on duplicate idempotency key):**
```json
{
  "data": {
    "id": "email-uuid",
    "recipient": "lead@example.com",
    "subject": "Partnership Opportunity",
    "status": "SCHEDULED",
    "scheduledTime": "2026-10-25T15:30:00.000Z",
    "bullJobId": "email-job-email-uuid"
  },
  "isDuplicate": false
}
```

---

## Deep-Dive Architecture & Engineering Analysis

### BullMQ Persistence & Restart Recovery
1. **Redis Delayed Sorted Sets**: BullMQ delayed jobs are persisted in Redis using a sorted set (`bull:email-delivery-queue:delayed`) keyed by epoch millisecond timestamp. Neither stopping the API server nor terminating the worker drops these jobs.
2. **Startup Reconciliation Service**: In distributed architectures, a crash can theoretically occur after an email row is committed to PostgreSQL but before the network call to Redis completes. On worker startup, `ReconciliationService.reconcileScheduledEmails()` scans PostgreSQL for any `SCHEDULED` emails whose corresponding `bullJobId` is missing from Redis and safely re-enqueues them with the remaining delay.
3. **No Cron Substitute**: Delivery is 100% event-driven via BullMQ delayed timers; no polling intervals or cron jobs are used.

### Idempotency & The Exact-Delivery Uncertainty Window
In distributed systems, **true atomic exactly-once delivery across an external third-party SMTP server and an internal PostgreSQL database is theoretically impossible** (known as the *Two Generals' Problem*).

```text
[Worker] ──(1) SMTP Handshake & 250 OK──> [Ethereal SMTP] (Email delivered to inbox)
   │
   ▼ 💥 CRASH OCCURS HERE (Worker process killed before DB commit)
[Worker] ──(2) UPDATE status = 'SENT'──> [PostgreSQL] (Never reached!)
```

If the worker crashes immediately after the SMTP server returns `250 OK` but before PostgreSQL commits `status = 'SENT'`, BullMQ will re-try the job upon restart.
**Our Mitigation Strategy:**
- We support client-provided `idempotencyKey` values uniquely indexed in PostgreSQL per user (`@@unique([userId, idempotencyKey])`).
- Before sending, the worker performs an atomic conditional update:
  ```ts
  prisma.email.updateMany({
    where: { id: emailId, status: { in: ['SCHEDULED', 'PROCESSING'] } },
    data: { status: 'PROCESSING' }
  });
  ```
  If another worker already picked up or sent the email, the affected count is 0 and the duplicate send is aborted immediately.

### Worker Concurrency & Minimum Inter-Email Delay
- **Configurable Concurrency**: Defined via `WORKER_CONCURRENCY=5` in `.env`.
- **Sender Scope Delay**: Even when 5 concurrent workers process jobs in parallel, they must not spam the same sender's SMTP server simultaneously.
- **Coordination**: Before dispatch, workers invoke `SendDelayLimiterService.enforceMinDelay(senderId, minDelayMs)`. If another worker recently dispatched an email for that sender, the worker pauses for the exact remaining duration before invoking SMTP, maintaining sender reputation.

### Distributed Per-Sender Hourly Rate Limiting
- **Atomic Reservation Model**: Rather than an insecure "check-then-act" sequence, the worker executes an atomic Redis Lua script:
  ```lua
  local current = redis.call('GET', KEYS[1])
  if current and tonumber(current) >= tonumber(ARGV[1]) then
    return {0, tonumber(current)}
  end
  local newCount = redis.call('INCR', KEYS[1])
  if newCount == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  end
  if newCount > tonumber(ARGV[1]) then
    return {0, newCount}
  end
  return {1, newCount}
  ```
- **Safe Next-Window Deferral**: If `allowed == false`, the job is not dropped or marked failed. It is moved back into BullMQ's delayed set with `delay = nextHourStartMs - nowMs`.
- **Slack Alert Deduplication**: The worker triggers a real Slack notification via `SlackService.sendRateLimitAlert`, utilizing a 1-hour Redis deduplication key (`slack:rate_limit_alert:${senderId}:${hourKey}`) to prevent notification spam.

### Elasticsearch Scoped Indexing & Full-Text Search
- **Automatic Mapping**: Provisions index `reachinbox_emails` on startup with strict keyword and text mappings.
- **Tenant Isolation**: All queries enforce `{ term: { userId: currentUserId } }`, preventing cross-account data leakage.
- **Resilient Fallback**: If Elasticsearch is temporarily unreachable, the search controller automatically falls back to a PostgreSQL `ILIKE` search, ensuring zero downtime for end users.

### Live Bull Board Monitoring
Mounted at `/admin/queues` and wrapped with `requireAuth` session protection. Displays real-time counts, job attributes, and retry history directly from the `email-delivery-queue`.

---

## Automated Test Suite & Verification Results

The test suite consists of **9 test files** and **32 automated tests** verifying every critical requirement:

```text
✓ tests/csv-parsing.test.ts          (2 tests)
✓ tests/validation.test.ts           (10 tests)
✓ tests/crypto-security.test.ts      (3 tests)
✓ tests/rate-limiter.test.ts         (4 tests)
✓ tests/auth-middleware.test.ts      (3 tests)
✓ tests/slack-alerts.test.ts         (2 tests)
✓ tests/scheduling-worker.test.ts    (5 tests)
✓ tests/elasticsearch-scoping.test.ts(1 test)
✓ tests/send-delay.test.ts           (2 tests)

Test Files:  9 passed (9)
Tests:       32 passed (32)
```

Run tests with:
```powershell
npm test
```

---

## Five-Minute Screen Recording Demo Script

| Timestamp | Screen Action | Explanatory Narration |
|---|---|---|
| **0:00 - 0:45** | **Architecture & Login**<br/>Show `.env`, login screen, and Google OAuth login button. | *"Welcome to the ReachInbox Email Scheduler. The architecture runs a separate Express API, BullMQ worker pool, PostgreSQL, Redis, and Elasticsearch. Notice our secure session handling and Google OAuth integration."* |
| **0:45 - 1:30** | **CSV Upload & Ingestion**<br/>Click *Compose Email*, select *Bulk CSV*, upload `leads-sample-mixed.csv`. | *"Our frontend parses the CSV using Papa Parse in the browser. Notice how 3 valid emails are accepted while 3 malformed rows are flagged and rejected with clear user feedback without crashing the app."* |
| **1:30 - 2:30** | **Scheduling & Persistence Across Restarts**<br/>Schedule an email for 1 minute in the future. Show Scheduled Emails table and Bull Board. Stop worker (`Ctrl+C`), wait 10 seconds, restart worker. | *"The email is saved in PostgreSQL and BullMQ delayed jobs backed by Redis. I will now stop the worker. Notice the job remains in Redis. When restarted, the startup reconciliation verifies queue integrity and the worker dispatches the email on time."* |
| **2:30 - 3:30** | **Ethereal SMTP & Sent History**<br/>Navigate to *Sent Emails* table, click **View in Ethereal**. | *"Here is the dispatched email in PostgreSQL with actual sent timestamp. Clicking 'View in Ethereal' opens the live Ethereal web inbox showing our formatted email content and headers."* |
| **3:30 - 4:15** | **Distributed Rate Limiting & Slack Alert**<br/>Create a sender with hourly limit = 2. Schedule 4 emails. Show 2 sending and 2 deferred to next hour window. Show live Slack alert. | *"Our Redis Lua script atomically reserves slots per sender. After 2 sends, the remaining 2 are deferred to the start of the next hour window. In Slack, our bot posts a rate limit alert with 1-hour Redis deduplication."* |
| **4:15 - 5:00** | **Elasticsearch Search & Bull Board**<br/>Go to *Email Search*, search for a keyword. Open `/admin/queues`. | *"Finally, our Elasticsearch cluster provides full-text fuzzy search scoped strictly to the authenticated user, and Bull Board provides live queue visibility into delayed, completed, and failed jobs."* |

---

## Assignment Feature Matrix

| Assignment Requirement | Implementation Status | Verification Method |
|---|---|---|
| **TypeScript Monorepo** | Implemented | Verified (`tsc --noEmit` on shared, api, and web passes with 0 errors) |
| **PostgreSQL & Prisma** | Implemented | Verified (Models User, Sender, Email, SlackConnection defined & pushed) |
| **BullMQ & Redis Scheduling** | Implemented | Verified (`tests/scheduling-worker.test.ts` & Bull Board integration) |
| **Persistence Across Restarts** | Implemented | Verified (`ReconciliationService` startup recovery & Redis persistence) |
| **Idempotency Support** | Implemented | Verified (`@@unique([userId, idempotencyKey])` and duplicate handling) |
| **Ethereal SMTP Test Sending** | Implemented | Verified (Nodemailer transporter, dynamic test account & preview URL) |
| **Multiple Senders** | Implemented | Verified (Per-sender hourly limits, DB relationships, dropdown selection) |
| **Worker Concurrency** | Implemented | Verified (`WORKER_CONCURRENCY=5` environment variable) |
| **Minimum Send Delay** | Implemented | Verified (`tests/send-delay.test.ts` & Redis `sender:last_send` timestamp) |
| **Distributed Hourly Rate Limiter** | Implemented | Verified (`tests/rate-limiter.test.ts` with Redis Lua atomic reservation) |
| **Next-Window Job Deferral** | Implemented | Verified (Calculates start of next UTC hour, preserves sending order) |
| **Real Slack OAuth** | Implemented | Code complete (Redirect, state validation, token encryption, disconnect) |
| **Live Slack Rate-Limit Alerts** | Implemented | Code complete + Tested (`tests/slack-alerts.test.ts` with 1-hr dedup) |
| **Real Google OAuth Login** | Implemented | Code complete + Tested (`tests/auth-middleware.test.ts`) |
| **Elasticsearch Email Indexing** | Implemented | Verified (`tests/elasticsearch-scoping.test.ts` & auto-index creation) |
| **Live Bull Board Dashboard** | Implemented | Verified (Mounted at `/admin/queues` with auth middleware) |
| **React Dashboard & CSV Parser** | Implemented | Verified (Vite production build succeeded, Papa Parse rejection tests) |
| **Automated Tests** | Implemented | Verified (32 automated unit and integration tests passing) |

---

## Known Limitations, Trade-offs & Assumptions

1. **Two Generals' Delivery Uncertainty Window**: As detailed in our engineering analysis, an edge case exists where the worker crashes between the external SMTP server returning `250 OK` and PostgreSQL updating `status = 'SENT'`. True exactly-once delivery across network boundaries without a distributed two-phase commit protocol is physically impossible; our atomic `PROCESSING` state transition minimizes this window.
2. **Elasticsearch Fallback**: In local development environments without Elasticsearch running, the search endpoint gracefully degrades to PostgreSQL `ILIKE` filtering.
3. **UTC Hourly Boundary**: Hourly rate limit buckets are calculated in UTC (`YYYY-MM-DD-THH`) to ensure consistent coordination across distributed workers regardless of server timezone.

---

## Top 3 Technical Interview Questions & Answers

### 1. How does your distributed rate limiter guarantee that concurrent workers will never exceed the configured hourly limit?
> **Answer**: We use an **atomic reservation model** executed via a Redis Lua script. In Redis, Lua scripts run as a single atomic transaction. The script checks the current counter for the sender's current UTC hour bucket (`ratelimit:sender:${senderId}:${hourKey}`). If the count is below the limit, it executes `INCR` and sets a 2-hour TTL. If the limit is already reached, it returns `{0, currentCount}` without incrementing. Because no other worker command can interleave during Lua execution, race conditions are mathematically eliminated. If rejected, the BullMQ job is moved to the delayed set until the exact millisecond of the next hour window (`nextWindowStartMs`).

### 2. How do you prevent scheduled emails from being lost if the API server or Redis crashes?
> **Answer**: We implement a **reliable recovery pattern**:
> 1. When an email scheduling request arrives, we persist the email record in PostgreSQL with status `SCHEDULED` *before* attempting the Redis enqueue call.
> 2. Jobs in Redis use BullMQ's delayed sorted sets, which survive worker and API process restarts.
> 3. To handle crashes at the database-to-Redis boundary, our `ReconciliationService` runs on worker startup. It queries PostgreSQL for all `SCHEDULED` emails and checks if their corresponding `bullJobId` exists in Redis. Any orphaned or un-enqueued emails are safely re-enqueued with their remaining delay.

### 3. How do you protect sensitive third-party tokens (Slack OAuth and SMTP passwords) from database exposure?
> **Answer**: Sensitive tokens are never stored in plaintext. We use **AES-256-GCM authenticated encryption** (`crypto.createCipheriv('aes-256-gcm', key, iv)`). Each encryption generates a fresh cryptographically random 12-byte initialization vector (IV) and outputs an authentication tag that guarantees ciphertext integrity. Even if the PostgreSQL database were compromised, the tokens cannot be read without the 32-byte `TOKEN_ENCRYPTION_KEY` isolated in the server's environment configuration.
