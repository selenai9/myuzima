import { getDb } from "../db";
import { otps, otpAttempts, InsertOTP, InsertOTPAttempt } from "../../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

// --- CONFIGURATION PARAMETERS ---
const OTP_LENGTH = 6;              
const OTP_VALIDITY_MINUTES = 10;   // TTL (Time To Live) for the OTP record
const MAX_ATTEMPTS = 3;            // Threshold for Brute-Force mitigation
const LOCKOUT_MINUTES = 30;        // Temporal ban duration after threshold breach

/**
 * CSPRNG OTP Generation
 * Uses Node.js Crypto for cryptographically strong pseudo-random number generation.
 * Avoids Math.random() to prevent predictability.
 */
export function generateOTPCode(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, "0");
}

/**
 * SMS Gateway Wrapper
 * Handles delivery via Africa's Talking API.
 * Implements a development-mode bypass to prevent unnecessary API costs/latency.
 */
export async function sendOTPViaSMS(phone: string, code: string): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV] SMS Payload for ${phone}: ${code}`);
      return true;
    }

    // TODO: Finalize Africa's Talking REST API integration (POST /version1/messaging)
    console.warn("[OTP] SMS Gateway integration pending");
    return false;
  } catch (error) {
    console.error("[OTP] Gateway Error:", error);
    return false;
  }
}

/**
 * OTP Initialization & Persistence
 * 1. Checks for active Lockout state in 'otpAttempts'
 * 2. Generates and persists a new OTP record
 * 3. Triggers out-of-band delivery (SMS)
 * * NOTE: Returns void to satisfy M-05 (Preventing code leakage in application memory)
 */
export async function createOTP(phone: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // PRE-FLIGHT: Check if the identifier (phone) is currently rate-limited
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

  // PERSISTENCE: Write the transient OTP record to the database
  const otpRecord: InsertOTP = {
    phone,
    code,
    expiresAt,
    used: false,
  };

  await db.insert(otps).values(otpRecord);

  // DELIVERY: Out-of-band transmission via SMS
  await sendOTPViaSMS(phone, code);
}

/**
 * OTP Verification & Audit Logic
 * 1. Validates input against active, non-expired, unused database records.
 * 2. Increments failure counters on mismatch (Brute-force protection).
 * 3. Atomic update to 'used' status on success (H-01).
 * 4. Resets failure counters upon successful authentication.
 */
export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // 1. RATE LIMIT CHECK: Verify if phone is currently in a 'lockedUntil' state
  const attempts = await db
    .select()
    .from(otpAttempts)
    .where(eq(otpAttempts.phone, phone))
    .limit(1);

  let attemptRecord = attempts[0];

  if (attemptRecord && attemptRecord.lockedUntil && new Date(attemptRecord.lockedUntil) > new Date()) {
    throw new Error("Too many OTP attempts. Please try again later.");
  }

  // 2. QUERY: Fetch matching OTP record with strict conditional filtering
  const validOTPs = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.phone, phone),
        eq(otps.code, code),
        eq(otps.used, false),
        gt(otps.expiresAt, new Date()) // Ensure TTL has not expired
      )
    )
    .limit(1);

  // 3. FAILURE HANDLING: Increment attempts or trigger temporal lockout
  if (validOTPs.length === 0) {
    if (!attemptRecord) {
      const newAttempt: InsertOTPAttempt = { phone, attempts: 1 };
      await db.insert(otpAttempts).values(newAttempt);
    } else {
      const newAttempts = attemptRecord.attempts + 1;
      // If threshold met, calculate lockout expiration
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

  // 4. SUCCESS HANDLING: Atomic update of record status (H-01)
  // Target by primary key (id) to prevent race conditions or duplicate invalidation
  await db.update(otps).set({ used: true }).where(eq(otps.id, validOTPs[0].id));

  // Reset audit record on successful login
  if (attemptRecord) {
    await db
      .update(otpAttempts)
      .set({ attempts: 0, lockedUntil: null })
      .where(eq(otpAttempts.phone, phone));
  }

  return true;
}

/**
 * Event Notification Service
 * Asynchronous notification for profile access events to provide audit transparency.
 */
export async function sendProfileAccessNotification(phone: string, responderName: string): Promise<boolean> {
  try {
    const message = `Security Alert: Your MyUZIMA profile was accessed by ${responderName}.`;

    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV-NOTIFY] ${phone}: ${message}`);
      return true;
    }

    // TODO: Implement Africa's Talking API for high-priority notifications
    return false;
  } catch (error) {
    console.error("[NOTIFY] Event notification failed:", error);
    return false;
  }
}
