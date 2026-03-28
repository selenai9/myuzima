/**
 * MockStore — In-memory database for demo/dev mode.
 * Activated automatically when DATABASE_URL is not set.
 * Pre-seeded with demo data for immediate testing.
 *
 * Demo Credentials:
 *  Patient phone: +250788123456  →  OTP: 123456
 *  Responder:     Badge DEMO001  →  PIN: 1234
 *  Admin:         Badge ADMIN01  →  PIN: 0000
 */

import bcryptjs from "bcryptjs";

function uuid(): string {
  return globalThis.crypto.randomUUID();
}
const now = () => new Date();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MockPatient {
  id: string;
  phone: string;
  phoneVerified: boolean;
  consentGiven: boolean;
  consentTimestamp: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockEmergencyProfile {
  id: string;
  patientId: string;
  bloodType: string;
  allergies: string;     // JSON string
  medications: string;   // JSON string
  conditions: string;    // JSON string
  contacts: string;      // JSON string
  isActive: boolean;
  updatedAt: Date;
}

export interface MockResponder {
  id: string;
  badgeId: string;
  name: string;
  role: "EMT" | "DOCTOR" | "NURSE";
  facilityId: string;
  pinHash: string;
  isActive: boolean;
  createdAt: Date;
}

export interface MockOTP {
  id: string;
  phone: string;
  code: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface MockOTPAttempt {
  id: string;
  phone: string;
  attempts: number;
  lockedUntil: Date | null;
}

export interface MockAuditLog {
  id: string;
  patientId: string;
  accessorId: string;
  accessorName: string;
  action: string;
  accessType: string;
  timestamp: Date;
}

export interface MockFacility {
  id: string;
  name: string;
  location: string;
  createdAt: Date;
}

// ─── Store ────────────────────────────────────────────────────────────────────

class MockStore {
  patients = new Map<string, MockPatient>();
  patientsByPhone = new Map<string, MockPatient>();

  emergencyProfiles = new Map<string, MockEmergencyProfile>();
  profilesByPatient = new Map<string, MockEmergencyProfile>();

  responders = new Map<string, MockResponder>();
  respondersByBadge = new Map<string, MockResponder>();

  otps = new Map<string, MockOTP>();
  otpAttempts = new Map<string, MockOTPAttempt>();

  auditLogs: MockAuditLog[] = [];
  facilities = new Map<string, MockFacility>();
  qrCodes = new Map<string, { profileId: string; token: string }>();

  constructor() {
    this._seed();
  }

  private _seed() {
    // ── Facility ──────────────────────────────────────────
    const facility: MockFacility = {
      id: "facility-demo-1",
      name: "King Faisal Hospital, Kigali",
      location: "KG 544 St, Kigali, Rwanda",
      createdAt: now(),
    };
    this.facilities.set(facility.id, facility);

    // ── Responder (DEMO001 / 1234) ─────────────────────────
    const responder: MockResponder = {
      id: "responder-demo-1",
      badgeId: "DEMO001",
      name: "Dr. Mutesi Amina",
      role: "DOCTOR",
      facilityId: facility.id,
      pinHash: bcryptjs.hashSync("1234", 8),
      isActive: true,
      createdAt: now(),
    };
    this.responders.set(responder.id, responder);
    this.respondersByBadge.set(responder.badgeId, responder);

    // ── Admin Responder (ADMIN01 / 0000) ───────────────────
    const admin: MockResponder = {
      id: "responder-admin-1",
      badgeId: "ADMIN01",
      name: "System Administrator",
      role: "DOCTOR",
      facilityId: facility.id,
      pinHash: bcryptjs.hashSync("0000", 8),
      isActive: true,
      createdAt: now(),
    };
    this.responders.set(admin.id, admin);
    this.respondersByBadge.set(admin.badgeId, admin);

    // ── Patient (+250788123456) ────────────────────────────
    const patient: MockPatient = {
      id: "patient-demo-1",
      phone: "+250788123456",
      phoneVerified: true,
      consentGiven: true,
      consentTimestamp: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    this.patients.set(patient.id, patient);
    this.patientsByPhone.set(patient.phone, patient);

    // ── Emergency Profile ──────────────────────────────────
    const profile: MockEmergencyProfile = {
      id: "profile-demo-1",
      patientId: patient.id,
      bloodType: "O+",
      allergies: JSON.stringify([
        { name: "Penicillin", severity: "severe" },
        { name: "Shellfish", severity: "moderate" },
      ]),
      medications: JSON.stringify([
        { name: "Lisinopril", dosage: "10mg", frequency: "Once daily" },
        { name: "Metformin", dosage: "500mg", frequency: "Twice daily" },
      ]),
      conditions: JSON.stringify(["Hypertension", "Type 2 Diabetes"]),
      contacts: JSON.stringify([
        { name: "Jean Mutabazi", phone: "+250789000001", relation: "Spouse" },
        { name: "Marie Uwase", phone: "+250789000002", relation: "Mother" },
      ]),
      isActive: true,
      updatedAt: now(),
    };
    this.emergencyProfiles.set(profile.id, profile);
    this.profilesByPatient.set(profile.patientId, profile);

    // ── Demo QR ───────────────────────────────────────────
    this.qrCodes.set(profile.id, {
      profileId: profile.id,
      token: "demo-qr-token-profile-demo-1",
    });

    // ── Audit Logs ────────────────────────────────────────
    const baseTime = Date.now();
    [
      { ago: 3600000, name: "Dr. Mutesi Amina", type: "QR_SCAN" },
      { ago: 86400000, name: "EMT Karangwa Eric", type: "QR_SCAN" },
      { ago: 172800000, name: "Dr. Umuziranenge", type: "OFFLINE_CACHE" },
    ].forEach(({ ago, name, type }) => {
      this.auditLogs.push({
        id: uuid(),
        patientId: patient.id,
        accessorId: responder.id,
        accessorName: name,
        action: "scan",
        accessType: type,
        timestamp: new Date(baseTime - ago),
      });
    });
  }

  // ─── Patient helpers ────────────────────────────────────

  createPatient(phone: string): MockPatient {
    const p: MockPatient = {
      id: uuid(),
      phone,
      phoneVerified: false,
      consentGiven: false,
      consentTimestamp: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.patients.set(p.id, p);
    this.patientsByPhone.set(phone, p);
    return p;
  }

  updatePatientConsent(id: string) {
    const p = this.patients.get(id);
    if (p) {
      p.consentGiven = true;
      p.consentTimestamp = now();
      p.updatedAt = now();
    }
  }

  // ─── Profile helpers ────────────────────────────────────

  createOrUpdateProfile(
    patientId: string,
    data: Omit<MockEmergencyProfile, "id" | "patientId" | "isActive" | "updatedAt">
  ): MockEmergencyProfile {
    const existing = this.profilesByPatient.get(patientId);
    if (existing) {
      Object.assign(existing, data, { updatedAt: now() });
      return existing;
    }
    const p: MockEmergencyProfile = {
      id: uuid(),
      patientId,
      ...data,
      isActive: true,
      updatedAt: now(),
    };
    this.emergencyProfiles.set(p.id, p);
    this.profilesByPatient.set(patientId, p);
    return p;
  }

  // ─── OTP helpers ────────────────────────────────────────

  createOTP(phone: string, code: string): MockOTP {
    const otp: MockOTP = {
      id: uuid(),
      phone,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      used: false,
      createdAt: now(),
    };
    this.otps.set(otp.id, otp);
    return otp;
  }

  findValidOTP(phone: string, code: string): MockOTP | null {
    const MASTER = "123456";
    for (const otp of this.otps.values()) {
      if (
        otp.phone === phone &&
        !otp.used &&
        otp.expiresAt > now() &&
        (otp.code === code || code === MASTER)
      ) {
        return otp;
      }
    }
    // If master code used and no OTP exists yet, create a synthetic match
    if (code === MASTER) {
      const synthetic = this.createOTP(phone, MASTER);
      return synthetic;
    }
    return null;
  }

  markOTPUsed(id: string) {
    const otp = this.otps.get(id);
    if (otp) otp.used = true;
  }

  // ─── Audit log helpers ───────────────────────────────────

  addAuditLog(log: Omit<MockAuditLog, "id" | "timestamp">): MockAuditLog {
    const entry: MockAuditLog = { id: uuid(), timestamp: now(), ...log };
    this.auditLogs.push(entry);
    return entry;
  }

  getAuditLogs(opts: {
    patientId?: string;
    limit?: number;
    offset?: number;
  }): MockAuditLog[] {
    let logs = [...this.auditLogs].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    if (opts.patientId) {
      logs = logs.filter((l) => l.patientId === opts.patientId);
    }
    return logs.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50));
  }
}

export const mockStore = new MockStore();

/** Returns true when the app is running without a real database */
export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}
