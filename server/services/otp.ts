import { getDb } from "../db";
import { otps, otpAttempts, InsertOTP, InsertOTPAttempt } from "../../drizzle/schema";
import { eq, and, gt, or } from "drizzle-orm";
import crypto from "crypto";

// --- CONFIGURATION PARAMETERS ---
const OTP_LENGTH = 6;              
const OTP_VALIDITY_MINUTES = 10;   
const MAX_ATTEMPTS = 3;            
const LOCKOUT_MINUTES = 30;        
const DEMO_MASTER_CODE = "123456"; // Academic Demo Shortcut

export function generateOTPCode(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, "0");
}

/**
 * SMS Gateway Wrapper (Mocked for Production Demo)
 */
export async function sendOTPViaSMS(phone: string, code: string): Promise<boolean> {
  try {
    // For Academic Submission: We log the code to the server console 
    // This proves the logic works even without an expensive SMS gateway.
    console.log(`[AUTH-GATEWAY] Outbound SMS for ${phone}: Your MyUZIMA code is ${code}`);
    
    if (process.env.NODE_ENV === "development") {
      return true;
    }

    // In Production/Demo: We return true to allow the flow to continue
    // but remind the developer in the logs that this is a simulated delivery.
    console.warn(`[OTP] SMS Gateway Simulated for ${phone}. Use Master Code or check logs.`);
    return true; 
  } catch (error) {
    console.error("[OTP] Gateway Error:", error);
    return false;
  }
}

export async function createOTP(phone: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const attempts = await db
    .select()
    .from(otpAttempts)
    .where(eq(otpAttempts.phone, phone))
    .limit(1);

  if (attempts.length > 0) {
    const attempt = attempts[0];
    if (attempt.lockedUntil && new Date(attempt.lockedUntil) > new Date()) {
      throw new Error("Too many OTP attempts. Please try again later.");
    }
  }

  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  const otpRecord: InsertOTP = {
    phone,
    code,
    expiresAt,
    used: false,
  };

  await db.insert(otps).values(otpRecord);
  await sendOTPViaSMS(phone, code);
}

/**
 * OTP Verification (Supports Master Demo Code)
 */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const attempts = await db
    .select()
    .from(otpAttempts)
    .where(eq(otpAttempts.phone, phone))
    .limit(1);

  let attemptRecord = attempts[0];

  if (attemptRecord && attemptRecord.lockedUntil && new Date(attemptRecord.lockedUntil) > new Date()) {
    throw new Error("Too many OTP attempts. Please try again later.");
  }

  // UPDATED QUERY: Accepts the REAL generated code OR the Master Demo Code
  const validOTPs = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.phone, phone),
        or(eq(otps.code, code), eq(code, DEMO_MASTER_CODE)), 
        eq(otps.used, false),
        gt(otps.expiresAt, new Date())
      )
    )
    .limit(1);

  if (validOTPs.length === 0) {
    if (!attemptRecord) {
      const newAttempt: InsertOTPAttempt = { phone, attempts: 1 };
      await db.insert(otpAttempts).values(newAttempt);
    } else {
      const newAttempts = attemptRecord.attempts + 1;
      const lockout = newAttempts >= MAX_ATTEMPTS 
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) 
        : null;

      await db
        .update(otpAttempts)
        .set({ attempts: newAttempts, lockedUntil: lockout })
        .where(eq(otpAttempts.phone, phone));
    }
    throw new Error("Invalid or expired OTP code");
  }

  await db.update(otps).set({ used: true }).where(eq(otps.id, validOTPs[0].id));

  if (attemptRecord) {
    await db
      .update(otpAttempts)
      .set({ attempts: 0, lockedUntil: null })
      .where(eq(otpAttempts.phone, phone));
  }

  return true;
}

export async function sendProfileAccessNotification(phone: string, responderName: string): Promise<boolean> {
  try {
    const message = `Security Alert: Your MyUZIMA profile was accessed by ${responderName}.`;
    console.log(`[NOTIFY-SIM] ${phone}: ${message}`);
    return true;
  } catch (error) {
    console.error("[NOTIFY] Event notification failed:", error);
    return false;
  }
}
