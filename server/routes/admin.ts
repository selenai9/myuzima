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
  startDate: z.preprocess((arg) => (typeof arg === "string" ? new Date(arg) : arg), z.date().optional()),
  endDate: z.preprocess((arg) => (typeof arg === "string" ? new Date(arg) : arg), z.date().optional()),
  limit: z.preprocess((val) => Number(val), z.number().int().min(1).max(100).default(50)),
  offset: z.preprocess((val) => Number(val), z.number().int().min(0).default(0)),
});

/**
 * GET /api/admin/responders
 */
router.get("/responders", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Proactive Security: Select all fields EXCEPT pinHash
    const allResponders = await db.select({
      id: responders.id,
      badgeId: responders.badgeId,
      name: responders.name,
      role: responders.role,
      facilityId: responders.facilityId,
      isActive: responders.isActive,
      createdAt: responders.createdAt
    }).from(responders);

    res.json({
      success: true,
      responders: allResponders,
    });
  } catch (error) {
    console.error("[Admin] Responder list error:", error);
    res.status(500).json({ error: "Failed to fetch responders" });
  }
});

/**
 * GET /api/admin/facilities
 */
router.get("/facilities", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allFacilities = await db.select().from(facilities);

    res.json({
      success: true,
      facilities: allFacilities,
    });
  } catch (error) {
    console.error("[Admin] Facility list error:", error);
    res.status(500).json({ error: "Failed to fetch facilities" });
  }
});

/**
 * POST /api/admin/responder
 */
router.post("/responder", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const data = createResponderSchema.parse(req.body);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const pinHash = await bcryptjs.hash(data.pin, 10);

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
 * DELETE /api/admin/responder/:id
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
 * GET /api/admin/audit-logs
 */
router.get("/audit-logs", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = auditLogFilterSchema.parse(req.query);

    const [logs, total] = await Promise.all([
      getAllAuditLogs(parsed.limit, parsed.offset, parsed),
      countAuditLogs(parsed)
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        limit: parsed.limit,
        offset: parsed.offset,
        total,
        totalPages: Math.ceil(total / parsed.limit),
        hasMore: parsed.offset + parsed.limit < total,
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
 * GET /api/admin/stats
 */
router.get("/stats", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
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
