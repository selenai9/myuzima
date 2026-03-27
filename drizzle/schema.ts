import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { crypto } from "node:crypto";

/**
 * Patients table: Core identity with phone-based registration.
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

/**
 * EmergencyProfile table: Encrypted medical data.
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
}, (table) => ({
  patientIdProfileIdx: index("patient_id_profile_idx").on(table.patientId),
}));

/**
 * AuditLogs table: Tracks every time a profile is accessed.
 * REQUIRED for the "First Version" of patient.ts
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  accessorId: varchar("accessorId", { length: 64 }).notNull(), // Responder or Admin ID
  accessorName: varchar("accessorName", { length: 255 }).notNull(),
  action: mysqlEnum("action", ["view", "update", "export", "scan"]).default("view").notNull(),
  accessType: varchar("accessType", { length: 50 }).notNull(), // e.g., "QR_SCAN", "ADMIN_LOOKUP"
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  patientIdx: index("audit_patient_idx").on(table.patientId),
  timeIdx: index("audit_timestamp_idx").on(table.timestamp),
}));

/**
 * QRCode table: Reference tokens for scanning.
 */
export const qrCodes = mysqlTable("qrCodes", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  profileId: varchar("profileId", { length: 64 }).notNull().unique(),
  encryptedPayload: text("encryptedPayload").notNull(), 
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Relations
 */
export const patientRelations = relations(patients, ({ one, many }) => ({
  emergencyProfile: one(emergencyProfiles, {
    fields: [patients.id],
    references: [emergencyProfiles.patientId],
  }),
  auditLogs: many(auditLogs),
}));

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  patient: one(patients, {
    fields: [auditLogs.patientId],
    references: [patients.id],
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
