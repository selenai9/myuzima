import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { emergencyProfiles, patients } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { encryptData, decryptJSON } from "../services/crypto";
import { generateQRCodeDataUrl, generateEmergencyCardPDF, storeQRCode, regenerateQRCode } from "../services/qr";
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
 * POST /patient/profile
 * Create emergency profile for authenticated patient
 */
router.post("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const profileData = emergencyProfileSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Encrypt sensitive fields
    const encryptedBloodType = encryptData(profileData.bloodType);
    const encryptedAllergies = encryptData(profileData.allergies);
    const encryptedMedications = encryptData(profileData.medications);
    const encryptedConditions = encryptData(profileData.conditions);
    const encryptedContacts = encryptData(profileData.contacts);

    // Create emergency profile
    const profile = await db
      .insert(emergencyProfiles)
      .values({
        patientId: user.id,
        bloodType: encryptedBloodType,
        allergies: encryptedAllergies,
        medications: encryptedMedications,
        conditions: encryptedConditions,
        contacts: encryptedContacts,
      })
      .$returningId();

    const profileId = profile[0]?.id;
    if (!profileId) throw new Error("Failed to create profile");

    // Generate QR code
    const qrToken = await regenerateQRCode(profileId);
    await storeQRCode(profileId, qrToken);

    res.json({
      success: true,
      profile: {
        id: profileId,
        patientId: user.id,
        bloodType: profileData.bloodType,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[Patient] Profile creation error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Profile creation failed",
    });
  }
});

/**
 * PUT /patient/profile
 * Update emergency profile
 */
router.put("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;
    const profileData = emergencyProfileSchema.parse(req.body);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Encrypt sensitive fields
    const encryptedBloodType = encryptData(profileData.bloodType);
    const encryptedAllergies = encryptData(profileData.allergies);
    const encryptedMedications = encryptData(profileData.medications);
    const encryptedConditions = encryptData(profileData.conditions);
    const encryptedContacts = encryptData(profileData.contacts);

    // Update profile
    await db
      .update(emergencyProfiles)
      .set({
        bloodType: encryptedBloodType,
        allergies: encryptedAllergies,
        medications: encryptedMedications,
        conditions: encryptedConditions,
        contacts: encryptedContacts,
        updatedAt: new Date(),
      })
      .where(eq(emergencyProfiles.patientId, user.id));

    // Regenerate QR code
    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.patientId, user.id))
      .limit(1);

    if (profile.length > 0) {
      await regenerateQRCode(profile[0].id);
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      bloodType: profileData.bloodType,
    });
  } catch (error) {
    console.error("[Patient] Profile update error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Profile update failed",
    });
  }
});

/**
 * GET /patient/profile
 * Retrieve decrypted emergency profile
 */
router.get("/profile", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.patientId, user.id))
      .limit(1);

    if (profile.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const p = profile[0];

    // Decrypt sensitive fields
    const bloodType = decryptJSON<string>(p.bloodType);
    const allergies = decryptJSON<any[]>(p.allergies);
    const medications = decryptJSON<any[]>(p.medications);
    const conditions = decryptJSON<string[]>(p.conditions);
    const contacts = decryptJSON<any[]>(p.contacts);

    res.json({
      success: true,
      profile: {
        id: p.id,
        patientId: p.patientId,
        bloodType,
        allergies,
        medications,
        conditions,
        contacts,
        isActive: p.isActive,
        updatedAt: p.updatedAt,
      },
    });
  } catch (error) {
    console.error("[Patient] Profile retrieval error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Profile retrieval failed",
    });
  }
});

/**
 * GET /patient/qr
 * Download QR card as PDF
 */
router.get("/qr", authMiddleware, patientAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JWTPayload;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get patient's emergency profile
    const profile = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.patientId, user.id))
      .limit(1);

    if (profile.length === 0) {
      return res.status(404).json({ error: "Emergency profile not found. Please create one first." });
    }

    // Generate PDF
    const pdfBuffer = await generateEmergencyCardPDF(profile[0].id, user.phone || "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="myuzima-emergency-card-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[Patient] QR PDF generation error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "PDF generation failed",
    });
  }
});

export default router;
