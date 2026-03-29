import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
//  Fixed paths for the routes folder structure
import { getDb } from "../_core/db";
import { emergencyProfiles, auditLogs } from "../_core/schema";
import { decryptJSON } from "../_core/crypto";
import { verifyQRPayloadToken } from "../_core/auth";
import { isDemoMode, mockStore } from "../_core/demo";
import { getPatientById } from "../services/patient.service";
import { sendProfileAccessNotification } from "../services/notification.service";

const router = Router();

// ── HTML Builder Helpers ──────────────────────────────────────────────────────
// These replace nested template literals to prevent esbuild syntax errors.

function renderAllergyTag(a: { name: string; severity?: string }): string {
  const severityLabel = a.severity ? " (" + a.severity + ")" : "";
  return '<span class="allergy-tag">\u26a0\ufe0f ' + a.name + severityLabel + "</span>";
}

function renderMedicationRow(m: { name: string; dosage: string; frequency?: string }): string {
  const freq = m.frequency ? " \u2014 " + m.frequency : "";
  return (
    '<div class="item-row"><strong>' +
    m.name +
    "</strong><br/><small>" +
    m.dosage +
    freq +
    "</small></div>"
  );
}

function renderContactRow(c: { name: string; relation: string; phone: string }): string {
  return (
    '<div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">' +
    "<strong>" + c.name + "</strong> (" + c.relation + ")" +
    '<a href="tel:' + c.phone + '" class="contact-btn">\ud83d\udcde Call ' + c.phone + "</a>" +
    "</div>"
  );
}

function buildEmergencyHTML(profileData: {
  bloodType: string;
  allergies: Array<{ name: string; severity?: string }>;
  medications: Array<{ name: string; dosage: string; frequency?: string }>;
  conditions: string[];
  contacts: Array<{ name: string; relation: string; phone: string }>;
}): string {
  const allergiesSection = profileData.allergies.length
    ? '<div class="card"><div class="label">Critical Allergies</div><div>' +
      profileData.allergies.map(renderAllergyTag).join("") +
      "</div></div>"
    : "";

  const medicationsSection = profileData.medications.length
    ? '<div class="card"><div class="label">Current Medications</div>' +
      profileData.medications.map(renderMedicationRow).join("") +
      "</div>"
    : "";

  const conditionsSection = profileData.conditions.length
    ? '<div class="card"><div class="label">Medical Conditions</div><ul style="margin:0;padding-left:20px;">' +
      profileData.conditions.map((c) => "<li>" + c + "</li>").join("") +
      "</ul></div>"
    : "";

  const contactsSection = profileData.contacts.length
    ? '<div class="card"><div class="label">Emergency Contacts</div>' +
      profileData.contacts.map(renderContactRow).join("") +
      "</div>"
    : "";

  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8"/>\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>\n' +
    "  <title>MyUZIMA Emergency Profile</title>\n" +
    "  <style>\n" +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 16px; background: #f0f2f5; color: #1c1e21; }\n' +
    "    .header { background: #0f8a78; color: white; padding: 20px; border-radius: 12px; margin-bottom: 16px; text-align: center; box-shadow: 0 4px 12px rgba(15, 138, 120, 0.3); }\n" +
    "    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e4e6eb; }\n" +
    "    .blood-box { display: flex; align-items: center; justify-content: space-between; }\n" +
    "    .blood-type { font-size: 2.5em; font-weight: 800; color: #dc3545; }\n" +
    '    .label { font-size: 0.7rem; color: #65676b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }\n' +
    "    .allergy-tag { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; padding: 4px 10px; border-radius: 6px; display: inline-block; margin: 4px 4px 4px 0; font-weight: 600; font-size: 0.9em; }\n" +
    "    .item-row { border-left: 4px solid #0f8a78; padding-left: 12px; margin: 12px 0; }\n" +
    '    .contact-btn { display: block; background: #0f8a78; color: white; text-decoration: none; text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; margin-top: 8px; }\n' +
    "    .footer { text-align: center; font-size: 0.75em; color: #8a8d91; margin-top: 24px; }\n" +
    "  </style>\n" +
    "</head>\n<body>\n" +
    '  <div class="header">\n' +
    '    <div style="font-size:1.4em; font-weight:800; margin-bottom: 4px;">EMERGENCY MEDICAL DATA</div>\n' +
    '    <div style="font-size:0.9em; opacity:0.9;">MyUZIMA Life-Saving Information</div>\n' +
    "  </div>\n\n" +
    '  <div class="card blood-box">\n' +
    '    <div><div class="label">Blood Type</div><div class="blood-type">' +
    (profileData.bloodType || "Unknown") +
    '</div></div>\n' +
    '    <div style="text-align:right"><img src="https://img.icons8.com/color/48/000000/drop-of-blood.png" width="40" height="40"/></div>\n' +
    "  </div>\n\n" +
    allergiesSection + "\n" +
    medicationsSection + "\n" +
    conditionsSection + "\n" +
    contactsSection + "\n" +
    '  <div class="footer">\n' +
    "    This information was provided by the patient for use in emergencies.<br/>\n" +
    "    &copy; " + new Date().getFullYear() + " MyUZIMA Health Platform\n" +
    "  </div>\n" +
    "</body>\n</html>"
  );
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.get("/scan", async (req: Request, res: Response) => {
  const qrToken = req.query.token as string;
  if (!qrToken) {
    return res.status(400).send(`
      <html>
        <body style="font-family:sans-serif; text-align:center; padding:50px;">
          <h2> Missing QR Token</h2>
          <p>Please scan a valid MyUZIMA QR code.</p>
        </body>
      </html>
    `);
  }

  try {
    let profileData: any = null;

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
    } else {
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

    return res.send(buildEmergencyHTML(profileData));

  } catch (err: any) {
    console.error("HTML Scan Error:", err);
    return res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Invalid or Expired QR Code</h2></body></html>`);
  }
});

//  Export the router for use in server/_core/index.ts
export default router;
