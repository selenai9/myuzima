import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, qrCodes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { writeAuditLog, getPatientAuditLogs } from "../services/audit";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware, JWTPayload } from "../middleware/auth";
import { getPatientById } from "../db";

const router = Router();

/**
 * Validation schemas
 */
const scanSchema = z.object({
  qrToken: z.string().min(1, "QR token required"),
});

/**
 * POST /emergency/scan
 * Responder scans QR code to access emergency profile
 * Writes immutable audit log entry
 */
router.post("/scan", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const responder = (req as any).responder;
    const { qrToken } = scanSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Verify and decrypt QR token
    const { profileId } = verifyQRPayloadToken(qrToken);

    // Get emergency profile
    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (profile.length === 0 || !profile[0].isActive) {
      return res.status(404).json({ error: "Emergency profile not found or inactive" });
    }

    const p = profile[0];

    // Decrypt sensitive fields
    let bloodType: string | null = null;
    let allergies: any[] | null = null;
    let medications: any[] | null = null;
    let conditions: string[] | null = null;
    let contacts: any[] | null = null;

    try {
      bloodType = decryptJSON<string>(p.bloodType);
      allergies = decryptJSON<any[]>(p.allergies);
      medications = decryptJSON<any[]>(p.medications);
      conditions = decryptJSON<string[]>(p.conditions);
      contacts = decryptJSON<any[]>(p.contacts);
    } catch (decryptError) {
      console.error("[Emergency] Decryption error:", decryptError);
      // Return DATA UNAVAILABLE banner
      return res.status(200).json({
        success: true,
        profile: {
          id: p.id,
          patientId: p.patientId,
          bloodType: null,
          allergies: null,
          medications: null,
          conditions: null,
          contacts: null,
          dataAvailable: false,
          dataUnavailableReason: "Failed to decrypt medical information",
        },
      });
    }

    // Get patient info
    const patient = await getPatientById(p.patientId);

    // Write audit log (immutable)
    const deviceIp = req.ip || req.socket.remoteAddress || "unknown";
    await writeAuditLog(responder.id, p.patientId, "QR_SCAN", deviceIp);

    // Send async SMS notification to patient
    if (patient?.phone) {
      sendProfileAccessNotification(patient.phone, responder.name).catch((err) => {
        console.error("[Emergency] Failed to send notification:", err);
      });
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
    console.error("[Emergency] Scan error:", error);

    if (error instanceof Error && error.message.includes("QR token has expired")) {
      return res.status(410).json({
        error: "QR code has expired. Patient should generate a new one.",
      });
    }

    res.status(400).json({
      error: error instanceof Error ? error.message : "Scan failed",
    });
  }
});

/**
 * GET /emergency/offline-sync
 * Retrieve last 50 profiles scanned by responder for offline cache
 */
router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get audit logs for this responder (last 50 scans)
    const auditLogs = await getPatientAuditLogs(responder.id, 50, 0);

    // Fetch emergency profiles for each audit log
    const profiles = [];
    for (const log of auditLogs) {
      const profile = await db
        .select()
        .from(emergencyProfiles)
        .where(eq(emergencyProfiles.patientId, log.patientId))
        .limit(1);

      if (profile.length > 0 && profile[0].isActive) {
        const p = profile[0];

        try {
          const bloodType = decryptJSON<string>(p.bloodType);
          const allergies = decryptJSON<any[]>(p.allergies);
          const medications = decryptJSON<any[]>(p.medications);
          const conditions = decryptJSON<string[]>(p.conditions);
          const contacts = decryptJSON<any[]>(p.contacts);

          profiles.push({
            id: p.id,
            patientId: p.patientId,
            bloodType,
            allergies,
            medications,
            conditions,
            contacts,
            lastScanned: log.timestamp,
          });
        } catch (err) {
          console.error("[Emergency] Decryption error for offline sync:", err);
          // Skip profiles that can't be decrypted
        }
      }
    }

    res.json({
      success: true,
      profiles,
      count: profiles.length,
    });
  } catch (error) {
    console.error("[Emergency] Offline sync error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Offline sync failed",
    });
  }
});

export default router;
