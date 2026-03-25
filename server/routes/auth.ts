import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { createPatient, getPatientByPhone, getResponderByBadgeId } from "../db";
import { createOTP, verifyOTP } from "../services/otp";
import { generateAccessToken, generateRefreshToken, verifyToken, JWTPayload } from "../middleware/auth";
import { otpRegisterLimiter, otpVerifyLimiter, responderLoginLimiter } from "../middleware/rateLimit";

const router = Router();

/**
 * Validation schemas
 */
const registerSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
});

const verifyOTPSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number"),
  code: z.string().length(6, "OTP must be 6 digits"),
});

const responderLoginSchema = z.object({
  badgeId: z.string().min(1, "Badge ID required"),
  pin: z.string().length(4, "PIN must be 4 digits"),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});

/**
 * POST /auth/register
 * Patient registration: send OTP via SMS
 */
router.post("/register", otpRegisterLimiter, async (req: Request, res: Response) => {
  try {
    const { phone } = registerSchema.parse(req.body);

    // Check if patient already exists
    let patient = await getPatientByPhone(phone);
    if (!patient) {
      // Create new patient record
      await createPatient(phone);
      patient = await getPatientByPhone(phone);
    }

    // Generate and send OTP
    const otpCode = await createOTP(phone);

    res.json({
      success: true,
      message: "OTP sent to phone number",
      phone,
    });
  } catch (error) {
    console.error("[Auth] Registration error:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Registration failed",
    });
  }
});

/**
 * POST /auth/verify-otp
 * Verify OTP and issue JWT tokens
 */
router.post("/verify-otp", otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code } = verifyOTPSchema.parse(req.body);

    // Verify OTP
    await verifyOTP(phone, code);

    // Get patient
    const patient = await getPatientByPhone(phone);
    if (!patient) {
      throw new Error("Patient not found");
    }

    // Generate tokens
    const payload: JWTPayload = {
      type: "patient",
      id: patient.id,
      phone,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      patient: {
        id: patient.id,
        phone: patient.phone,
        phoneVerified: patient.phoneVerified,
        consentGiven: patient.consentGiven,
      },
    });
  } catch (error) {
    console.error("[Auth] OTP verification error:", error);
    res.status(401).json({
      error: error instanceof Error ? error.message : "OTP verification failed",
    });
  }
});

/**
 * POST /auth/refresh
 * Issue new access token using refresh token
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    const payload = verifyToken(refreshToken);
    if (!payload) {
      throw new Error("Invalid or expired refresh token");
    }

    // Generate new access token
    const accessToken = generateAccessToken(payload);

    res.json({
      success: true,
      accessToken,
    });
  } catch (error) {
    console.error("[Auth] Token refresh error:", error);
    res.status(401).json({
      error: error instanceof Error ? error.message : "Token refresh failed",
    });
  }
});

/**
 * POST /auth/responder/login
 * Responder login via badge ID and PIN
 */
router.post("/responder/login", responderLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { badgeId, pin } = responderLoginSchema.parse(req.body);

    // Get responder by badge ID
    const responder = await getResponderByBadgeId(badgeId);
    if (!responder || !responder.isActive) {
      throw new Error("Invalid badge ID or responder not active");
    }

    // Verify PIN
    const pinValid = await bcryptjs.compare(pin, responder.pinHash);
    if (!pinValid) {
      throw new Error("Invalid PIN");
    }

    // Generate tokens
    const payload: JWTPayload = {
      type: "responder",
      id: responder.id,
      badgeId: responder.badgeId,
      role: responder.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      responder: {
        id: responder.id,
        badgeId: responder.badgeId,
        name: responder.name,
        role: responder.role,
      },
    });
  } catch (error) {
    console.error("[Auth] Responder login error:", error);
    res.status(401).json({
      error: error instanceof Error ? error.message : "Login failed",
    });
  }
});

export default router;
