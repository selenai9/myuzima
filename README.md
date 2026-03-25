# MyUZIMA Emergency QR Access System

**Life-critical medical information at your fingertips.** MyUZIMA is a PWA (Progressive Web App) that enables emergency responders in Rwanda to access encrypted patient emergency profiles via QR codes, even without connectivity.

## Features

### 🏥 Patient Portal
- **Phone-based OTP registration** — SMS verification via Africa's Talking
- **Emergency profile creation** — Blood type, allergies, medications, conditions, emergency contacts
- **Encrypted QR card** — Download PDF with AES-256-GCM encrypted QR code
- **Access history** — View who accessed your profile and when
- **Offline support** — Profile accessible even without internet

### 🚑 Responder App
- **Badge authentication** — Secure login with badge ID + PIN
- **QR scanning** — Real-time camera integration with torch control
- **Critical safety features:**
  - Large blood type badge (color-coded A/B/AB/O)
  - Allergies in red warning boxes
  - Medications with dosage info
  - Chronic conditions list
  - Emergency contacts with tap-to-call
  - **DATA UNAVAILABLE banner** — Displays when decryption fails (critical safety feature)
- **Offline mode** — IndexedDB cache of last 50 profiles
- **Immutable audit logs** — Every access tracked with timestamp, responder ID, patient info

### 👨‍💼 Admin Dashboard
- **Responder registry** — CRUD operations for responder management
- **Audit log viewer** — Paginated logs with timestamp, responder, patient, access method, IP
- **System statistics** — Patient count, total scans, system uptime

### 📱 Feature Phone Support
- **USSD interface** — *777# for patient registration and responder lookup
- **SMS notifications** — Real-time alerts when profiles are accessed
- **Offline-first** — Works on 3G networks and feature phones

### 🔒 Security & Privacy
- **AES-256-GCM encryption** — All sensitive patient data encrypted at rest
- **JWT authentication** — 15-minute access tokens, 7-day refresh tokens
- **Rate limiting** — 3 OTP attempts → 30-minute lockout
- **Immutable audit logs** — Comprehensive access tracking
- **RBAC** — Role-based access control for responders

### 🌐 Internationalization
- **Kinyarwanda** (primary language)
- **English** (secondary language)
- Language toggle in UI

### 📴 Offline-First PWA
- **Service worker** — Network-first strategy with cache fallback
- **IndexedDB caching** — Emergency profiles cached locally (max 50, LRU eviction)
- **Background sync** — Queued audit logs synced when back online
- **Push notifications** — Patient alerts when profiles are accessed
- **Standalone app** — Install on home screen, works offline

## Technology Stack

### Frontend
- **React 19** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool
- **Tailwind CSS 4** — Styling
- **shadcn/ui** — Component library
- **html5-qrcode** — QR scanning
- **react-i18next** — Internationalization
- **idb** — IndexedDB wrapper
- **Workbox** — Service worker

### Backend
- **Node.js 22** — Runtime
- **Express 4** — Web framework
- **tRPC 11** — RPC framework
- **Drizzle ORM** — Database layer
- **MySQL 8** — Database
- **JWT** — Authentication
- **bcryptjs** — Password hashing
- **qrcode** — QR generation
- **pdf-lib** — PDF export

### DevOps
- **Docker** — Containerization
- **Docker Compose** — Orchestration
- **Nginx** — Reverse proxy
- **SSL/TLS** — Encryption in transit

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm check
```

### Production

```bash
# Using Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f api

# Database migration
docker-compose exec api npm run db:push
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Project Structure

```
myuzima/
├── client/                 # React PWA frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── hooks/         # Custom hooks (useServiceWorker, etc.)
│   │   ├── lib/           # Utilities (API client, IndexedDB, i18n)
│   │   ├── i18n/          # Translations (rw.json, en.json)
│   │   └── App.tsx        # Main app component
│   └── public/
│       ├── sw.js          # Service worker
│       └── manifest.json  # PWA manifest
├── server/                # Express API backend
│   ├── routes/            # API routes (auth, patient, emergency, admin, ussd)
│   ├── services/          # Business logic (crypto, otp, qr, audit)
│   ├── middleware/        # Auth, rate limiting
│   └── db.ts              # Database queries
├── drizzle/               # Database schema & migrations
├── Dockerfile.api         # API container
├── docker-compose.yml     # Full stack orchestration
├── nginx.conf             # Reverse proxy config
└── DEPLOYMENT.md          # Deployment guide
```

## API Endpoints

