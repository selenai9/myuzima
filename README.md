# MyUZIMA — Emergency QR Access System

> **Life-critical medical information at your fingertips.**  
> A PWA enabling emergency responders in Rwanda to access encrypted patient profiles via QR codes — even without connectivity.

 **Live API:** [https://myuzima-api.onrender.com](https://myuzima-api.onrender.com)

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-development-setup)
5. [Environment Variables](#environment-variables)
6. [Database Setup](#database-setup)
7. [Running the App](#running-the-app)
8. [Production Deployment (Docker)](#production-deployment-docker)
9. [Deploying to Render](#deploying-to-render)
10. [Project Structure](#project-structure)
11. [API Reference](#api-reference)
12. [Troubleshooting](#troubleshooting)

---

## What It Does

MyUZIMA has three user roles:

| Role | What they do |
|------|-------------|
| **Patient** | Registers via phone OTP, fills in emergency medical profile, downloads encrypted QR card |
| **Responder (EMT)** | Logs in with badge ID + PIN, scans QR codes to view patient profiles |
| **Admin** | Manages responders, views audit logs, monitors system stats |

Key features: AES-256-GCM encrypted patient data, offline-first PWA, Kinyarwanda & English UI, immutable audit logs.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js 22, Express 4, tRPC 11 |
| Database | MySQL 8, Drizzle ORM |
| Auth | JWT (15-min access tokens, 7-day refresh) |
| SMS/USSD | Africa's Talking |
| Offline | Workbox service worker, IndexedDB |
| DevOps | Docker, Docker Compose, Nginx |

---

## Prerequisites

Make sure you have all of these installed before you begin:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| MySQL | 8+ | [mysql.com](https://dev.mysql.com/downloads/) or via Docker |
| Docker | 20.10+ | [docker.com](https://www.docker.com/get-started/) |
| Docker Compose | 2.0+ | Included with Docker Desktop |
| Git | any | [git-scm.com](https://git-scm.com) |

---

## Local Development Setup

Follow every step in order.

### Step 1 — Clone the repository
```bash
git clone https://github.com/selenai9/myuzima.git
cd myuzima
```

### Step 2 — Install dependencies
```bash
pnpm install
```

### Step 3 — Create your environment file
```bash
cp .env.example .env
```

Then open `.env` and fill in your values (see [Environment Variables](#environment-variables) below).

### Step 4 — Start a local MySQL database

If you have MySQL installed locally:
```bash
mysql -u root -p
CREATE DATABASE myuzima;
CREATE USER 'myuzima'@'localhost' IDENTIFIED BY 'myuzima123';
GRANT ALL PRIVILEGES ON myuzima.* TO 'myuzima'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Or use Docker to spin up MySQL without installing it:
```bash
docker run -d \
  --name myuzima-db \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=myuzima \
  -e MYSQL_USER=myuzima \
  -e MYSQL_PASSWORD=myuzima123 \
  -p 3306:3306 \
  mysql:8
```

### Step 5 — Push the database schema
```bash
pnpm db:push
```

This uses Drizzle ORM to create all the tables defined in `drizzle/` inside your database.

### Step 6 — Start the development server
```bash
pnpm dev
```

This starts both the API server and the Vite frontend with hot reload. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

To generate a secure `JWT_SECRET` and `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

---

## Database Setup

The database schema is managed by Drizzle ORM. All table definitions live in `drizzle/`.
```bash
# Push schema to the database (creates/updates tables)
pnpm db:push

# Open Drizzle Studio — a browser UI to inspect your database
pnpm db:studio
```

Tables created:
- `patients` — registered patient accounts
- `emergencyProfiles` — AES-encrypted medical data
- `qrCodes` — QR tokens with 30-day expiry
- `responders` — EMT badge registry
- `auditLogs` — immutable access records
- `otps` / `otpAttempts` — OTP verification & rate limiting
- `facilities` — healthcare facilities

---

## Running the App

### Development mode (with hot reload)
```bash
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 |
| API health check | http://localhost:3000/api/health |

### Other useful commands
```bash
pnpm build        # Build frontend + backend for production
pnpm test         # Run unit tests
pnpm check        # TypeScript type checking
pnpm format       # Format code with Prettier
pnpm db:studio    # Open Drizzle database UI
```

---

## Production Deployment (Docker)

This runs the full stack (MySQL + API + Nginx) in containers.

### Step 1 — Set up your `.env`

Make sure your `.env` is filled in with production values (strong secrets, production DB password, real Africa's Talking credentials, `NODE_ENV=production`).

### Step 2 — Generate SSL certificates

For a self-signed certificate (development/staging):
```bash
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 -nodes \
  -subj "/CN=yourdomain.com"
```

For production with Let's Encrypt:
```bash
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
```

### Step 3 — Build and start all services
```bash
docker-compose up -d --build
```

### Step 4 — Run database migrations
```bash
docker-compose exec api npm run db:push
```

### Step 5 — Verify everything is running
```bash
docker-compose ps            # Check all containers are "Up"
docker-compose logs -f api   # Watch API logs
curl http://localhost:3000/api/health  # Should return {"status":"ok"}
```

### Managing the stack
```bash
docker-compose stop          # Stop all services
docker-compose down          # Stop and remove containers
docker-compose restart api   # Restart just the API
docker-compose logs nginx    # View Nginx logs
```

---

## Deploying to Render

## Project Structure
```
myuzima/
├── client/                  # React PWA frontend
│   ├── src/
│   │   ├── pages/           # Route-level page components
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # API client, IndexedDB helpers, i18n setup
│   │   └── i18n/            # Translations: rw.json (Kinyarwanda), en.json
│   └── public/
│       ├── sw.js            # Service worker (offline support)
│       └── manifest.json    # PWA manifest
├── server/                  # Express API backend
│   ├── routes/              # auth, patient, emergency, admin, ussd
│   ├── services/            # crypto, otp, qr generation, audit logging
│   ├── middleware/          # JWT auth, rate limiting
│   └── db.ts                # Database queries (Drizzle ORM)
├── drizzle/                 # Schema definitions and migrations
├── shared/                  # Types shared between client and server
├── Dockerfile.api           # Docker image for the API
├── docker-compose.yml       # Full stack: MySQL + API + Nginx
├── nginx.conf               # Nginx reverse proxy configuration
├── drizzle.config.ts        # Drizzle ORM configuration
└── DEPLOYMENT.md            # Extended deployment notes
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Start patient registration (sends OTP) |
| POST | `/api/auth/verify-otp` | Verify OTP and complete registration |
| POST | `/api/auth/refresh` | Refresh JWT access token |
| POST | `/api/auth/responder-login` | Responder login with badge ID + PIN |

### Patient

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/patient/profile` | Create emergency profile |
| PUT | `/api/patient/profile` | Update emergency profile |
| GET | `/api/patient/profile` | Get own profile |
| GET | `/api/patient/qr-card` | Download QR card as PDF |

### Emergency Access (Responder)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/emergency/scan` | Decrypt and retrieve patient profile via QR token |
| GET | `/api/emergency/sync` | Sync last 50 profiles for offline use |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/responders` | List all responders |
| POST | `/api/admin/responders` | Create a new responder |
| DELETE | `/api/admin/responders/:id` | Deactivate a responder |
| GET | `/api/admin/audit-logs` | Paginated audit log viewer |
| GET | `/api/admin/stats` | System stats (patient count, scans, uptime) |

---

## Troubleshooting

**`pnpm install` fails**  
Make sure you're on Node.js 22+. Run `node -v` to check.

**Database connection refused**  
Verify MySQL is running and your `DATABASE_URL` matches the host, port, username, and password exactly. For Docker, the host should be `db` (the service name), not `localhost`.

**`pnpm db:push` errors**  
The database user needs full privileges on the `myuzima` database. Re-run the `GRANT ALL PRIVILEGES` command from Step 4.

**QR scanning doesn't work**  
Camera access requires HTTPS or `localhost`. In production, ensure your SSL certificate is valid.

**Service worker not registering**  
Open DevTools → Application → Service Workers. If it shows an error, clear site data and reload. Service workers only work on HTTPS or localhost.

**OTP not arriving**  
Check your `AFRICAS_TALKING_API_KEY` and `AFRICAS_TALKING_USERNAME`. In sandbox mode, you can only send to numbers registered in your Africa's Talking sandbox.

**Docker containers crashing**  
Run `docker-compose logs api` to read error output. Most crashes on startup are caused by missing environment variables or the database not being ready yet — wait 10 seconds and run `docker-compose restart api`.

---

## License

MIT

## Support

- Live app: [https://myuzima-api.onrender.com](https://myuzima-api.onrender.com)
- Issues: [GitHub Issues](https://github.com/selenai9/myuzima/issues)
- Email: support@myuzima.rw

---

*Built for emergency medical response in Rwanda — offline-first, optimized for 3G and feature phones.*
