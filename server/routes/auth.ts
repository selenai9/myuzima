import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { createPatient, getPatientByPhone, getResponderByBadgeId } from "../db";
import { createOTP, verifyOTP } from "../services/otp";
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
 * GET /auth/me & GET /auth/status (Alias)
 * Checks if the user has a valid session cookie and returns their profile.
 */
const getMe = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) return res.json(null);

    const payload = verifyToken(token) as JWTPayload;
    res.json({
      authenticated: true,
      user: payload
    });
  } catch (error) {
    res.json(null);
  }
};

// Register both routes to the same handler
router.get("/me", getMe);
router.get("/status", getMe); // This is the alias that fixes the 404!

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
 */
router.post("/verify-otp", otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code } = z.object({ phone: z.string(), code: z.string() }).parse(req.body);
    await verifyOTP(phone, code);
    const patient = await getPatientByPhone(phone);
    if (!patient) throw new Error("Patient not found");

    const payload: JWTPayload = { 
      role: "patient", 
      id: patient.id, 
      phone,
      name: "Patient" 
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
 */
router.post("/responder/login", responderLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { badgeId, pin } = z.object({ badgeId: z.string(), pin: z.string() }).parse(req.body);
    const responder = await getResponderByBadgeId(badgeId);
    
    if (!responder || !responder.isActive) throw new Error("Invalid credentials");
    const pinValid = await bcryptjs.compare(pin, responder.pinHash);
    if (!pinValid) throw new Error("Invalid credentials");

    const payload: JWTPayload = { 
      role: (responder.role as any) || "responder", 
      id: responder.id, 
      badgeId: responder.badgeId,
      name: responder.name 
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

/**
 * POST /auth/logout
 */
router.post("/logout", (req, res) => {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.json({ success: true });
});

export default router;
