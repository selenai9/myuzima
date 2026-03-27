import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getDb } from "../db";
import { qrCodes, emergencyProfiles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateQRPayloadToken } from "./crypto";

/**
 * Generate QR code as PNG buffer
 */
export async function generateQRCodeBuffer(profileId: string): Promise<Buffer> {
  try {
    const token = generateQRPayloadToken(profileId);
    return await QRCode.toBuffer(token, {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 1,
      width: 300,
    });
  } catch (error) {
    throw new Error(`QR generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate PDF emergency card with QR code
 */
export async function generateEmergencyCardPDF(profileId: string, patientPhone: string): Promise<Buffer> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Generate QR code buffer directly
    const qrBuffer = await generateQRCodeBuffer(profileId);

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 600]); // Custom size for a "card" feel
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width: width,
      height: 60,
      color: rgb(0.8, 0.1, 0.1), // Red header for emergency
    });

    page.drawText("MyUZIMA EMERGENCY CARD", {
      x: 20,
      y: height - 40,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // Patient Info
    let y = height - 100;
    page.drawText(`Registered Phone: ${patientPhone}`, { x: 20, y, size: 12, font });
    y -= 20;
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 20, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });

    // Embed QR Code
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrSize = 200;
    page.drawImage(qrImage, {
      x: (width - qrSize) / 2,
      y: y - 240,
      width: qrSize,
      height: qrSize,
    });

    // Footer Instructions
    page.drawText("INSTRUCTIONS FOR FIRST RESPONDERS:", {
      x: 20,
      y: 100,
      size: 10,
      font: boldFont,
    });
    page.drawText("1. Scan the QR code above.\n2. Access critical medical data immediately.\n3. Provide life-saving care based on profile.", {
      x: 20,
      y: 80,
      size: 9,
      font,
      lineHeight: 12,
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

  const token = generateQRPayloadToken(profileId);

  await db
    .update(qrCodes)
    .set({ encryptedPayload: token })
    .where(eq(qrCodes.profileId, profileId));

  return token;
}
