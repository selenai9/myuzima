import { Router } from "express";
import { getDb } from "../db";
import { mockStore } from "../mockStore";

const router = Router();

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
