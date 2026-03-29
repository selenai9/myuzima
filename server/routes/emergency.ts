console.log("🚨 Emergency routes loaded");
import { Router } from "express";
import { getDb } from "../db";
import { mockStore, isDemoMode } from "../mockStore";
import { verifyQRPayloadToken, decryptJSON } from "../services/crypto";
import { emergencyProfiles, qrCodes, auditLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * POST /scan — resolve a QR token to an emergency profile
 * Body: { token: string }
 * Used by ResponderScan page via apiClient.scanQRCode()
 */
router.post("/scan", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing or invalid token" });
    }

    // ── Demo / mock-store path ──────────────────────────────────────────
    if (isDemoMode()) {
      // Find qrCode record whose token matches
      let matchedProfileId: string | null = null;
      for (const [profileId, qr] of mockStore.qrCodes.entries()) {
        if (qr.token === token) {
          matchedProfileId = profileId;
          break;
        }
      }

      // Fallback: treat token as a plain profileId (for demo deep-links)
      if (!matchedProfileId && mockStore.emergencyProfiles.has(token)) {
        matchedProfileId = token;
      }

      if (!matchedProfileId) {
        return res.status(404).json({ error: "QR token not found" });
      }

      const rawProfile = mockStore.emergencyProfiles.get(matchedProfileId);
      if (!rawProfile) {
        return res.status(404).json({ error: "Emergency profile not found" });
      }

      // Mock data is stored as plain JSON strings (not encrypted)
      const profile = {
        id: rawProfile.id,
        patientId: rawProfile.patientId,
        bloodType: rawProfile.bloodType,
        allergies: JSON.parse(rawProfile.allergies),
        medications: JSON.parse(rawProfile.medications),
        conditions: JSON.parse(rawProfile.conditions),
        contacts: JSON.parse(rawProfile.contacts),
        dataAvailable: true,
      };

      return res.json({ success: true, profile });
    }

    // ── Real DB path ───────────────────────────────────────────────────
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Verify & extract profileId from the encrypted QR token
    let profileId: string;
    try {
      ({ profileId } = verifyQRPayloadToken(token));
    } catch (err: any) {
      return res.status(400).json({ error: `Invalid or expired QR token: ${err.message}` });
    }

    // Look up the emergency profile
    const [rawProfile] = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (!rawProfile) {
      return res.status(404).json({ error: "Emergency profile not found" });
    }

    // Decrypt the AES-256-GCM fields
    const profile = {
      id: rawProfile.id,
      patientId: rawProfile.patientId,
      bloodType: decryptJSON<string>(rawProfile.bloodType),
      allergies: decryptJSON<any[]>(rawProfile.allergies),
      medications: decryptJSON<any[]>(rawProfile.medications),
      conditions: decryptJSON<string[]>(rawProfile.conditions),
      contacts: decryptJSON<any[]>(rawProfile.contacts),
      dataAvailable: true,
    };

    // Best-effort audit log
    try {
      const accessorId = (req as any).user?.id ?? "anonymous";
      const accessorName = (req as any).user?.name ?? "Unknown Responder";
      await db.insert(auditLogs).values({
        patientId: rawProfile.patientId,
        accessorId,
        accessorName,
        action: "scan",
        accessType: "QR_SCAN",
        timestamp: new Date(),
      });
    } catch (auditErr) {
      console.warn("Audit log write failed:", auditErr);
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error("Emergency scan error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET emergency profile by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fallback to mock store if needed
    if (!id) {
      return res.status(400).json({ error: "Missing ID" });
    }

    // Try DB first
    const db = getDb();
    let profile = null;

    if (db) {
      profile = await db.emergencyProfiles?.findUnique({
        where: { id },
      });
    }

    // Fallback to mock store if DB fails or empty
    if (!profile) {
      profile = mockStore.emergencyProfiles?.find(
        (p: any) => p.id === id
      );
    }

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    return res.json(profile);
  } catch (error) {
    console.error("Emergency GET error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST emergency access (simplified safe version)
 */
router.post("/access", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Missing ID" });
    }

    const db = getDb();
    let profile = null;

    if (db) {
      profile = await db.emergencyProfiles?.findUnique({
        where: { id },
      });
    }

    if (!profile) {
      profile = mockStore.emergencyProfiles?.find(
        (p: any) => p.id === id
      );
    }

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Optional audit log (safe fallback)
    try {
      if (db?.auditLogs) {
        await db.auditLogs.create({
          data: {
            action: "EMERGENCY_ACCESS",
            targetId: id,
            timestamp: new Date(),
          },
        });
      }
    } catch (err) {
      console.warn("Audit log failed:", err);
    }

    return res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Emergency access error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
