# MyUZIMA Emergency QR Access System — TODO

## Database & Backend Foundation
- [x] Design Prisma schema with Patient, EmergencyProfile, QRCode, Responder, Facility, AuditLog models
- [x] Implement AES-256-GCM encryption service for sensitive fields
- [x] Create PostgreSQL audit log trigger for immutability
- [x] Set up database migrations and seed data

## Authentication & Security
- [x] Implement OTP generation and SMS delivery via Africa's Talking
- [x] Build patient registration flow with phone verification
- [x] Implement JWT token generation (15 min access, 7 day refresh)
- [x] Build responder badge authentication with PIN verification
- [x] Implement rate limiting on auth endpoints (3 attempts → 30 min lockout)
- [ ] Add Helmet.js security headers
- [x] Implement RBAC middleware for responder verification

## QR Code & Profile Management
- [x] Implement AES-256-GCM QR payload encryption
- [x] Build QR code generation service
- [x] Implement PDF export for emergency cards
- [x] Create patient profile creation/update endpoints
- [x] Implement profile decryption on authorized access

## Emergency Access & Audit
- [x] Build emergency profile scan endpoint with responder verification
- [x] Implement audit log writer (immutable)
- [x] Build async SMS notification service for patient alerts
- [x] Create audit log retrieval endpoint with pagination/filters

## Frontend — Patient App
- [x] Set up React 18 + TypeScript + Vite PWA scaffold
- [x] Implement phone registration screen with OTP entry
- [x] Build consent screen
- [x] Create emergency profile form (blood type, allergies, medications, conditions, contacts)
- [x] Implement profile edit functionality
- [x] Build QR card display screen with PDF download
- [ ] Create access history viewer
- [x] Implement i18n (Kinyarwanda primary, English secondary)

## Frontend — Responder App
- [x] Build badge login screen (badgeId + PIN)
- [x] Implement QR scanner with camera integration (html5-qrcode)
- [x] Build emergency profile display screen with critical safety features:
  - [x] Blood type badge (color-coded A/B/AB/O)
  - [x] Allergies in red warning boxes (DATA UNAVAILABLE banner if fetch fails)
  - [x] Medications list with dosage
  - [x] Chronic conditions list
  - [x] Emergency contacts with tap-to-call
  - [ ] Skeleton loader for 3-second load target
  - [ ] Minimum 14pt font, one-hand operable layout
- [x] Implement offline mode indicator
- [x] Add torch toggle for QR scanner

## Frontend — Admin Dashboard
- [x] Build responder registry CRUD interface
- [x] Create audit log viewer with pagination and filters
- [x] Implement system stats (patient count, total scans, uptime)

## Offline & PWA
- [x] Configure Workbox service worker with NetworkFirst strategy
- [x] Implement IndexedDB cache for emergency profiles (max 50 entries, LRU eviction)
- [x] Build offline sync mechanism for queued audit logs
- [x] Create Web App Manifest with standalone display
- [x] Implement background sync for connectivity restoration
- [ ] Test offline mode with Chrome DevTools

## USSD Fallback
- [x] Implement Africa's Talking USSD webhook handler
- [x] Build patient registration flow (*777# → 1)
- [x] Build responder lookup flow (*777# → 2)
- [x] Implement stateful session management for USSD

## Internationalization
- [x] Create rw.json (Kinyarwanda) translation file
- [x] Create en.json (English) translation file
- [x] Implement react-i18next setup
- [x] Translate all UI strings

## DevOps & Infrastructure
- [x] Create Dockerfile for API service
- [ ] Create Dockerfile for PWA service
- [x] Set up Docker Compose with MySQL, API, Nginx
- [x] Configure Nginx reverse proxy with TLS 1.3
- [x] Set up environment configuration template
- [x] Create health check endpoint (/api/health)
- [x] Create comprehensive deployment documentation
- [x] Create comprehensive README with feature overview

## Testing & Validation
- [ ] Write vitest tests for encryption service
- [ ] Write vitest tests for QR generation
- [ ] Write vitest tests for auth flows
- [ ] Write vitest tests for emergency scan endpoint
- [ ] Test 3G throttling with Chrome DevTools (3-second load target)
- [ ] Test offline mode with IndexedDB cache
- [ ] Test audit log immutability
- [ ] Validate Lighthouse PWA audit

## Acceptance Criteria Verification
- [ ] Patient can register with phone + OTP and create full emergency profile
- [ ] Patient can download QR card as PDF
- [ ] Responder can scan QR and see profile within 3 seconds on 3G
- [ ] Unverified user sees summary only + DATA UNAVAILABLE warning
- [ ] Allergies/medications show DATA UNAVAILABLE banner if fetch fails (never blank)
- [ ] Emergency profile accessible offline from IndexedDB cache
- [ ] Every scan writes immutable audit log entry
- [ ] Patient receives SMS notification within 1 hour of profile access
- [ ] All API endpoints require valid JWT (except /auth/*, /ussd)
- [ ] All sensitive fields AES-256 encrypted in database
- [ ] App passes Lighthouse PWA audit
- [ ] All UI strings have Kinyarwanda translations
- [ ] Docker Compose `up` starts full stack with single command
