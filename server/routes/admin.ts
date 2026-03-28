import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { getDb } from "../db";
import { responders, facilities } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getAllAuditLogs, countAuditLogs } from "../services/audit";
import { authMiddleware, adminAuthMiddleware } from "../middleware/auth";
import { isDemoMode, mockStore } from "../mockStore";

const router = Router();

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

// GET /admin/responders
router.get("/responders", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      const allResponders = [...mockStore.responders.values()].map((r) => ({
        id: r.id, badgeId: r.badgeId, name: r.name, role: r.role,
        facilityId: r.facilityId, isActive: r.isActive, createdAt: r.createdAt,
      }));
      return res.json({ success: true, responders: allResponders });
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const allResponders = await db.select({
      id: responders.id, badgeId: responders.badgeId, name: responders.name,
      role: responders.role, facilityId: responders.facilityId,
      isActive: responders.isActive, createdAt: responders.createdAt,
    }).from(responders);
    res.json({ success: true, responders: allResponders });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch responders" });
  }
});

// GET /admin/facilities
router.get("/facilities", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return res.json({ success: true, facilities: [...mockStore.facilities.values()] });
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const allFacilities = await db.select().from(facilities);
    res.json({ success: true, facilities: allFacilities });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch facilities" });
  }
});

// POST /admin/responder
router.post("/responder", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const data = createResponderSchema.parse(req.body);

    if (isDemoMode()) {
      const pinHash = await bcryptjs.hash(data.pin, 10);
      const newResponder = {
        id: globalThis.crypto.randomUUID(),
        badgeId: data.badgeId,
        name: data.name,
        role: data.role as "EMT" | "DOCTOR" | "NURSE",
        facilityId: data.facilityId,
        pinHash,
        isActive: true,
        createdAt: new Date(),
      };
      mockStore.responders.set(newResponder.id, newResponder);
      mockStore.respondersByBadge.set(newResponder.badgeId, newResponder);
      return res.json({ success: true, responderId: newResponder.id });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const existing = await db.select().from(responders).where(eq(responders.badgeId, data.badgeId)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "Badge ID already registered" });

    const pinHash = await bcryptjs.hash(data.pin, 10);
    const [newResponder] = await db.insert(responders).values({
      badgeId: data.badgeId, name: data.name, role: data.role,
      facilityId: data.facilityId, pinHash,
    }).$returningId();

    res.json({ success: true, responderId: newResponder.id });
  } catch (error) {
    res.status(400).json({ error: "Failed to create responder" });
  }
});

// DELETE /admin/responder/:id
router.delete("/responder/:id", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isDemoMode()) {
      const responder = mockStore.responders.get(id);
      if (responder) {
        responder.isActive = false;
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "Responder not found" });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.update(responders).set({ isActive: false }).where(eq(responders.id, id));
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "Failed to deactivate responder" });
  }
});

// GET /admin/audit-logs
router.get("/audit-logs", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const filters = auditLogFilterSchema.parse(req.query);

    if (isDemoMode()) {
      const logs = mockStore.getAuditLogs({ patientId: filters.patientId, limit: filters.limit, offset: filters.offset });
      return res.json({ success: true, logs, total: mockStore.auditLogs.length });
    }

    const [logs, total] = await Promise.all([
      getAllAuditLogs(filters),
      countAuditLogs(filters),
    ]);
    res.json({ success: true, logs, total });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// GET /admin/stats
router.get("/stats", authMiddleware, adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return res.json({
        success: true,
        stats: {
          totalPatients: mockStore.patients.size,
          totalScans: mockStore.auditLogs.length,
          activeResponders: [...mockStore.responders.values()].filter((r) => r.isActive).length,
          systemUptime: process.uptime(),
          demoMode: true,
        },
      });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [patientCount, scanCount, responderCount] = await Promise.all([
      db.select().from(require("../../drizzle/schema").patients),
      db.select().from(require("../../drizzle/schema").auditLogs),
      db.select().from(responders).where(eq(responders.isActive, true)),
    ]);

    res.json({
      success: true,
      stats: {
        totalPatients: patientCount.length,
        totalScans: scanCount.length,
        activeResponders: responderCount.length,
        systemUptime: process.uptime(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
