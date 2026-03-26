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
  httpOnly: true, // Prevents JS from reading the cookie
  secure: isProduction, // Only send over HTTPS in production
  sameSite: "lax" as const, // Protection against CSRF
  path: "/",
};

/**
 * Helper to set cookies on response
 */
const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 }); // 15m
  res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7d
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
      patient = await getPatientByPhone(phone);
    }
    await createOTP(phone);
    res.json({ success: true, message: "OTP sent" });
  } catch (error) {
    res.status(400).json({ error: "Registration failed" });
  }
});

/**
 * POST /auth/verify-otp
 * UPDATED: Now sets HttpOnly Cookies
 */
router.post("/verify-otp", otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code } = z.object({ phone: z.string(), code: z.string() }).parse(req.body);
    await verifyOTP(phone, code);
    const patient = await getPatientByPhone(phone);
    if (!patient) throw new Error("Patient not found");

    const payload: JWTPayload = { type: "patient", id: patient.id, phone };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // C-03: Set secure cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      accessToken, // We still return this so the PWA can store the "active" indicator in IDB
      patient: { id: patient.id, consentGiven: patient.consentGiven },
    });
  } catch (error) {
    res.status(401).json({ error: "Verification failed" });
  }
});

/**
 * POST /auth/refresh
 * UPDATED: Uses cookie for token source
 */
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken; // Read from cookie instead of body
    if (!refreshToken) throw new Error("No refresh token");

    const payload = verifyToken(refreshToken);
    if (!payload) throw new Error("Invalid token");

    const accessToken = generateAccessToken(payload);
    
    // Rotate access token cookie
    res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });

    res.json({ success: true, accessToken });
  } catch (error) {
    res.status(401).json({ error: "Refresh failed" });
  }
});

/**
 * NEW: GET /auth/me
 * Allows the client to check who is logged in (since JS can't read cookies)
 */
router.get("/me", async (req: Request, res: Response) => {
  const token = req.cookies.accessToken;
  if (!token) return res.status(401).json({ user: null });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ user: null });

  res.json({ user: payload });
});

/**
 * NEW: POST /auth/logout
 * UPDATED: Clears cookies from the browser
 */
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.json({ success: true, message: "Logged out" });
});

/**
 * POST /auth/responder/login
 * UPDATED: Now sets HttpOnly Cookies
 */
router.post("/responder/login", responderLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { badgeId, pin } = z.object({ badgeId: z.string(), pin: z.string() }).parse(req.body);
    const responder = await getResponderByBadgeId(badgeId);
    
    if (!responder || !responder.isActive) throw new Error("Invalid credentials");
    const pinValid = await bcryptjs.compare(pin, responder.pinHash);
    if (!pinValid) throw new Error("Invalid credentials");

    const payload: JWTPayload = { 
      type: "responder", 
      id: responder.id, 
      badgeId: responder.badgeId, 
      role: responder.role 
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ success: true, accessToken, responder: { id: responder.id, name: responder.name } });
  } catch (error) {
    res.status(401).json({ error: "Login failed" });
  }
});

export default router;
