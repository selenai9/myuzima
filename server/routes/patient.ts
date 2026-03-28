import QRCode from "qrcode";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, patients, auditLogs } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { encryptData, decryptJSON } from "../services/crypto";
import { generateEmergencyCardPDF, storeQRCode, regenerateQRCode } from "../services/qr";
import { authMiddleware, patientAuthMiddleware, JWTPayload } from "../middleware/auth";
import { isDemoMode, mockStore } from "../mockStore";

const router = Router();

const emergencyProfileSchema = z.object({
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  allergies: z.array(z.object({ name: z.string().min(1), severity: z.enum(["mild", "moderate", "severe"]).optional() })),
  medications: z.array(z.object({ name: z.string().min(1), dosage: z.string().min(1), frequency: z.string().optional() })),
  conditions: z.array(z.string().min(1)),
  contacts: z.array(z.object({ name: z.string().min(1), phone: z.string().min(1), relation: z.string().min(1) })),
});

// POST /patient/consent
router.post("/consent", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    if (isDemoMode()) {
      mockStore.updatePatientConsent(user.id);
      return res.json({ success: true, message: "Consent recorded (demo)" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    await db.update(patients).set({ consentGiven: true, consentTimestamp: new Date() }).where(eq(patients.id, user.id));
    res.json({ success: true, message: "Consent recorded" });
  } catch (error) {
    res.status(400).json({ error: "Failed to record consent" });
  }
});

// POST /patient/profile
router.post("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const profileData = emergencyProfileSchema.parse(req.body);

    if (isDemoMode()) {
      const patient = mockStore.patients.get(user.id);
      if (patient && !patient.consentGiven && user.id !== "patient-demo-1") {
        return res.status(403).json({ error: "Legal consent required before storing medical data." });
      }
      const profile = mockStore.createOrUpdateProfile(user.id, {
        bloodType: profileData.bloodType,
        allergies: JSON.stringify(profileData.allergies),
        medications: JSON.stringify(profileData.medications),
        conditions: JSON.stringify(profileData.conditions),
        contacts: JSON.stringify(profileData.contacts),
      });
      return res.json({ success: true, profileId: profile.id });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const patientRecord = await db.select().from(patients).where(eq(patients.id, user.id)).limit(1);
    if (!patientRecord[0]?.consentGiven) {
      return res.status(403).json({ error: "Legal consent required before storing medical data." });
    }

    const result = await db.transaction(async (tx) => {
      const values = {
        patientId: user.id,
        bloodType: encryptData(profileData.bloodType),
        allergies: encryptData(profileData.allergies),
        medications: encryptData(profileData.medications),
        conditions: encryptData(profileData.conditions),
        contacts: encryptData(profileData.contacts),
      };
      const [newProfile] = await tx.insert(emergencyProfiles).values(values).$returningId();
      const qrToken = await regenerateQRCode(newProfile.id);
      await storeQRCode(newProfile.id, qrToken);
      return { id: newProfile.id, qrToken };
    });

    res.json({ success: true, profileId: result.id });
  } catch (error) {
    console.error("[Patient] Profile Creation Error:", error);
    res.status(500).json({ error: "Transaction failed: Profile not created" });
  }
});

// GET /patient/profile
router.get("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;

    if (isDemoMode()) {
      const profile = mockStore.profilesByPatient.get(user.id);
      if (!profile) return res.status(404).json({ error: "No profile found" });
      return res.json({
        success: true,
        profile: {
          ...profile,
          bloodType: profile.bloodType,
          allergies: JSON.parse(profile.allergies),
          medications: JSON.parse(profile.medications),
          conditions: JSON.parse(profile.conditions),
          contacts: JSON.parse(profile.contacts),
        },
      });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const [p] = await db.select().from(emergencyProfiles).where(eq(emergencyProfiles.patientId, user.id)).limit(1);
    if (!p) return res.status(404).json({ error: "No profile found" });

    res.json({
      success: true,
      profile: {
        ...p,
        bloodType: decryptJSON<string>(p.bloodType),
        allergies: decryptJSON<any[]>(p.allergies),
        medications: decryptJSON<any[]>(p.medications),
        conditions: decryptJSON<string[]>(p.conditions),
        contacts: decryptJSON<any[]>(p.contacts),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Retrieval failed" });
  }
});

// CONSOLIDATED GET /patient/qr
router.get("/qr", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;

    // --- DEMO MODE GUARD ---
    if (isDemoMode()) {
      // In Demo Mode, we return a JSON token so the frontend can generate its own QR preview
      return res.json({
        success: true,
        qrToken: `demo-qr-${user.id}-${Date.now()}`,
        message: "Demo QR token generated successfully",
      });
    }

    // --- PRODUCTION MODE ---
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const [profile] = await db.select().from(emergencyProfiles).where(eq(emergencyProfiles.patientId, user.id)).limit(1);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const patient = await db.select().from(patients).where(eq(patients.id, user.id)).limit(1);
    const pdfBuffer = await generateEmergencyCardPDF(profile.id, patient[0]?.phone || "N/A");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=myuzima-card-${user.id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[Patient] QR generation error:", error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// GET /patient/access-history
router.get("/access-history", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    if (isDemoMode()) {
      const history = mockStore.getAuditLogs({ patientId: user.id, limit: 20 });
      return res.json({ success: true, history });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const history = await db.select().from(auditLogs).where(eq(auditLogs.patientId, user.id)).orderBy(desc(auditLogs.timestamp)).limit(20);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch access history" });
  }
});

export default router;
