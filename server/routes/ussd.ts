import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { createOTP, verifyOTP } from "../services/otp";

const router = Router();

/**
 * USSD is stateless. We use this interface to track a user's progress 
 * across multiple separate HTTP requests from the provider.
 */
interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  step: "menu" | "patient_register_phone" | "patient_register_otp" | "responder_lookup";
  data: Record<string, string>; // Temporary storage for data collected during the session
}

// In-memory store. Swap for Redis in production to support horizontal scaling/server restarts.
const sessions = new Map<string, USSDSession>();

/**
 * AFRICA'S TALKING WEBHOOK HANDLER
 * This endpoint is called every time the user types something on their phone.
 */
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    /* --- SECURITY: WEBHOOK AUTHENTICATION --- */
    // M-02: Ensure the request is actually from Africa's Talking.
    // We compare their signature header against our private API Key.
    const apiKey = process.env.AFRICA_TALKING_API_KEY;
    if (apiKey) {
      const signature = req.headers["x-africastalking-signature"];
      if (signature !== apiKey) {
        console.warn("[USSD] Rejected request with invalid signature");
        return res.status(401).send("END Unauthorized");
      }
    }

    const { sessionId, phoneNumber, text, serviceCode } = req.body;

    /* --- PRIVACY: LOG REDACTION --- */
    // M-05: We redact the end of the phone number so PII (Personally Identifiable 
    // Information) doesn't sit in plain text in our log files.
    console.log("[USSD] Webhook received:", {
      sessionId,
      phoneNumber: phoneNumber?.replace(/\d{4}$/, "****"), 
      serviceCode,
    });

    if (!sessionId || !phoneNumber) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let session = sessions.get(sessionId);

    /* --- SESSION INITIALIZATION --- */
    // If text is empty, the user just dialed the code (e.g., *777#).
    if (!text || text.trim() === "") {
      session = {
        sessionId,
        phoneNumber,
        step: "menu",
        data: {},
      };
      sessions.set(sessionId, session);

      const response = handleMainMenu();
      // USSD requires 'text/plain' and specific prefixes (CON/END)
      return res.set("Content-Type", "text/plain").send(response);
    }

    // Fallback: If session timed out but user is still typing, reset to menu.
    if (!session) {
      session = { sessionId, phoneNumber, step: "menu", data: {} };
      sessions.set(sessionId, session);
    }

    /* --- STATE MANAGEMENT: STEP ROUTING --- */
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

    // Save updated session state back to the map
    sessions.set(sessionId, session);

    /* --- HOUSEKEEPING --- */
    // Automatically wipe session from memory after 15 mins to prevent memory leaks.
    setTimeout(() => {
      sessions.delete(sessionId);
    }, 15 * 60 * 1000);

    res.set("Content-Type", "text/plain").send(response);
  } catch (error) {
    console.error("[USSD] Error handling webhook:", error);
    const message = error instanceof Error ? error.message : "An error occurred";
    // Always start error responses with END to hang up the USSD call.
    res.set("Content-Type", "text/plain").send(`END Error: ${message}`);
  }
});

/**
 * MENU HANDLER: Initial greeting
 * CON = Continue (keeps the input box open on the phone)
 */
function handleMainMenu(): string {
  return `CON Welcome to MyUZIMA
1. Patient Registration
2. Responder Profile Lookup
3. Help
0. Exit`;
}

/**
 * MENU SELECTION: Logic for the first user input
 */
async function handleMenuSelection(text: string, session: USSDSession): Promise<string> {
  const choice = text.trim();

  switch (choice) {
    case "1":
      session.step = "patient_register_phone";
      return `CON Enter your phone number (e.g., +250712345678):`;
    case "2":
      session.step = "responder_lookup";
      return `CON Enter responder badge ID:`;
    case "3":
      // END = Ends the session immediately after showing this text
      return `END MyUZIMA Emergency QR Access System\nFor support: contact@myuzima.rw`;
    case "0":
      return `END Thank you for using MyUZIMA`;
    default:
      return `CON Invalid selection. Please try again.\n1. Patient Registration...`;
  }
}

/**
 * REGISTRATION: Handles phone number submission
 */
async function handlePatientPhoneInput(text: string, session: USSDSession): Promise<string> {
  const phone = text.trim();

  // Basic regex for international phone format
  if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
    return `CON Invalid phone number. Please try again:`;
  }

  try {
    // Triggers the actual SMS delivery via the OTP service
    await createOTP(phone);
    
    // M-05: We do NOT log the OTP here. It only exists in the SMS sent to the user.
    session.data.phone = phone; // Store phone in session for the next step
    session.step = "patient_register_otp";

    return `CON OTP sent to ${phone}\nEnter the 6-digit code:`;
  } catch (error) {
    console.error("[USSD] Error sending OTP:", error);
    return `END Error sending OTP. Please try again later.`;
  }
}

/**
 * VERIFICATION: Validates the 6-digit code
 */
async function handlePatientOTPInput(text: string, session: USSDSession): Promise<string> {
  const otp = text.trim();
  const phone = session.data.phone;

  if (!phone) return `END Session expired. Please start over.`;

  // Ensure user input is exactly 6 digits before hitting the DB
  if (!/^\d{6}$/.test(otp)) {
    return `CON Invalid OTP. Please enter 6 digits:`;
  }

  try {
    // C-02: Strict verification against the database/cache record.
    await verifyOTP(phone, otp);

    // If verifyOTP doesn't throw an error, registration is successful.
    return `END Registration successful!\nVisit MyUZIMA web app to create your profile.`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Invalid OTP";
    console.error("[USSD] OTP verification failed:", msg);
    
    // SECURITY: If the user is locked out (brute force protection), force the session to END.
    const isLockout = msg.toLowerCase().includes("too many");
    return isLockout
      ? `END ${msg}`
      : `CON ${msg}\nEnter the 6-digit code:`; // Otherwise, let them try again.
  }
}

/**
 * RESPONDER LOOKUP: Future expansion point
 */
async function handleResponderLookup(text: string, session: USSDSession): Promise<string> {
  // Logic for looking up medical personnel goes here.
  return `END Responder lookup feature coming soon.`;
}

export default router;