### Authentication
- `POST /api/auth/register` — Patient registration with OTP
- `POST /api/auth/verify-otp` — OTP verification
- `POST /api/auth/refresh` — Refresh JWT token
- `POST /api/auth/responder-login` — Responder badge login

### Patient
- `POST /api/patient/profile` — Create emergency profile
- `PUT /api/patient/profile` — Update emergency profile
- `GET /api/patient/profile` — Get patient's profile
- `GET /api/patient/qr-card` — Download PDF QR card

### Emergency Access
- `POST /api/emergency/scan` — QR scan endpoint (responder)
- `GET /api/emergency/sync` — Offline sync (last 50 profiles)

### Admin
- `GET /api/admin/responders` — List responders
- `POST /api/admin/responders` — Create responder
- `DELETE /api/admin/responders/:id` — Deactivate responder
- `GET /api/admin/audit-logs` — Get audit logs with filters
- `GET /api/admin/stats` — System statistics

### USSD
- `POST /api/ussd/webhook` — Africa's Talking USSD webhook

## Database Schema

### Core Tables
- `users` — Manus OAuth users (extended with responder role)
- `patients` — Patient registration
- `emergencyProfiles` — Encrypted patient medical data
- `qrCodes` — QR code tokens and metadata
- `responders` — Responder registry with badge ID
- `facilities` — Healthcare facilities
- `auditLogs` — Immutable access logs
- `otps` — OTP storage and verification
- `otpAttempts` — Rate limiting tracking

## Security Considerations

### Data Encryption
- All sensitive patient data encrypted with AES-256-GCM before storage
- QR payloads encrypted with 30-day expiration
- Decryption only during authorized responder access

### Authentication
- JWT tokens with short expiration (15 min access, 7 day refresh)
- Responder badge + PIN verification
- Patient phone + OTP verification

### Audit Trail
- Every profile access logged immutably
- Timestamp, responder ID, patient ID, access method, IP address
- Accessible only to admins

### Rate Limiting
- Auth endpoints: 3 attempts per minute per IP
- API endpoints: 10 requests per second per IP
- USSD: No rate limit (Africa's Talking managed)

## Offline Functionality

### Service Worker
- **Network-first strategy** for API calls (try network, fall back to cache)
- **Cache-first strategy** for static assets
- **Background sync** for queued audit logs
- **Push notifications** for patient alerts

### IndexedDB Cache
- Stores last 50 emergency profiles (LRU eviction)
- Stores queued audit logs for background sync
- Automatic cleanup on storage quota exceeded

### Responder Offline Mode
- Access cached profiles without internet
- Torch toggle for QR scanning
- Offline indicator badge
- Automatic sync when back online

## Testing

```bash
# Unit tests
pnpm test

# Type checking
pnpm check

# Build
pnpm build

# Format
pnpm format
```

## Deployment

### Development
```bash
pnpm dev
```

### Production (Docker)
```bash
docker-compose up -d
```

### Production (Manual)
```bash
pnpm build
NODE_ENV=production node dist/index.js
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## Environment Variables

Required:
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET` — JWT signing secret
- `ENCRYPTION_KEY` — AES-256 encryption key (32 bytes)
- `VITE_APP_ID` — Manus OAuth app ID
- `OWNER_OPEN_ID` — Owner's Manus OpenID
- `OWNER_NAME` — Owner's name

Optional:
- `AFRICAS_TALKING_API_KEY` — Africa's Talking API key
- `AFRICAS_TALKING_USERNAME` — Africa's Talking username
- `VITE_VAPID_PUBLIC_KEY` — Push notification VAPID key

## Monitoring

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Logs
```bash
# API logs
docker-compose logs api

# Nginx logs
docker-compose logs nginx

# Database logs
docker-compose logs db
```

### Metrics
- Nginx access/error logs
- API response times
- Database query performance
- Service worker cache hit rate

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Verify `public/sw.js` exists
- Clear browser cache and reload

### Offline Mode Not Working
- Check IndexedDB in DevTools
- Verify service worker is active
- Test with Chrome DevTools offline mode

### QR Scanning Issues
- Check camera permissions
- Verify QR code is valid
- Try torch toggle for better lighting

### Database Connection Error
- Verify `DATABASE_URL` is correct
- Check MySQL is running
- Verify credentials

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checks
5. Submit a pull request

## License

MIT

## Support

For issues or questions:
- Check [DEPLOYMENT.md](./DEPLOYMENT.md)
- Review logs: `docker-compose logs -f`
- Contact: support@myuzima.rw

## Acknowledgments

Built for emergency medical response in Rwanda with offline-first architecture optimized for 3G networks and feature phones.
