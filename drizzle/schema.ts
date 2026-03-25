import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, boolean, json } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "responder"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * User table extended for MyUZIMA roles
 * - user: patient or general user
 * - admin: system administrator (manages responders, views audit logs)
 * - responder: emergency responder (scans QR codes, accesses emergency profiles)
 */
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Extend the users table role enum to include responder roles
 * This allows admin users to manage responders
 */

/**
 * Patient table: Core patient identity with phone-based registration
 * Phone is the primary identifier for USSD and SMS flows
 */
export const patients = mysqlTable("patients", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  phoneVerified: boolean("phoneVerified").default(false).notNull(),
  consentGiven: boolean("consentGiven").default(false).notNull(),
  consentTimestamp: timestamp("consentTimestamp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * EmergencyProfile table: Encrypted medical data for each patient
 * All sensitive fields (bloodType, allergies, medications, conditions, contacts) are AES-256-GCM encrypted
 * Encryption happens at application layer before DB write; decryption only on authorized access
 */
export const emergencyProfiles = mysqlTable("emergencyProfiles", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: varchar("patientId", { length: 64 }).notNull().unique(),
  // All sensitive fields stored as encrypted strings
  bloodType: text("bloodType").notNull(), // ENCRYPTED: e.g., "A+", "B-", "AB+", "O-"
  allergies: text("allergies").notNull(), // ENCRYPTED JSON array: [{name, severity}]
  medications: text("medications").notNull(), // ENCRYPTED JSON array: [{name, dosage, frequency}]
  conditions: text("conditions").notNull(), // ENCRYPTED JSON array: ["diabetes", "hypertension"]
  contacts: text("contacts").notNull(), // ENCRYPTED JSON array: [{name, phone, relation}]
  isActive: boolean("isActive").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmergencyProfile = typeof emergencyProfiles.$inferSelect;
export type InsertEmergencyProfile = typeof emergencyProfiles.$inferInsert;

/**
 * QRCode table: Encrypted reference tokens for QR scanning
 * Payload is AES-256-GCM encrypted reference token (not plain patient ID)
 * Decrypt server-side on scan to retrieve profile
 */
export const qrCodes = mysqlTable("qrCodes", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  profileId: varchar("profileId", { length: 64 }).notNull().unique(),
  encryptedPayload: text("encryptedPayload").notNull(), // AES-256-GCM encrypted reference token
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QRCode = typeof qrCodes.$inferSelect;
export type InsertQRCode = typeof qrCodes.$inferInsert;

/**
 * Facility table: Health facilities where responders work
 * Used for responder assignment and audit log filtering
 */
export const facilities = mysqlTable("facilities", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  district: varchar("district", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = typeof facilities.$inferInsert;

/**
 * Responder table: Emergency responders (EMT, Doctor, Nurse)
 * Badge-based authentication with PIN verification
 * badgeId is unique identifier for responder
 */
export const responders = mysqlTable("responders", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  badgeId: varchar("badgeId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["EMT", "DOCTOR", "NURSE"]).notNull(),
  facilityId: varchar("facilityId", { length: 64 }).notNull(),
  pinHash: text("pinHash").notNull(), // Hashed PIN for authentication
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Responder = typeof responders.$inferSelect;
export type InsertResponder = typeof responders.$inferInsert;

/**
 * AuditLog table: Immutable record of all profile accesses
 * Append-only; no UPDATE or DELETE allowed (enforced by DB trigger)
 * Tracks: who accessed, when, how (QR/USSD/offline), from where
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  responderId: varchar("responderId", { length: 64 }).notNull(),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  accessMethod: mysqlEnum("accessMethod", ["QR_SCAN", "USSD", "OFFLINE_CACHE"]).notNull(),
  deviceIp: varchar("deviceIp", { length: 45 }).notNull(), // IPv4 or IPv6
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // No updatedAt — immutable by design; DB trigger prevents UPDATE/DELETE
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * OTPAttempt table: Track OTP verification attempts for rate limiting
 * Max 3 attempts per phone → 30-minute lockout
 */
export const otpAttempts = mysqlTable("otpAttempts", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull(),
  attempts: int("attempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OTPAttempt = typeof otpAttempts.$inferSelect;
export type InsertOTPAttempt = typeof otpAttempts.$inferInsert;

/**
 * OTP table: Store generated OTPs with expiration
 * Used for phone verification during patient registration
 */
export const otps = mysqlTable("otps", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OTP = typeof otps.$inferSelect;
export type InsertOTP = typeof otps.$inferInsert;

/**
 * Relations for Drizzle ORM
 */
export const patientRelations = relations(patients, ({ one }) => ({
  emergencyProfile: one(emergencyProfiles, {
    fields: [patients.id],
    references: [emergencyProfiles.patientId],
  }),
}));

export const emergencyProfileRelations = relations(emergencyProfiles, ({ one }) => ({
  patient: one(patients, {
    fields: [emergencyProfiles.patientId],
    references: [patients.id],
  }),
  qrCode: one(qrCodes, {
    fields: [emergencyProfiles.id],
    references: [qrCodes.profileId],
  }),
}));

export const qrCodeRelations = relations(qrCodes, ({ one }) => ({
  profile: one(emergencyProfiles, {
    fields: [qrCodes.profileId],
    references: [emergencyProfiles.id],
  }),
}));

export const responderRelations = relations(responders, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [responders.facilityId],
    references: [facilities.id],
  }),
  auditLogs: many(auditLogs),
}));

export const facilityRelations = relations(facilities, ({ many }) => ({
  responders: many(responders),
}));

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  responder: one(responders, {
    fields: [auditLogs.responderId],
    references: [responders.id],
  }),
}));