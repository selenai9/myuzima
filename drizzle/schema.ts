import { mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Facilities table: Medical centers/hospitals
 */
export const facilities = mysqlTable("facilities", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  location: text("location"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Responders table: Authorized medical staff (EMTs, Doctors, Nurses)
 */
export const responders = mysqlTable("responders", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  badgeId: varchar("badgeId", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["EMT", "DOCTOR", "NURSE"]).notNull(),
  facilityId: varchar("facilityId", { length: 64 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(), // Stores bcrypt hash
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  badgeIdx: index("badge_id_idx").on(table.badgeId),
  facilityIdx: index("responder_facility_idx").on(table.facilityId),
}));

/**
 * Patients table: Core identity.
 */
export const patients = mysqlTable("patients", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
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
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
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
 * AuditLogs table: Essential for Patient Access History.
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  patientId: varchar("patientId", { length: 64 }).notNull(),
  accessorId: varchar("accessorId", { length: 64 }).notNull(),
  accessorName: varchar("accessorName", { length: 255 }).notNull(),
  action: mysqlEnum("action", ["view", "update", "export", "scan"]).default("view").notNull(),
  accessType: varchar("accessType", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  patientIdx: index("audit_patient_idx").on(table.patientId),
  timeIdx: index("audit_timestamp_idx").on(table.timestamp),
}));

/**
 * QRCode table: Token mapping for physical cards.
 */
export const qrCodes = mysqlTable("qrCodes", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  profileId: varchar("profileId", { length: 64 }).notNull().unique(),
  encryptedPayload: text("encryptedPayload").notNull(), 
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ==========================================
// RELATIONS
// ==========================================

export const facilityRelations = relations(facilities, ({ many }) => ({
  responders: many(responders),
}));

export const responderRelations = relations(responders, ({ one }) => ({
  facility: one(facilities, {
    fields: [responders.facilityId],
    references: [facilities.id],
  }),
}));

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

export const qrCodeRelations = relations(qrCodes, ({ one }) => ({
  emergencyProfile: one(emergencyProfiles, {
    fields: [qrCodes.profileId],
    references: [emergencyProfiles.id],
  }),
}));
