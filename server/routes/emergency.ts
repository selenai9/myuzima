import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, auditLogs } from "../../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware } from "../middleware/auth";
import { getPatientById } from "../db";

const router = Router();

const scanSchema = z.object({
  qrToken: z.string().min(1, "QR token required"),
});

const auditLogBatchSchema = z.object({
  logs: z.array(
    z.object({
      patientId: z.string(),
      accessType: z.string(), // Matches schema "QR_SCAN", "OFFLINE_CACHE"
      timestamp: z.string(), 
    })
  ).min(1, "At least one log required"),
});

/**
 * POST /emergency/scan
 */
router.post("/scan", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user; // From our updated JWTPayload
    const { qrToken } = scanSchema.parse(req.body);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { profileId } = verifyQRPayloadToken(qrToken);

    const [profile] = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (!profile || !profile.isActive) {
      return res.status(404).json({ error: "Emergency profile not found or inactive" });
    }

    // 1. Decrypt Data
    const decryptedData = {
      bloodType: decryptJSON<string>(profile.bloodType),
      allergies: decryptJSON<any[]>(profile.allergies) || [],
      medications: decryptJSON<any[]>(profile.medications) || [],
      conditions: decryptJSON<string[]>(profile.conditions) || [],
      contacts: decryptJSON<any[]>(profile.contacts) || [],
    };

    // 2. Log Audit (Strictly matching our schema)
    await db.insert(auditLogs).values({
      patientId: profile.patientId,
      accessorId: user.id,
      accessorName: user.name || "Authorized Responder",
      action: "scan",
      accessType: "QR_SCAN",
    });

    // 3. Notify Patient
    const patient = await getPatientById(profile.patientId);
    if (patient?.phone) {
      sendProfileAccessNotification(patient.phone, user.name || "A responder").catch(() => {});
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        patientId: profile.patientId,
        ...decryptedData,
        dataAvailable: true,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message?.includes("expired") ? "QR code expired" : "Scan failed" });
  }
});

/**
 * POST /emergency/audit/log (Syncing offline logs)
 */
router.post("/audit/log", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { logs } = auditLogBatchSchema.parse(req.body);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const logsToInsert = logs.map((log) => ({
      patientId: log.patientId,
      accessorId: user.id,
      accessorName: user.name || "Authorized Responder",
      action: "view" as const, // Offline views are logged as 'view'
      accessType: log.accessType, // e.g., "OFFLINE_CACHE"
      timestamp: new Date(log.timestamp),
    }));

    await db.insert(auditLogs).values(logsToInsert);
    res.json({ success: true, count: logs.length });
  } catch (error) {
    res.status(400).json({ error: "Sync failed" });
  }
});

export default router;
