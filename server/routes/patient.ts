import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, patients } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encryptData, decryptJSON } from "../services/crypto";
import { generateEmergencyCardPDF, storeQRCode, regenerateQRCode } from "../services/qr";
import { authMiddleware, patientAuthMiddleware, JWTPayload } from "../middleware/auth";

const router = Router();

/**
 * Validation schemas
 */
const emergencyProfileSchema = z.object({
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  allergies: z.array(
    z.object({
      name: z.string().min(1),
      severity: z.enum(["mild", "moderate", "severe"]).optional(),
    })
  ),
  medications: z.array(
    z.object({
      name: z.string().min(1),
      dosage: z.string().min(1),
      frequency: z.string().optional(),
    })
  ),
  conditions: z.array(z.string().min(1)),
  contacts: z.array(
    z.object({
      name: z.string().min(1),
      phone: z.string().min(1),
      relation: z.string().min(1),
    })
  ),
});

/**
 * POST /patient/consent
 * Required before profile creation (Compliance with Rwanda Law 058/2021)
 */
router.post("/consent", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const db = await getDb();

    await db
      .update(patients)
      .set({
        consentGiven: true,
        consentTimestamp: new Date(),
      })
      .where(eq(patients.id, user.id));

    res.json({ success: true, message: "Consent recorded" });
  } catch (error) {
    res.status(400).json({ error: "Failed to record consent" });
  }
});

/**
 * POST /patient/profile
 * Create profile ONLY if consent is already given
 */
router.post("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const profileData = emergencyProfileSchema.parse(req.body);
    const db = await getDb();

    // 1. Verify Consent (Server-side Enforcement)
    const patientRecord = await db.select().from(patients).where(eq(patients.id, user.id)).limit(1);
    if (!patientRecord[0]?.consentGiven) {
      return res.status(403).json({ error: "Legal consent required before storing medical data." });
    }

    // 2. Use a Transaction for Atomic Updates (Consistency)
    const result = await db.transaction(async (tx) => {
      // Encrypt sensitive fields
      const values = {
        patientId: user.id,
        bloodType: encryptData(profileData.bloodType),
        allergies: encryptData(profileData.allergies),
        medications: encryptData(profileData.medications),
        conditions: encryptData(profileData.conditions),
        contacts: encryptData(profileData.contacts),
      };

      const [newProfile] = await tx.insert(emergencyProfiles).values(values).$returningId();
      
      // Generate & Link QR Token within the same transaction
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

/**
 * PUT /patient/profile
 * Update and ensure QR stays in sync
 */
router.put("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const profileData = emergencyProfileSchema.parse(req.body);
    const db = await getDb();

    await db.transaction(async (tx) => {
      // Update the data
      await tx.update(emergencyProfiles)
        .set({
          bloodType: encryptData(profileData.bloodType),
          allergies: encryptData(profileData.allergies),
          medications: encryptData(profileData.medications),
          conditions: encryptData(profileData.conditions),
          contacts: encryptData(profileData.contacts),
          updatedAt: new Date(),
        })
        .where(eq(emergencyProfiles.patientId, user.id));

      // Fetch ID to ensure QR reflects latest state
      const [profile] = await tx.select().from(emergencyProfiles).where(eq(emergencyProfiles.patientId, user.id)).limit(1);
      
      if (profile) {
        await regenerateQRCode(profile.id);
      }
    });

    res.json({ success: true, message: "Profile and QR updated" });
  } catch (error) {
    res.status(400).json({ error: "Update failed" });
  }
});

/**
 * GET /patient/profile
 */
router.get("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const db = await getDb();

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

export default router;
