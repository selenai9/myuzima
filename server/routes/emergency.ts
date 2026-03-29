import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, auditLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { sendProfileAccessNotification } from "../services/otp";
import { authMiddleware, responderAuthMiddleware } from "../middleware/auth";
import { getPatientById } from "../db";
import { isDemoMode, mockStore } from "../mockStore";

const router = Router();

// Validation Schemas
const scanSchema = z.object({ 
  token: z.string().min(1, "QR token required") 
});

const auditLogBatchSchema = z.object({
  logs: z.array(z.object({
    patientId: z.string(),
    accessType: z.string(),
    timestamp: z.string(),
  })).min(1, "At least one log required"),
});

/**
 * SHARED SCAN LOGIC
 * Handles both GET (browser/camera) and POST (app) requests
 */
async function handleEmergencyScan(qrToken: string, res: Response, accessType: string) {
  // ── Handle Demo Mode ──────────────────────────────────────────────────
  if (isDemoMode()) {
    let profile = null;

    for (const [, qr] of mockStore.qrCodes) {
      if (qr.token === qrToken) {
        profile = mockStore.emergencyProfiles.get(qr.profileId);
        break;
      }
    }

    if (!profile && qrToken.startsWith("demo-")) {
      const parts = qrToken.split("demo-qr-token-");
      profile = parts[1] ? mockStore.emergencyProfiles.get(parts[1]) : mockStore.emergencyProfiles.get("profile-demo-1");
    }

    if (!profile || !profile.isActive) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const safeData = {
      bloodType: profile.bloodType,
      allergies: JSON.parse(profile.allergies || "[]"),
      medications: JSON.parse(profile.medications || "[]"),
      conditions: JSON.parse(profile.conditions || "[]"),
      contacts: JSON.parse(profile.contacts || "[]"),
    };

    return res.json({ success: true, profile: safeData, emergencyAccess: true });
  }

  // ── Production Mode ───────────────────────────────────────────────────
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const { profileId } = verifyQRPayloadToken(qrToken);

    const [profile] = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (!profile || !profile.isActive) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const safeData = {
      bloodType: decryptJSON<string>(profile.bloodType),
      allergies: decryptJSON<any[]>(profile.allergies) || [],
      medications: decryptJSON<any[]>(profile.medications) || [],
      conditions: decryptJSON<string[]>(profile.conditions) || [],
      contacts: decryptJSON<any[]>(profile.contacts) || [],
    };

    // Log the access
    await db.insert(auditLogs).values({
      patientId: profile.patientId,
      accessorId: "anonymous-public-scan",
      accessorName: "Public Web Scanner",
      action: "scan",
      accessType: accessType,
    });

    // Notify the patient
    const patient = await getPatientById(profile.patientId);
    if (patient?.phone) {
      sendProfileAccessNotification(patient.phone, `A responder (${accessType})`).catch(() => {});
    }

    return res.json({ success: true, profile: safeData, emergencyAccess: true });

  } catch (error: any) {
    console.error("[SCAN ERROR]:", error);
    const msg = error?.message?.includes("expired") ? "QR expired" : "Invalid QR code";
    return res.status(400).json({ error: msg });
  }
}

/**
 * POST /emergency/scan
 * Used by the MyUZIMA App / Responder App
 */
router.post("/scan", async (req: Request, res: Response) => {
  const { token } = scanSchema.parse(req.body);
  await handleEmergencyScan(token, res, "APP_SCAN");
});

/**
 * GET /emergency/scan
 * PUBLIC URL: Triggered by native phone camera apps
 */
router.get("/scan", async (req: Request, res: Response) => {
  const qrToken = req.query.token as string;
  if (!qrToken) return res.status(400).json({ error: "Missing QR token" });
  
  await handleEmergencyScan(qrToken, res, "CAMERA_WEB_SCAN");
});

// --- PROTECTED ROUTES BELOW ---

router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      const profiles = Array.from(mockStore.emergencyProfiles.values())
        .filter(p => p.isActive)
        .map(p => ({
          ...p,
          allergies: JSON.parse(p.allergies || "[]"),
          medications: JSON.parse(p.medications || "[]"),
          conditions: JSON.parse(p.conditions || "[]"),
          contacts: JSON.parse(p.contacts || "[]"),
          qrToken: mockStore.qrCodes.get(p.id)?.token || `demo-qr-token-${p.id}`,
        }));
      return res.json({ success: true, profiles });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const allProfiles = await db.select().from(emergencyProfiles).limit(100);
    res.json({ success: true, profiles: allProfiles });
  } catch (error) {
    res.status(500).json({ error: "Sync failed" });
  }
});

router.post("/audit/log", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { logs } = auditLogBatchSchema.parse(req.body);

    if (isDemoMode()) {
      logs.forEach((log) => {
        mockStore.addAuditLog({
          patientId: log.patientId,
          accessorId: user.id,
          accessorName: user.name || "Responder",
          action: "scan",
          accessType: log.accessType || "OFFLINE_CACHE",
        });
      });
      return res.json({ success: true, synced: logs.length });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(auditLogs).values(
      logs.map((log) => ({
        patientId: log.patientId,
        accessorId: user.id,
        accessorName: user.name || "Responder",
        action: "scan" as const,
        accessType: log.accessType,
      }))
    );

    res.json({ success: true, synced: logs.length });
  } catch (error) {
    res.status(400).json({ error: "Audit log sync failed" });
  }
});

export default router;
