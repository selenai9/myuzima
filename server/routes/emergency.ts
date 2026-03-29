import { Router } from "express";
import { getDb } from "../db";
import { mockStore } from "../mockStore";
import { eq } from "drizzle-orm";
import { emergencyProfiles } from "../drizzle/schema";

const router = Router();

/**
 * GET emergency profile by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Missing ID" });
    }

    const db = await getDb();
    let profile = null;

    // DB lookup
    if (db) {
      try {
        const result = await db
          .select()
          .from(emergencyProfiles)
          .where(eq(emergencyProfiles.id, id))
          .limit(1);

        profile = result[0] ?? null;
      } catch (err) {
        console.warn("DB lookup failed:", err);
      }
    }

    // Mock fallback (Map-safe)
    if (!profile) {
      profile = mockStore.emergencyProfiles.get(id);
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
 * POST emergency access
 */
router.post("/access", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Missing ID" });
    }

    const db = await getDb();
    let profile = null;

    // DB lookup
    if (db) {
      try {
        const result = await db
          .select()
          .from(emergencyProfiles)
          .where(eq(emergencyProfiles.id, id))
          .limit(1);

        profile = result[0] ?? null;
      } catch (err) {
        console.warn("DB lookup failed:", err);
      }
    }

    // Mock fallback
    if (!profile) {
      profile = mockStore.emergencyProfiles.get(id);
    }

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Optional audit log (safe)
    try {
      if (db) {
        await db.insert("auditLogs").values({
          action: "EMERGENCY_ACCESS",
          targetId: id,
          timestamp: new Date(),
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

/**
 * POST emergency scan (QR)
 */
router.post("/scan", async (req, res) => {
  try {
    console.log("SCAN BODY:", req.body);

    const { token, id, qrData } = req.body;
    const lookupValue = id || token || qrData;

    if (!lookupValue) {
      return res.status(400).json({ error: "Invalid QR payload" });
    }

    const db = await getDb();
    let profile = null;

    // =========================
    //  DEMO MODE (Map-based QR lookup)
    // =========================
    if (typeof lookupValue === "string" && lookupValue.startsWith("demo-qr-token-")) {
      let matchedProfileId: string | null = null;

      for (const [, qr] of mockStore.qrCodes.entries()) {
        if (qr.token === lookupValue) {
          matchedProfileId = qr.profileId;
          break;
        }
      }

      if (!matchedProfileId) {
        return res.status(404).json({ error: "Invalid demo QR token" });
      }

      profile = mockStore.emergencyProfiles.get(matchedProfileId);
    }

    // =========================
    //  REAL DATABASE MODE
    // =========================
    else if (db) {
      try {
        const result = await db
          .select()
          .from(emergencyProfiles)
          .where(eq(emergencyProfiles.id, lookupValue))
          .limit(1);

        profile = result[0] ?? null;
      } catch (err) {
        console.warn("DB lookup failed:", err);
      }
    }

    // =========================
    //  NOT FOUND
    // =========================
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    return res.json(profile);
  } catch (error) {
    console.error("Scan error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
