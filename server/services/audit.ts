import { getDb } from "../db";
import { auditLogs, InsertAuditLog } from "../../drizzle/schema";
import { eq, and, gte, lte, count } from "drizzle-orm"; // 1. Added 'count' to imports

/**
 * HELPER: Generates consistent SQL WHERE conditions.
 * This ensures the filters used for 'counting' always match the 'results list'.
 */
function buildAuditConditions(filters?: {
  responderId?: string;
  patientId?: string;
  accessMethod?: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
  startDate?: Date;
  endDate?: Date;
}) {
  const conditions = [];

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

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Write an immutable audit log entry
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
 * Retrieve audit logs for a responder
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
 * Retrieve all audit logs with pagination and filtering
 */
export async function getAllAuditLogs(
  limit: number = 100,
  offset: number = 0,
  filters?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 2. We now use the helper to get our filters
  const whereClause = buildAuditConditions(filters);

  return await db
    .select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(auditLogs.timestamp)
    .limit(limit)
    .offset(offset);
}

// NOTE: I am leaving countAuditLogs as it is for now so you can confirm Step 1 works.
export async function countAuditLogs(filters?: any): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [];
  if (filters?.responderId) conditions.push(eq(auditLogs.responderId, filters.responderId));
  if (filters?.patientId) conditions.push(eq(auditLogs.patientId, filters.patientId));
  // ... (leaving this messy for one more minute)
  
  const baseQuery = db.select().from(auditLogs);
  let query: any = baseQuery;
  if (conditions.length > 0) {
    query = baseQuery.where(and(...conditions));
  }
  const result = await query;
  return result.length;
}
