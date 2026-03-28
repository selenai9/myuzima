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

// Match the APIClient change: 'token' instead of 'qrToken'
const scanSchema = z.object({ token: z.string().min(1, "QR token required") });

const auditLogBatchSchema = z.object({
  logs: z.array(z.object({
    patientId: z.string(),
    accessType: z.string(),
    timestamp: z.string(),
  })).min(1, "At least one log required"),
});

// POST /emergency/scan
router.post("/scan", authMiddleware, responderAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Extract 'token' from request body
    const { token: qrToken } = scanSchema.parse(req.body);

    if (isDemoMode()) {
      let profile = null;

      for (const [, qr] of mockStore.qrCodes) {
        if (qr.token === qrToken) {
          profile = mockStore.emergencyProfiles.get(qr.profileId);
          break;
        }
      }

      if (!profile && qrToken.startsWith("demo-")) {
        profile = mockStore.emergencyProfiles.get("profile-demo-1");
      }

      if (!profile || !profile.isActive) {
        return res.status(404).json({ error: "Emergency profile not found or inactive" });
      }

      const decryptedData = {
        bloodType: profile.bloodType,
        allergies: JSON.parse(profile.allergies || "[]"),
        medications: JSON.parse(profile.medications || "[]"),
        conditions: JSON.parse(profile.conditions || "[]"),
        contacts: JSON.parse(profile.contacts || "[]"),
      };

      mockStore.addAuditLog({
        patientId: profile.patientId,
        accessorId: user.id,
        accessorName: user.name || "Authorized Responder",
        action: "scan",
        accessType: "QR_SCAN",
      });

      return res.json({
        success: true,
        profile: {
          id: profile.id,
          patientId: profile.patientId,
          ...decryptedData,
          dataAvailable: true,
        },
      });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const { profileId } = verifyQRPayloadToken(qrToken);

    const [profile] = await db.select().from(emergencyProfiles).where(eq(emergencyProfiles.id, profileId)).limit(1);
    if (!profile || !profile.isActive) {
      return res.status(404).json({ error: "Emergency profile not found or inactive" });
    }

    const decryptedData = {
      bloodType: decryptJSON<string>(profile.bloodType),
      allergies: decryptJSON<any[]>(profile.allergies) || [],
      medications: decryptJSON<any[]>(profile.medications) || [],
      conditions: decryptJSON<string[]>(profile.conditions) || [],
      contacts: decryptJSON<any[]>(profile.contacts) || [],
    };

    await db.insert(auditLogs).values({
      patientId: profile.patientId,
      accessorId: user.id,
      accessorName: user.name || "Authorized Responder",
      action: "scan",
      accessType: "QR_SCAN",
    });

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
    console.error("[Emergency] Scan error:", error);
    if (error?.message?.includes("expired")) {
      return res.status(401).json({ error: "QR code has expired", dataAvailable: false });
    }
    res.status(400).json({ error: "Invalid QR code", dataAvailable: false });
  }
});

// GET /emergency/offline-sync
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
            qrToken: qrEntry?.token || `demo-${profile.id}`,
            lastScanned: new Date(),
          });
        }
      }
      return res.json({ success: true, profiles });
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allProfiles = await db.select().from(emergencyProfiles).limit(50);
    res.json({ success: true, profiles: allProfiles });
  } catch (error) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// POST /emergency/audit/log
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
