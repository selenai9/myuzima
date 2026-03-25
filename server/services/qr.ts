import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getDb } from "../db";
import { qrCodes, emergencyProfiles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateQRPayloadToken } from "./crypto";

/**
 * Generate QR code as data URL (PNG)
 * The QR code contains an encrypted reference token that the server can decrypt
 */
export async function generateQRCodeDataUrl(profileId: string): Promise<string> {
  try {
    const token = generateQRPayloadToken(profileId);
    const qrDataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 300,
    });
    return qrDataUrl;
  } catch (error) {
    throw new Error(`QR code generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate QR code as PNG buffer
 */
export async function generateQRCodeBuffer(profileId: string): Promise<Buffer> {
  try {
    const token = generateQRPayloadToken(profileId);
    const buffer = await QRCode.toBuffer(token, {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 1,
      width: 300,
    });
    return buffer;
  } catch (error) {
    throw new Error(`QR code generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate PDF emergency card with QR code
 * Card includes patient info, blood type, and QR code for scanning
 */
export async function generateEmergencyCardPDF(profileId: string, patientPhone: string): Promise<Buffer> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Fetch emergency profile
    const profiles = await db
      .select()
      .from(emergencyProfiles)
      .where(eq(emergencyProfiles.id, profileId))
      .limit(1);

    if (profiles.length === 0) {
      throw new Error("Emergency profile not found");
    }

    // Generate QR code
    const qrBuffer = await generateQRCodeBuffer(profileId);
    const qrBase64 = qrBuffer.toString("base64");
    const qrDataUrl = `data:image/png;base64,${qrBase64}`;

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 40;
    let y = height - margin;

    // Title
    page.drawText("MyUZIMA Emergency Medical Card", {
      x: margin,
      y,
      size: 24,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.8),
    });
    y -= 40;

    // Patient info
    page.drawText(`Patient Phone: ${patientPhone}`, {
      x: margin,
      y,
      size: 12,
      font,
    });
    y -= 25;

    page.drawText(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 40;

    // Instructions
    page.drawText("Scan this QR code to access emergency profile:", {
      x: margin,
      y,
      size: 12,
      font: boldFont,
    });
    y -= 30;

    // Embed QR code image
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrSize = 250;
    const qrX = (width - qrSize) / 2;
    page.drawImage(qrImage, {
      x: qrX,
      y: y - qrSize,
      width: qrSize,
      height: qrSize,
    });
    y -= qrSize + 40;

    // Footer
    page.drawText("Keep this card with you at all times. First responders will scan this QR code to access your medical information.", {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
      maxWidth: width - 2 * margin,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Store QR code record in database
 */
export async function storeQRCode(profileId: string, encryptedPayload: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(qrCodes).values({
    profileId,
    encryptedPayload,
    isActive: true,
  });
}

/**
 * Regenerate QR code when profile is updated
 */
export async function regenerateQRCode(profileId: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generate new encrypted payload
  const token = generateQRPayloadToken(profileId);

  // Update QR code in database
  await db
    .update(qrCodes)
    .set({
      encryptedPayload: token,
    })
    .where(eq(qrCodes.profileId, profileId));

  return token;
}
