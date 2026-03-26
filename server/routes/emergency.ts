import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, auditLogs } from "../../drizzle/schema"; // Ensure auditLogs is imported from schema
import { eq, inArray } from "drizzle-orm";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { writeAuditLog, getPatientAuditLogs } from "../services/audit";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware } from "../middleware/auth";
import { getPatientById } from "../db";

const router = Router();

/**
 * Validation schema for the QR scan
 */
const scanSchema = z.object({
  qrToken: z.string().min(1, "QR token required"),
});

/**
 * NEW: Validation schema for batch audit logs
 */
const auditLogBatchSchema = z.object({
  logs: z.array(
    z.object({
      id: z.string(),
      patientId: z.string(),
      timestamp: z.string(), // ISO string from frontend
      accessMethod: z.enum(["QR_SCAN", "USSD", "OFFLINE_CACHE"]),
      deviceIp: z.string().optional(),
    })
  ).min(1, "At least one log required"),
});

/**
 * POST /emergency/scan
 * Triggered when a Responder scans a physical QR code.
 */
router.post("/scan", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const { qrToken } = scanSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { profileId } = verifyQRPayloadToken(qrToken);

    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (profile.length === 0 || !profile[0].isActive) {
      return res.status(404).json({ error: "Emergency profile not found or inactive" });
    }

    const p = profile[0];

    let bloodType, allergies, medications, conditions, contacts;
    try {
      bloodType = decryptJSON<string>(p.bloodType);
      allergies = decryptJSON<any[]>(p.allergies);
      medications = decryptJSON<any[]>(p.medications);
      conditions = decryptJSON<string[]>(p.conditions);
      contacts = decryptJSON<any[]>(p.contacts);
    } catch (decryptError) {
      console.error("[Emergency] Decryption failure:", decryptError);
      return res.status(200).json({ success: true, profile: { id: p.id, dataAvailable: false } });
    }

    const patient = await getPatientById(p.patientId);
    const deviceIp = req.ip || "unknown";
    await writeAuditLog(responder.id, p.patientId, "QR_SCAN", deviceIp);

    if (patient?.phone) {
      sendProfileAccessNotification(patient.phone, responder.name).catch(() => {});
    }

    res.json({
      success: true,
      profile: {
        id: p.id,
        patientId: p.patientId,
        bloodType,
        allergies: allergies || [],
        medications: medications || [],
        conditions: conditions || [],
        contacts: contacts || [],
        dataAvailable: true,
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Scan failed" });
  }
});

/**
 * NEW: POST /emergency/audit/log
 * Syncs offline audit logs from the PWA to the central database.
 */
router.post("/audit/log", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const { logs } = auditLogBatchSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Map the logs to match the database schema format
    const logsToInsert = logs.map((log) => ({
      id: log.id,
      responderId: responder.id, // Always use current responder ID for security
      patientId: log.patientId,
      accessMethod: log.accessMethod,
      deviceIp: log.deviceIp || req.ip || "offline",
      createdAt: new Date(log.timestamp),
    }));

    // Batch insert using Drizzle
    await db.insert(auditLogs).values(logsToInsert);

    res.json({
      success: true,
      message: `${logs.length} offline logs synced successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid log format", details: error.errors });
    }
    console.error("[Emergency] Batch audit sync error:", error);
    res.status(500).json({ error: "Failed to sync offline logs" });
  }
});

/**
 * GET /emergency/offline-sync
 * Optimized: Uses a single batch query (inArray) instead of a loop.
 */
router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const auditLogs = await getPatientAuditLogs(responder.id, 50, 0);
    
    if (auditLogs.length === 0) {
      return res.json({ success: true, profiles: [], count: 0 });
    }

    const patientIds = [...new Set(auditLogs.map(log => log.patientId))];

    const rawProfiles = await db
      .select()
      .from(emergencyProfiles)
      .where(inArray(emergencyProfiles.patientId, patientIds));

    const decryptedProfiles = rawProfiles
      .filter(p => p.isActive)
      .map(p => {
        try {
          return {
            id: p.id,
            patientId: p.patientId,
            bloodType: decryptJSON<string>(p.bloodType),
            allergies: decryptJSON<any[]>(p.allergies),
            medications: decryptJSON<any[]>(p.medications),
            conditions: decryptJSON<string[]>(p.conditions),
            contacts: decryptJSON<any[]>(p.contacts),
          };
        } catch (err) {
          return null;
        }
      })
      .filter(p => p !== null);

    res.json({
      success: true,
      profiles: decryptedProfiles,
      count: decryptedProfiles.length,
    });
  } catch (error) {
    console.error("[Emergency] Offline sync error:", error);
    res.status(400).json({ error: "Offline sync failed" });
  }
});

export default router;
