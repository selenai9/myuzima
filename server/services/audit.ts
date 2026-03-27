import { getDb } from "../db";
import { auditLogs, type InsertAuditLog } from "../../drizzle/schema";
import { eq, and, gte, lte, count, desc } from "drizzle-orm";

/**
 * HELPER: Generates consistent SQL WHERE conditions.
 * Ensures the filters used for 'counting' always match the 'results list'.
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
    conditions.push(eq(auditLogs.accessorId, filters.responderId));
  }
  if (filters?.patientId) {
    conditions.push(eq(auditLogs.patientId, filters.patientId));
  }
  if (filters?.accessMethod) {
    // Mapping the frontend 'accessMethod' to the schema 'accessType'
    conditions.push(eq(auditLogs.accessType, filters.accessMethod));
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
  accessorId: string,
  accessorName: string,
  patientId: string,
  accessType: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const auditEntry: InsertAuditLog = {
    accessorId,
    accessorName,
    patientId,
    accessType,
    action: "scan",
    timestamp: new Date(),
  };

  await db.insert(auditLogs).values(auditEntry);
}

/**
 * Retrieve all audit logs with pagination and filtering
 */
export async function getAllAuditLogs(
  limit: number = 50,
  offset: number = 0,
  filters?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = buildAuditConditions(filters);

  return await db
    .select()
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.timestamp)) // Newest logs first
    .limit(limit)
    .offset(offset);
}

/**
 * Count total audit logs matching filters (Optimized SQL Count)
 */
export async function countAuditLogs(filters?: any): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = buildAuditConditions(filters);

  const [result] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(whereClause);

  return result?.value ?? 0;
}

/**
 * Retrieve audit logs for a specific patient (Shortcut helper)
 */
export async function getPatientAuditLogs(patientId: string, limit: number = 50, offset: number = 0) {
  return getAllAuditLogs(limit, offset, { patientId });
}

/**
 * Retrieve audit logs for a specific responder (Shortcut helper)
 */
export async function getResponderAuditLogs(responderId: string, limit: number = 50, offset: number = 0) {
  return getAllAuditLogs(limit, offset, { responderId });
}
