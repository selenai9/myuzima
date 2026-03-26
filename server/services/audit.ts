import { getDb } from "../db";
import { auditLogs, InsertAuditLog } from "../../drizzle/schema";
import { eq, and, gte, lte, count } from "drizzle-orm";

/**
 * IMMUTABLE AUDIT LOGGING
 * Pattern: Append-only ledger.
 * Purpose: Provides a tamper-proof record of every time a patient's medical 
 * data is accessed.
 */
export async function writeAuditLog(
  responderId: string,
  patientId: string,
  accessMethod: "QR_SCAN" | "USSD" | "OFFLINE_CACHE",
  deviceIp: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const auditEntry: InsertAuditLog = {
    responderId,
    patientId,
    accessMethod,
    deviceIp,
    timestamp: new Date(),
  };

  // Execution of the insert. Database-level triggers should prevent 
  // any future UPDATE or DELETE on this record.
  await db.insert(auditLogs).values(auditEntry);
}

/**
 * PATIENT-FACING LOGS
 * Fetches history so patients can monitor who has accessed their profile.
 */
export async function getPatientAuditLogs(patientId: string, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.patientId, patientId))
    .orderBy(auditLogs.timestamp)
    .limit(limit)
    .offset(offset);
}

/**
 * RESPONDER-FACING LOGS
 * Used for administrative oversight of specific healthcare providers.
 */
export async function getResponderAuditLogs(responderId: string, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.responderId, responderId))
    .orderBy(auditLogs.timestamp)
    .limit(limit)
    .offset(offset);
}

/**
 * GLOBAL AUDIT RETRIEVAL
 * Advanced filtering for admin dashboards. 
 * Implements dynamic 'WHERE' clause construction.
 */
export async function getAllAuditLogs(
  limit: number = 100,
  offset: number = 0,
  filters?: {
    responderId?: string;
    patientId?: string;
    accessMethod?: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
    startDate?: Date;
    endDate?: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (filters?.responderId) conditions.push(eq(auditLogs.responderId, filters.responderId));
  if (filters?.patientId) conditions.push(eq(auditLogs.patientId, filters.patientId));
  if (filters?.accessMethod) conditions.push(eq(auditLogs.accessMethod, filters.accessMethod));
  if (filters?.startDate) conditions.push(gte(auditLogs.timestamp, filters.startDate));
  if (filters?.endDate) conditions.push(lte(auditLogs.timestamp, filters.endDate));

  // Build query dynamically based on whether conditions exist
  const query = db.select().from(auditLogs);
  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  return await query.orderBy(auditLogs.timestamp).limit(limit).offset(offset);
}

/**
 * OPTIMIZED AGGREGATION: COUNT
 * Replaced memory-intensive 'select *' with SQL 'COUNT()' aggregation.
 * Efficiency: O(1) transfer instead of O(N).
 */
export async function countAuditLogs(filters?: {
  responderId?: string;
  patientId?: string;
  accessMethod?: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
  startDate?: Date;
  endDate?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (filters?.responderId) conditions.push(eq(auditLogs.responderId, filters.responderId));
  if (filters?.patientId) conditions.push(eq(auditLogs.patientId, filters.patientId));
  if (filters?.accessMethod) conditions.push(eq(auditLogs.accessMethod, filters.accessMethod));
  if (filters?.startDate) conditions.push(gte(auditLogs.timestamp, filters.startDate));
  if (filters?.endDate) conditions.push(lte(auditLogs.timestamp, filters.endDate));

  // SQL: SELECT count(*) FROM audit_logs WHERE ...
  const [result] = await db
    .select({ total: count() })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return result.total;
}
