import { Router, Request, Response } from "express";
import { z } from "zod"; // Fixed: Changed 'zort' to 'zod'
import { getDb } from "../db";
import { emergencyProfiles, auditLogs } from "../../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { writeAuditLog, getPatientAuditLogs } from "../services/audit";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware } from "../middleware/auth";
import { getPatientById } from "../db";

const router = Router();

/**
 * Validation schemas
 */
const scanSchema = z.object({
  qrToken: z.string().min(1, "QR token required"),
});

const auditLogBatchSchema = z.object({
  logs: z.array(
    z.object({
      patientId: z.string(),
      accessMethod: z.enum(["QR_SCAN", "USSD", "OFFLINE_CACHE"]),
      timestamp: z.string(), // ISO string from PWA
      deviceIp: z.string().optional(),
    })
  ).min(1, "At least one log required"),
});

/**
 * POST /emergency/scan
 * Handles medical profile decryption and triggers patient notification.
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
    let decryptedData;

    try {
      decryptedData = {
        bloodType: decryptJSON<string>(p.bloodType),
        allergies: decryptJSON<any[]>(p.allergies) || [],
        medications: decryptJSON<any[]>(p.medications) || [],
        conditions: decryptJSON<string[]>(p.conditions) || [],
        contacts: decryptJSON<any[]>(p.contacts) || [],
      };
    } catch (decryptError) {
      console.error("[Emergency] Decryption failure:", decryptError);
      return res.status(200).json({ 
        success: true, 
        profile: { id: p.id, patientId: p.patientId, dataAvailable: false, reason: "Encryption mismatch" } 
      });
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
        ...decryptedData,
        dataAvailable: true,
      },
    });
  } catch (error: any) {
    const message = error.message?.includes("expired") ? "QR code expired" : "Scan failed";
    res.status(400).json({ error: message });
  }
});

/**
 * POST /emergency/audit/log
 * Batch syncs offline logs from PWA Service Worker.
 */
router.post("/audit/log", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const { logs } = auditLogBatchSchema.parse(req.body);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const logsToInsert = logs.map((log) => ({
      responderId: responder.id,
      patientId: log.patientId,
      accessMethod: log.accessMethod,
      deviceIp: log.deviceIp || req.ip || "offline",
      createdAt: new Date(log.timestamp), // Adjusted: Mapping to standard schema 'createdAt'
    }));

    await db.insert(auditLogs).values(logsToInsert);
    res.json({ success: true, count: logs.length });
  } catch (error) {
    console.error("[Emergency] Audit log sync error:", error);
    res.status(400).json({ error: "Sync failed" });
  }
});

/**
 * GET /emergency/offline-sync
 * Optimized batch query to fetch recent history for offline access.
 */
router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const recentLogs = await getPatientAuditLogs(responder.id, 50, 0);
    if (recentLogs.length === 0) return res.json({ success: true, profiles: [], count: 0 });

    const patientIds = [...new Set(recentLogs.map(l => l.patientId))];

    const rawProfiles = await db
      .select()
      .from(emergencyProfiles)
      .where(and(inArray(emergencyProfiles.patientId, patientIds), eq(emergencyProfiles.isActive, true)));

    const profiles = rawProfiles.map(p => {
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
      } catch { return null; }
    }).filter(p => p !== null);

    res.json({ success: true, profiles, count: profiles.length });
  } catch (error) {
    console.error("[Emergency] Offline sync error:", error);
    res.status(400).json({ error: "Offline sync failed" });
  }
});

export default router;
