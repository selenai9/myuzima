import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../_core/db";
import { emergencyProfiles, auditLogs } from "../_core/schema";
import { decryptJSON } from "../_core/crypto";
import { verifyQRPayloadToken } from "../_core/auth";
import { isDemoMode, mockStore } from "../_core/demo";
import { getPatientById } from "../services/patient.service";
import { sendProfileAccessNotification } from "../services/notification.service";

const router = Router();

/**
 * Publicly accessible HTML view for emergency responders scanning via generic camera app
 * GET /api/emergency/scan?token=...
 */
router.get("/scan", async (req: Request, res: Response) => {
  const qrToken = req.query.token as string;
  
  if (!qrToken) {
    return res.status(400).send(`
      <html>
        <body style="font-family:sans-serif; text-align:center; padding:50px;">
          <h2>Missing QR Token</h2>
          <p>Please scan a valid MyUZIMA QR code.</p>
        </body>
      </html>
    `);
  }

  try {
    let profileData: any = null;

    // ── 1. Handle Demo Mode ──
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

      if (profile && profile.isActive) {
        profileData = {
          bloodType: profile.bloodType,
          allergies: JSON.parse(profile.allergies || "[]"),
          medications: JSON.parse(profile.medications || "[]"),
          conditions: JSON.parse(profile.conditions || "[]"),
          contacts: JSON.parse(profile.contacts || "[]"),
        };
      }
    } 
    // ── 2. Production Mode ──
    else {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { profileId } = verifyQRPayloadToken(qrToken);
      const [profile] = await db.select().from(emergencyProfiles)
        .where(eq(emergencyProfiles.id, profileId)).limit(1);

      if (profile && profile.isActive) {
        profileData = {
          bloodType: decryptJSON<string>(profile.bloodType),
          allergies: decryptJSON<any[]>(profile.allergies) || [],
          medications: decryptJSON<any[]>(profile.medications) || [],
          conditions: decryptJSON<string[]>(profile.conditions) || [],
          contacts: decryptJSON<any[]>(profile.contacts) || [],
        };

        // Log the access & Notify (Fire and forget)
        db.insert(auditLogs).values({
          patientId: profile.patientId,
          accessorId: "anonymous-camera-scan",
          accessorName: "Web Browser",
          action: "scan",
          accessType: "CAMERA_WEB_SCAN",
        }).catch(console.error);

        getPatientById(profile.patientId).then(patient => {
          if (patient?.phone) sendProfileAccessNotification(patient.phone, "a web browser scan");
        }).catch(() => {});
      }
    }

    if (!profileData) {
      return res.status(404).send(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Profile Not Found</h2></body></html>`);
    }

    // ── 3. Render Styled HTML ──
    return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <title>MyUZIMA Emergency Profile</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 16px; background: #f7f9fb; color: #1c1e21; }
    .header { background: #2ec4b6; color: white; padding: 20px; border-radius: 12px; margin-bottom: 16px; text-align: center; box-shadow: 0 4px 12px rgba(46, 196, 182, 0.2); }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .blood-box { display: flex; align-items: center; justify-content: space-between; }
    .blood-type { font-size: 2.5em; font-weight: 800; color: #dc3545; }
    .label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
    .allergy-tag { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; padding: 4px 10px; border-radius: 6px; display: inline-block; margin: 4px 4px 4px 0; font-weight: 600; font-size: 0.9em; }
    .item-row { border-left: 4px solid #2ec4b6; padding-left: 12px; margin: 12px 0; }
    .contact-btn { display: block; background: #1b9aaa; color: white; text-decoration: none; text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; margin-top: 8px; }
    .footer { text-align: center; font-size: 0.75em; color: #8a8d91; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:1.4em; font-weight:800; margin-bottom: 4px;">EMERGENCY MEDICAL DATA</div>
    <div style="font-size:0.9em; opacity:0.9;">MyUZIMA Life-Saving Information</div>
  </div>

  <div class="card blood-box">
    <div><div class="label">Blood Type</div><div class="blood-type">${profileData.bloodType || 'Unknown'}</div></div>
    <div style="text-align:right"><img src="https://img.icons8.com/color/48/000000/drop-of-blood.png" width="40" height="40"/></div>
  </div>

  ${profileData.allergies.length ? `
    <div class="card">
      <div class="label">Critical Allergies</div>
      <div>${profileData.allergies.map((a: any) => `<span class="allergy-tag">⚠️ ${a.name} ${a.severity ? `(${a.severity})` : ''}</span>`).join('')}</div>
    </div>
  ` : ''}

  ${profileData.medications.length ? `
    <div class="card">
      <div class="label">Current Medications</div>
      ${profileData.medications.map((m: any) => `<div class="item-row"><strong>${m.name}</strong><br/><small>${m.dosage} ${m.frequency ? `— ${m.frequency}` : ''}</small></div>`).join('')}
    </div>
  ` : ''}

  ${profileData.contacts.length ? `
    <div class="card">
      <div class="label">Emergency Contacts</div>
      ${profileData.contacts.map((c: any) => `
        <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
          <strong>${c.name}</strong> (${c.relation})
          <a href="tel:${c.phone}" class="contact-btn">📞 Call ${c.phone}</a>
        </div>
      `).join('')}
    </div>
  ` : ''}

  <div class="footer">
    This information was provided by the patient for use in emergencies.<br/>
    &copy; ${new Date().getFullYear()} MyUZIMA Health Platform
  </div>
</body>
</html>`);

  } catch (err: any) {
    console.error("HTML Scan Error:", err);
    return res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Invalid or Expired QR Code</h2></body></html>`);
  }
});

// Export the router so it can be used in server/_core/index.ts
export default router;
