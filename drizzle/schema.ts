import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core"; // Added 'index'
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "responder"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Patient table: Core patient identity with phone-based registration
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
 */
export const emergencyProfiles = mysqlTable("emergencyProfiles", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: varchar("patientId", { length: 64 }).notNull().unique(),
  bloodType: text("bloodType").notNull(), 
  allergies: text("allergies").notNull(), 
  medications: text("medications").notNull(), 
  conditions: text("conditions").notNull(), 
  contacts: text("contacts").notNull(), 
  isActive: boolean("isActive").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmergencyProfile = typeof emergencyProfiles.$inferSelect;
export type InsertEmergencyProfile = typeof emergencyProfiles.$inferInsert;

/**
 * QRCode table: Encrypted reference tokens for QR scanning
 */
export const qrCodes = mysqlTable("qrCodes", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  profileId: varchar("profileId", { length: 64 }).notNull().unique(),
  encryptedPayload: text("encryptedPayload").notNull(), 
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Facility table: Health facilities where responders work
 */
export const facilities = mysqlTable("facilities", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  district: varchar("district", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Responder table: Emergency responders (EMT, Doctor, Nurse)
 */
export const responders = mysqlTable("responders", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  badgeId: varchar("badgeId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["EMT", "DOCTOR", "NURSE"]).notNull(),
  facilityId: varchar("facilityId", { length: 64 }).notNull(),
  pinHash: text("pinHash").notNull(), 
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * AuditLog table: Immutable record of all profile accesses
 * Optimization: Indexes added on filtered columns for high-speed count and search queries.
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  responderId: varchar("responderId", { length: 64 }).notNull(),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  accessMethod: mysqlEnum("accessMethod", ["QR_SCAN", "USSD", "OFFLINE_CACHE"]).notNull(),
  deviceIp: varchar("deviceIp", { length: 45 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // INDEXES: Critical for performance as the audit log grows.
  // These allow the database to search/count without scanning every row.
  patientIdx: index("patient_idx").on(table.patientId),
  responderIdx: index("responder_idx").on(table.responderId),
  timestampIdx: index("timestamp_idx").on(table.timestamp),
  methodIdx: index("method_idx").on(table.accessMethod), // Useful for filtering by USSD/QR
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * OTPAttempt table: Track OTP verification attempts for rate limiting
 */
export const otpAttempts = mysqlTable("otpAttempts", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull(),
  attempts: int("attempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Optimization: Fast lookup by phone number for the lockout check.
  phoneIdx: index("phone_attempts_idx").on(table.phone),
}));

/**
 * OTP table: Store generated OTPs with expiration
 */
export const otps = mysqlTable("otps", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Optimization: Speeds up finding the valid OTP record during verification.
  otpLookupIdx: index("otp_lookup_idx").on(table.phone, table.code, table.used),
}));

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
