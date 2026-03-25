import { getDb } from "../db";
import { auditLogs, InsertAuditLog } from "../../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * Write an immutable audit log entry
 * Audit logs are append-only and cannot be modified or deleted
 * Database trigger enforces immutability by preventing UPDATE/DELETE operations
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

  await db.insert(auditLogs).values(auditEntry);
}

/**
 * Retrieve audit logs for a patient
 * Used for showing access history to the patient
 */
export async function getPatientAuditLogs(patientId: string, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.patientId, patientId))
    .orderBy(auditLogs.timestamp)
    .limit(limit)
    .offset(offset);

  return logs;
}

/**
 * Retrieve audit logs for a responder
 * Used for admin dashboard to track responder activity
 */
export async function getResponderAuditLogs(responderId: string, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.responderId, responderId))
    .orderBy(auditLogs.timestamp)
    .limit(limit)
    .offset(offset);

  return logs;
}

/**
 * Retrieve all audit logs with pagination and filtering
 * Used for admin dashboard
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

  const conditions: any[] = [];

  if (filters?.responderId) {
    conditions.push(eq(auditLogs.responderId, filters.responderId));
  }
  if (filters?.patientId) {
    conditions.push(eq(auditLogs.patientId, filters.patientId));
  }
  if (filters?.accessMethod) {
    conditions.push(eq(auditLogs.accessMethod, filters.accessMethod));
  }
  if (filters?.startDate) {
    conditions.push(gte(auditLogs.timestamp, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(auditLogs.timestamp, filters.endDate));
  }

  const baseQuery = db.select().from(auditLogs);

  let query: any = baseQuery;
  if (conditions.length > 0) {
    query = baseQuery.where(and(...conditions));
  }

  const logs = await query.orderBy(auditLogs.timestamp).limit(limit).offset(offset);

  return logs;
}

/**
 * Count total audit log entries
 * Used for pagination
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

  const conditions: any[] = [];

  if (filters?.responderId) {
    conditions.push(eq(auditLogs.responderId, filters.responderId));
  }
  if (filters?.patientId) {
    conditions.push(eq(auditLogs.patientId, filters.patientId));
  }
  if (filters?.accessMethod) {
    conditions.push(eq(auditLogs.accessMethod, filters.accessMethod));
  }
  if (filters?.startDate) {
    conditions.push(gte(auditLogs.timestamp, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(auditLogs.timestamp, filters.endDate));
  }

  const baseQuery = db.select().from(auditLogs);

  let query: any = baseQuery;
  if (conditions.length > 0) {
    query = baseQuery.where(and(...conditions));
  }

  const result = await query;
  return result.length;
}
