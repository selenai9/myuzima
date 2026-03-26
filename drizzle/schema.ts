import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { crypto } from "node:crypto";

/**
 * Patients table: Core identity with phone-based registration.
 * Added: consentGiven and consentTimestamp are already here, 
 * just ensuring they are correctly configured for MySQL.
 */
export const patients = mysqlTable("patients", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  phoneVerified: boolean("phoneVerified").default(false).notNull(),
  
  // H-04 Compliance: PERSISTENT CONSENT
  // Ensure these match the property names used in your patient.ts router
  consentGiven: boolean("consentGiven").default(false).notNull(),
  consentTimestamp: timestamp("consentTimestamp"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * EmergencyProfile table: Encrypted medical data for each patient.
 * Optimization: Unique constraint on patientId ensures one profile per patient.
 */
export const emergencyProfiles = mysqlTable("emergencyProfiles", {
  id: varchar("id", { length: 64 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: varchar("patientId", { length: 64 }).notNull().unique(),
  
  // Medical data stored as encrypted strings/JSON
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

export type EmergencyProfile = typeof emergencyProfiles.$inferSelect;
export type InsertEmergencyProfile = typeof emergencyProfiles.$inferInsert;

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
 * Relations - Updated to ensure clear linking for the Transaction logic
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

// ... (keep the rest of your tables like users, responders, and auditLogs as they were)
