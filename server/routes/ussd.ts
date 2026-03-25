import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { createOTP } from "../services/otp";

const router = Router();

interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  step: "menu" | "patient_register_phone" | "patient_register_otp" | "responder_lookup";
  data: Record<string, string>;
}

// In-memory session store (in production, use Redis)
const sessions = new Map<string, USSDSession>();

/**
 * USSD Webhook Handler for Africa's Talking
 * Expected parameters:
 * - sessionId: Unique session identifier
 * - phoneNumber: User's phone number
 * - text: User's input (empty for initial request)
 * - serviceCode: USSD code (e.g., *777#)
 */
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const { sessionId, phoneNumber, text, serviceCode } = req.body;

    console.log("[USSD] Webhook received:", {
      sessionId,
      phoneNumber,
      text,
      serviceCode,
    });

    // Validate required fields
    if (!sessionId || !phoneNumber) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let session = sessions.get(sessionId);

    // Initial request (empty text)
    if (!text || text.trim() === "") {
      session = {
        sessionId,
        phoneNumber,
        step: "menu",
        data: {},
      };
      sessions.set(sessionId, session);

      const response = handleMainMenu();
      return res.set("Content-Type", "text/plain").send(response);
    }

    // Ensure session exists
    if (!session) {
      session = {
        sessionId,
        phoneNumber,
        step: "menu",
        data: {},
      };
      sessions.set(sessionId, session);
    }

    // Route based on current step
    let response: string;

    switch (session.step) {
      case "menu":
        response = await handleMenuSelection(text, session);
        break;

      case "patient_register_phone":
        response = await handlePatientPhoneInput(text, session);
        break;

      case "patient_register_otp":
        response = await handlePatientOTPInput(text, session);
        break;

      case "responder_lookup":
        response = await handleResponderLookup(text, session);
        break;

      default:
        response = handleMainMenu();
    }

    // Update session
    sessions.set(sessionId, session);

    // Clean up session after 15 minutes of inactivity
    setTimeout(() => {
      sessions.delete(sessionId);
    }, 15 * 60 * 1000);

    res.set("Content-Type", "text/plain").send(response);
  } catch (error) {
    console.error("[USSD] Error handling webhook:", error);
    const message = error instanceof Error ? error.message : "An error occurred";
    res.set("Content-Type", "text/plain").send(`END Error: ${message}`);
  }
});

/**
 * Main menu
 */
function handleMainMenu(): string {
  return `CON Welcome to MyUZIMA
1. Patient Registration
2. Responder Profile Lookup
3. Help
0. Exit`;
}

/**
 * Handle menu selection
 */
async function handleMenuSelection(text: string, session: USSDSession): Promise<string> {
  const choice = text.trim();

  switch (choice) {
    case "1":
      // Patient registration
      session.step = "patient_register_phone";
      return `CON Enter your phone number (e.g., +250712345678):`;

    case "2":
      // Responder lookup
      session.step = "responder_lookup";
      return `CON Enter responder badge ID:`;

    case "3":
      // Help
      return `END MyUZIMA Emergency QR Access System
Patient: Register to create emergency profile
Responder: Access encrypted patient data via QR
For support: contact@myuzima.rw`;

    case "0":
      // Exit
      return `END Thank you for using MyUZIMA`;

    default:
      return `CON Invalid selection. Please try again.
1. Patient Registration
2. Responder Profile Lookup
3. Help
0. Exit`;
  }
}

/**
 * Handle patient phone number input
 */
async function handlePatientPhoneInput(
  text: string,
  session: USSDSession
): Promise<string> {
  const phone = text.trim();

  // Validate phone format
  if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
    return `CON Invalid phone number. Please try again:`;
  }

  // Generate and send OTP
  try {
    const otp = await createOTP(phone);
    // TODO: Send OTP via Africa's Talking SMS
    console.log(`[USSD] OTP for ${phone}: ${otp}`);

    session.data.phone = phone;
    session.step = "patient_register_otp";

    return `CON OTP sent to ${phone}
Enter the 6-digit code:`;
  } catch (error) {
    console.error("[USSD] Error sending OTP:", error);
    return `END Error sending OTP. Please try again later.`;
  }
}

/**
 * Handle patient OTP verification
 */
async function handlePatientOTPInput(
  text: string,
  session: USSDSession
): Promise<string> {
  const otp = text.trim();
  const phone = session.data.phone;

  if (!phone) {
    return `END Session expired. Please start over.`;
  }

  // Validate OTP format
  if (!/^\d{6}$/.test(otp)) {
    return `CON Invalid OTP. Please enter 6 digits:`;
  }

  try {
    const db = await getDb();
    if (!db) {
      return `END Database error. Please try again later.`;
    }

    // Verify OTP (in production, check against stored OTP)
    // For now, accept any 6-digit code
    const verified = true; // TODO: Implement actual OTP verification

    if (!verified) {
      return `CON Invalid OTP. Please try again:`;
    }

    // Create patient account
    // TODO: Implement patient creation logic

    return `END Registration successful!
Visit MyUZIMA web app to create your emergency profile.`;
  } catch (error) {
    console.error("[USSD] Error verifying OTP:", error);
    return `END Error during registration. Please try again.`;
  }
}

/**
 * Handle responder badge lookup
 */
async function handleResponderLookup(
  text: string,
  session: USSDSession
): Promise<string> {
  const badgeId = text.trim();

  try {
    const db = await getDb();
    if (!db) {
      return `END Database error. Please try again later.`;
    }

    // TODO: Implement responder lookup logic
    // For now, return a placeholder

    return `END Responder lookup feature coming soon.
Use the web app to scan QR codes.`;
  } catch (error) {
    console.error("[USSD] Error looking up responder:", error);
    return `END Error during lookup. Please try again.`;
  }
}

export default router;
