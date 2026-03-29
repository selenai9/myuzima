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
 * POST /emergency/scan
 * PUBLIC ENDPOINT: Used by the web-app or anyone scanning the QR.
 * Returns only non-identifiable medical data.
 */
router.post("/scan", async (req: Request, res: Response) => {
  try {
    const { token: qrToken } = scanSchema.parse(req.body);

    // ── Handle Demo Mode ──────────────────────────────────────────────────
    if (isDemoMode()) {
      let profile = null;

      // Search through mock store for matching token
      for (const [, qr] of mockStore.qrCodes) {
        if (qr.token === qrToken) {
          profile = mockStore.emergencyProfiles.get(qr.profileId);
          break;
        }
      }

      // Fallback for demo-specific token strings
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

      return res.json({
        success: true,
        profile: safeData,
        emergencyAccess: true
      });
    }

    // ── Production Mode ───────────────────────────────────────────────────
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Decrypt and verify the JWT/Token payload
    const { profileId } = verifyQRPayloadToken(qrToken);

    const [profile] = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (!profile || !profile.isActive) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Decrypt sensitive fields into a "Safe" object (No IDs/PII)
    const safeData = {
      bloodType: decryptJSON<string>(profile.bloodType),
      allergies: decryptJSON<any[]>(profile.allergies) || [],
      medications: decryptJSON<any[]>(profile.medications) || [],
      conditions: decryptJSON<string[]>(profile.conditions) || [],
      contacts: decryptJSON<any[]>(profile.contacts) || [],
    };

    // Log the access as an anonymous scan
    await db.insert(auditLogs).values({
      patientId: profile.patientId,
      accessorId: "anonymous-public-scan",
      accessorName: "Public Web Scanner",
      action: "scan",
      accessType: "PUBLIC_QR_SCAN",
    });

    // Notify the patient via SMS/Push
    const patient = await getPatientById(profile.patientId);
    if (patient?.phone) {
      sendProfileAccessNotification(patient.phone, "A responder (Public Scan)").catch(() => {});
    }

    res.json({
      success: true,
      profile: safeData,
      emergencyAccess: true
    });

  } catch (error: any) {
    console.error("[PUBLIC SCAN ERROR]:", error);
    if (error?.message?.includes("expired")) {
      return res.status(401).json({ error: "QR expired" });
    }
    res.status(400).json({ error: "Invalid QR code" });
  }
});

/**
 * GET /emergency/offline-sync
 * PROTECTED: Used by registered Responders to cache profiles locally.
 */
router.get("/offline-sync", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      const profiles = [];
      for (const profile of mockStore.emergencyProfiles.values()) {
        if (profile.isActive) {
          const qrEntry = mockStore.qrCodes.get(profile.id);
          profiles.push({
            id: profile.id,
            patientId: profile.patientId,
            bloodType: profile.bloodType,
            allergies: JSON.parse(profile.allergies || "[]"),
            medications: JSON.parse(profile.medications || "[]"),
            conditions: JSON.parse(profile.conditions || "[]"),
            contacts: JSON.parse(profile.contacts || "[]"),
            dataAvailable: true,
            qrToken: qrEntry?.token || `demo-qr-token-${profile.id}`,
          });
        }
      }
      return res.json({ success: true, profiles });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // In a real app, you might filter profiles based on region or responder scope
    const allProfiles = await db.select().from(emergencyProfiles).limit(100);
    res.json({ success: true, profiles: allProfiles });
  } catch (error) {
    res.status(500).json({ error: "Sync failed" });
  }
});

/**
 * POST /emergency/audit/log
 * PROTECTED: Allows the app to upload logs generated while offline.
 */
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
