import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm"; // Added inArray for batch querying
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { writeAuditLog, getPatientAuditLogs } from "../services/audit";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware, JWTPayload } from "../middleware/auth";
import { getPatientById } from "../db";

const router = Router();

/**
 * Validation schema for the QR scan
 */
const scanSchema = z.object({
  qrToken: z.string().min(1, "QR token required"),
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

    // 1. Extract profile ID from the encrypted QR token
    const { profileId } = verifyQRPayloadToken(qrToken);

    // 2. Fetch the specific profile
    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (profile.length === 0 || !profile[0].isActive) {
      return res.status(404).json({ error: "Emergency profile not found or inactive" });
    }

    const p = profile[0];

    // 3. Decrypt sensitive medical data for display to the responder
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

    // 4. Log the access (Audit Trail) and notify patient (Security)
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
 * GET /emergency/offline-sync
 * Optimized: Uses a single batch query (inArray) instead of a loop.
 */
router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const responder = (req as any).responder;
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 1. Get the list of last 50 patient IDs scanned by this responder
    const auditLogs = await getPatientAuditLogs(responder.id, 50, 0);
    
    if (auditLogs.length === 0) {
      return res.json({ success: true, profiles: [], count: 0 });
    }

    // 2. Extract unique patient IDs to avoid duplicate queries
    const patientIds = [...new Set(auditLogs.map(log => log.patientId))];

    // 3. BATCH QUERY: Fetch all matching profiles in one trip to the DB
    const rawProfiles = await db
      .select()
      .from(emergencyProfiles)
      .where(inArray(emergencyProfiles.patientId, patientIds));

    // 4. Process and decrypt the batch results
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
          return null; // Skip any profile with corrupted encryption
        }
      })
      .filter(p => p !== null); // Remove failed decryptions

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
