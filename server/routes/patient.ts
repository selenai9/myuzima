import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, patients, auditLogs } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { encryptData, decryptJSON, generateQRPayloadToken } from "../services/crypto";
import { storeQRCode, regenerateQRCode } from "../services/qr";
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

      const demoToken = `demo-qr-token-${profile.id}`;
      mockStore.qrCodes.set(profile.id, {
        profileId: profile.id,
        token: demoToken,
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

// GET /patient/qr 
router.get("/qr", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;

    let profileId: string;
    let patientName: string;
    let qrToken: string;

    if (isDemoMode()) {
      const profile = mockStore.profilesByPatient.get(user.id);
      if (!profile) return res.status(404).json({ error: "No profile found." });
      profileId = profile.id;
      patientName = user.id;

      const qrEntry = mockStore.qrCodes.get(profile.id);
      qrToken = qrEntry?.token || `demo-qr-token-${profileId}`;

      if (!qrEntry) {
        mockStore.qrCodes.set(profile.id, { profileId: profile.id, token: qrToken });
      }
    } else {
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [profile] = await db
        .select()
        .from(emergencyProfiles)
        .where(eq(emergencyProfiles.patientId, user.id))
        .limit(1);
      if (!profile) return res.status(404).json({ error: "Profile not found" });

      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, user.id))
        .limit(1);

      profileId = profile.id;
      patientName = patient?.id ?? user.id;
      qrToken = generateQRPayloadToken(profileId);
    }

    // ── NEW: JSON Payload structure for enhanced QR compatibility ──────────
    const qrData = JSON.stringify({
      type: "myuzima-emergency",
      token: qrToken,
      endpoint: "https://myuzima-api.onrender.com/api/emergency/scan"
    });

    const qrImageBuffer = await QRCode.toBuffer(qrData, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    // ── Build PDF ────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 500]);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const qrImage = await pdfDoc.embedPng(qrImageBuffer);

    page.drawRectangle({
      x: 0, y: 0, width: 400, height: 500,
      color: rgb(0.97, 0.97, 0.97),
    });

    page.drawRectangle({
      x: 0, y: 440, width: 400, height: 60,
      color: rgb(0.07, 0.54, 0.47), 
    });

    page.drawText("MyUZIMA", {
      x: 20, y: 468, size: 22, font, color: rgb(1, 1, 1),
    });
    page.drawText("Emergency Medical Card", {
      x: 20, y: 450, size: 11, font: regularFont, color: rgb(0.8, 0.95, 0.9),
    });

    page.drawText("PATIENT ID", {
      x: 20, y: 420, size: 9, font, color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(patientName, {
      x: 20, y: 405, size: 12, font, color: rgb(0.1, 0.1, 0.1),
    });

    page.drawImage(qrImage, { x: 50, y: 90, width: 300, height: 300 });

    page.drawText("Scan this code in an emergency to access medical data", {
      x: 20, y: 65, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText("myuzima.health", {
      x: 20, y: 50, size: 9, font, color: rgb(0.07, 0.54, 0.47),
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=myuzima-card-${user.id}.pdf`);
    res.setHeader("Content-Length", buffer.length.toString()); 
    res.end(buffer);

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
