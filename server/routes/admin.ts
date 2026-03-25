import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { getDb } from "../db";
import { responders, facilities } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getAllAuditLogs, countAuditLogs } from "../services/audit";
import { authMiddleware, adminAuthMiddleware } from "../middleware/auth";

const router = Router();

/**
 * Validation schemas
 */
const createResponderSchema = z.object({
  badgeId: z.string().min(1, "Badge ID required"),
  name: z.string().min(1, "Name required"),
  role: z.enum(["EMT", "DOCTOR", "NURSE"]),
  facilityId: z.string().min(1, "Facility ID required"),
  pin: z.string().length(4, "PIN must be 4 digits"),
});

const auditLogFilterSchema = z.object({
  responderId: z.string().optional(),
  patientId: z.string().optional(),
  accessMethod: z.enum(["QR_SCAN", "USSD", "OFFLINE_CACHE"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

/**
 * POST /admin/responder
 * Add responder to badge registry
 */
router.post("/responder", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const data = createResponderSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Hash PIN
    const pinHash = await bcryptjs.hash(data.pin, 10);

    // Create responder
    await db.insert(responders).values({
      badgeId: data.badgeId,
      name: data.name,
      role: data.role,
      facilityId: data.facilityId,
      pinHash,
      isActive: true,
    });

    res.json({
      success: true,
      message: "Responder created successfully",
      responder: {
        badgeId: data.badgeId,
        name: data.name,
        role: data.role,
      },
    });
  } catch (error) {
    console.error("[Admin] Responder creation error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Responder creation failed",
    });
  }
});

/**
 * DELETE /admin/responder/:id
 * Deactivate responder
 */
router.delete("/responder/:id", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(responders).set({ isActive: false }).where(eq(responders.id, id));

    res.json({
      success: true,
      message: "Responder deactivated successfully",
    });
  } catch (error) {
    console.error("[Admin] Responder deactivation error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Deactivation failed",
    });
  }
});

/**
 * GET /admin/audit-logs
 * Paginated audit log with filters
 */
router.get("/audit-logs", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const filters = auditLogFilterSchema.parse(req.query);

    // Parse date filters if provided
    const dateFilters: any = {};
    if (filters.startDate) {
      dateFilters.startDate = new Date(filters.startDate);
    }
    if (filters.endDate) {
      dateFilters.endDate = new Date(filters.endDate);
    }

    const auditFilters = {
      responderId: filters.responderId,
      patientId: filters.patientId,
      accessMethod: filters.accessMethod as any,
      ...dateFilters,
    };

    // Get audit logs
    const logs = await getAllAuditLogs(filters.limit, filters.offset, auditFilters);

    // Get total count
    const total = await countAuditLogs(auditFilters);

    res.json({
      success: true,
      logs,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total,
        hasMore: filters.offset + filters.limit < total,
      },
    });
  } catch (error) {
    console.error("[Admin] Audit log retrieval error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Audit log retrieval failed",
    });
  }
});

/**
 * GET /admin/stats
 * System statistics
 */
router.get("/stats", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get total audit logs (total scans)
    const totalScans = await countAuditLogs();

    res.json({
      success: true,
      stats: {
        totalScans,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("[Admin] Stats retrieval error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Stats retrieval failed",
    });
  }
});

export default router;
