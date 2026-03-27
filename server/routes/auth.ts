import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { createPatient, getPatientByPhone, getResponderByBadgeId } from "../db";
import { createOTP, verifyOTP } from "../services/otp";
// Import the JWTPayload interface we synced in the middleware file
import { generateAccessToken, generateRefreshToken, verifyToken, JWTPayload } from "../middleware/auth";
import { otpRegisterLimiter, otpVerifyLimiter, responderLoginLimiter } from "../middleware/rateLimit";

const router = Router();

// --- Cookie Configuration ---
const isProduction = process.env.NODE_ENV === "production";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

/**
 * POST /auth/register
 */
router.post("/register", otpRegisterLimiter, async (req: Request, res: Response) => {
  try {
    const { phone } = z.object({ phone: z.string().regex(/^\+?[1-9]\d{1,14}$/) }).parse(req.body);
    let patient = await getPatientByPhone(phone);
    if (!patient) {
      await createPatient(phone);
    }
    await createOTP(phone);
    res.json({ success: true, message: "OTP sent" });
  } catch (error) {
    res.status(400).json({ error: "Registration failed" });
  }
});

/**
 * POST /auth/verify-otp
 * UPDATED: Uses 'role' instead of 'type'
 */
router.post("/verify-otp", otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code } = z.object({ phone: z.string(), code: z.string() }).parse(req.body);
    await verifyOTP(phone, code);
    const patient = await getPatientByPhone(phone);
    if (!patient) throw new Error("Patient not found");

    // FIX: Standardize to 'role' and add 'name' for Audit Logs
    const payload: JWTPayload = { 
      role: "patient", 
      id: patient.id, 
      phone,
      name: "Patient" // Or patient.name if available in DB
    };
    
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      accessToken,
      patient: { id: patient.id, consentGiven: patient.consentGiven },
    });
  } catch (error) {
    res.status(401).json({ error: "Verification failed" });
  }
});

/**
 * POST /auth/responder/login
 * UPDATED: Ensures payload matches JWTPayload interface
 */
router.post("/responder/login", responderLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { badgeId, pin } = z.object({ badgeId: z.string(), pin: z.string() }).parse(req.body);
    const responder = await getResponderByBadgeId(badgeId);
    
    if (!responder || !responder.isActive) throw new Error("Invalid credentials");
    const pinValid = await bcryptjs.compare(pin, responder.pinHash);
    if (!pinValid) throw new Error("Invalid credentials");

    // FIX: Match the standardized payload
    const payload: JWTPayload = { 
      role: (responder.role as any) || "responder", 
      id: responder.id, 
      badgeId: responder.badgeId,
      name: responder.name // CRITICAL for Audit Logs
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ 
      success: true, 
      accessToken, 
      responder: { id: responder.id, name: responder.name } 
    });
  } catch (error) {
    res.status(401).json({ error: "Login failed" });
  }
});

// ... (keep /refresh, /me, and /logout as they were)
export default router;
