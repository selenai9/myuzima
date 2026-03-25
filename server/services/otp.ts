import { getDb } from "../db";
import { otps, otpAttempts, InsertOTP, InsertOTPAttempt } from "../../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

const OTP_LENGTH = 6;
const OTP_VALIDITY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 30;

/**
 * Generate a random 6-digit OTP code
 */
export function generateOTPCode(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, "0");
}

/**
 * Send OTP via Africa's Talking SMS API
 * In development, logs to console instead of sending
 */
export async function sendOTPViaSMS(phone: string, code: string): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] OTP for ${phone}: ${code}`);
      return true;
    }

    // TODO: Implement Africa's Talking API integration
    // const response = await fetch('https://api.sandbox.africastalking.com/version1/messaging', {
    //   method: 'POST',
    //   headers: {
    //     'Accept': 'application/json',
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //     'Authorization': `Bearer ${process.env.AFRICA_TALKING_API_KEY}`,
    //   },
    //   body: new URLSearchParams({\n    //     'username': process.env.AFRICA_TALKING_USERNAME!,\n    //     'to': phone,\n    //     'message': `Your MyUZIMA verification code is: ${code}. Valid for 10 minutes.`,\n    //   }).toString(),\n    // });\n    // return response.ok;

    console.warn("[OTP] Africa's Talking SMS not yet implemented");
    return false;
  } catch (error) {
    console.error("[OTP] SMS send failed:", error);
    return false;
  }
}

/**
 * Create and store OTP for phone number
 * Returns the OTP code if successful, null if phone is locked out
 */
export async function createOTP(phone: string): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if phone is locked out
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

  // Generate OTP code
  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  // Store OTP in database
  const otpRecord: InsertOTP = {
    phone,
    code,
    expiresAt,
    used: false,
  };

  await db.insert(otps).values(otpRecord);

  // Send OTP via SMS
  const sent = await sendOTPViaSMS(phone, code);
  if (!sent) {
    console.warn(`[OTP] Failed to send SMS to ${phone}, but OTP stored in DB`);
  }

  return code;
}

/**
 * Verify OTP code for phone number
 * Returns true if valid, throws error if invalid or expired
 */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check attempt count
  const attempts = await db
    .select()
    .from(otpAttempts)
    .where(eq(otpAttempts.phone, phone))
    .limit(1);

  let attemptRecord = attempts[0];

  // Check if locked out
  if (attemptRecord && attemptRecord.lockedUntil && new Date(attemptRecord.lockedUntil) > new Date()) {
    throw new Error("Too many OTP attempts. Please try again later.");
  }

  // Find valid, unused OTP
  const validOTPs = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.phone, phone),
        eq(otps.code, code),
        eq(otps.used, false),
        gt(otps.expiresAt, new Date())
      )
    )
    .limit(1);

  if (validOTPs.length === 0) {
    // Increment attempt count
    if (!attemptRecord) {
      const newAttempt: InsertOTPAttempt = {
        phone,
        attempts: 1,
      };
      await db.insert(otpAttempts).values(newAttempt);
    } else {
      const newAttempts = attemptRecord.attempts + 1;
      const lockout = newAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

      await db
        .update(otpAttempts)
        .set({
          attempts: newAttempts,
          lockedUntil: lockout,
        })
        .where(eq(otpAttempts.phone, phone));
    }

    throw new Error("Invalid or expired OTP code");
  }

  // Mark OTP as used
  await db.update(otps).set({ used: true }).where(eq(otps.phone, phone));

  // Reset attempt count
  if (attemptRecord) {
    await db
      .update(otpAttempts)
      .set({
        attempts: 0,
        lockedUntil: null,
      })
      .where(eq(otpAttempts.phone, phone));
  }

  return true;
}

/**
 * Send notification SMS to patient when their profile is accessed
 */
export async function sendProfileAccessNotification(phone: string, responderName: string): Promise<boolean> {
  try {
    const message = `Your emergency profile was accessed by ${responderName} on ${new Date().toLocaleString()}. If this was unexpected, please contact your healthcare provider.`;

    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] Notification for ${phone}: ${message}`);
      return true;
    }

    // TODO: Implement Africa's Talking API integration for notifications
    console.warn("[SMS] Profile access notification not yet implemented");
    return false;
  } catch (error) {
    console.error("[SMS] Notification send failed:", error);
    return false;
  }
}
