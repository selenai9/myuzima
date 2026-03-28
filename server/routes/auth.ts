import { Router, Request, Response } from "express";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import { createPatient, getPatientByPhone, getResponderByBadgeId } from "../db";
import { createOTP, verifyOTP } from "../services/otp";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  JWTPayload,
} from "../middleware/auth";
import {
  otpRegisterLimiter,
  otpVerifyLimiter,
  responderLoginLimiter,
} from "../middleware/rateLimit";
import { isDemoMode, mockStore } from "../mockStore";

const router = Router();

const isProduction = process.env.NODE_ENV === "production";
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

// GET /auth/me and /auth/status
const getMe = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) return res.json(null);
    const payload = verifyToken(token) as JWTPayload;
    if (!payload) return res.json(null);
    res.json({ authenticated: true, user: payload });
  } catch {
    res.json(null);
  }
};
router.get("/me", getMe);
router.get("/status", getMe);

// POST /auth/demo — Instant demo login, no DB required
// Roles: patient | responder | admin
router.post("/demo", (req: Request, res: Response) => {
  const { role = "patient" } = req.body ?? {};
  let payload: JWTPayload;
  if (role === "responder") {
    payload = { role: "responder", id: "responder-demo-1", badgeId: "DEMO001", name: "Dr. Mutesi Amina" };
  } else if (role === "admin") {
    payload = { role: "admin", id: "responder-admin-1", name: "System Administrator" };
  } else {
    payload = { role: "patient", id: "patient-demo-1", phone: "+250788123456", name: "Demo Patient" };
  }
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ success: true, role, user: payload });
});

// POST /auth/refresh — Silent token refresh
router.post("/refresh", (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });
  try {
    const payload = verifyToken(refreshToken) as JWTPayload;
    if (!payload) throw new Error("Invalid");
    const newAccessToken = generateAccessToken(payload);
    res.cookie("accessToken", newAccessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
    res.json({ success: true });
  } catch {
    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.clearCookie("refreshToken", COOKIE_OPTIONS);
    res.status(401).json({ error: "Refresh token invalid or expired" });
  }
});

// POST /auth/register
router.post("/register", otpRegisterLimiter, async (req: Request, res: Response) => {
  try {
    const { phone } = z.object({ phone: z.string().regex(/^\+?[1-9]\d{1,14}$/) }).parse(req.body);
    if (isDemoMode()) {
      let patient = mockStore.patientsByPhone.get(phone);
      if (!patient) patient = mockStore.createPatient(phone);
      const code = Math.random().toString().slice(2, 8).padStart(6, "0");
      mockStore.createOTP(phone, code);
      console.log(`[DEMO-AUTH] OTP for ${phone}: ${code}  (or use 123456)`);
      return res.json({ success: true, message: "OTP sent (demo: use 123456 or check server logs)" });
    }
    let patient = await getPatientByPhone(phone);
    if (!patient) await createPatient(phone);
    await createOTP(phone);
    res.json({ success: true, message: "OTP sent" });
  } catch (error) {
    res.status(400).json({ error: "Registration failed" });
  }
});

// POST /auth/verify-otp
router.post("/verify-otp", otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, code } = z.object({ phone: z.string(), code: z.string() }).parse(req.body);
    if (isDemoMode()) {
      const otp = mockStore.findValidOTP(phone, code);
      if (!otp) return res.status(401).json({ error: "Invalid or expired OTP code" });
      mockStore.markOTPUsed(otp.id);
      let patient = mockStore.patientsByPhone.get(phone);
      if (!patient) patient = mockStore.createPatient(phone);
      const payload: JWTPayload = { role: "patient", id: patient.id, phone, name: "Patient" };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      setAuthCookies(res, accessToken, refreshToken);
      return res.json({ success: true, accessToken, patient: { id: patient.id, consentGiven: patient.consentGiven } });
    }
    await verifyOTP(phone, code);
    const patient = await getPatientByPhone(phone);
    if (!patient) throw new Error("Patient not found");
    const payload: JWTPayload = { role: "patient", id: patient.id, phone, name: "Patient" };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ success: true, accessToken, patient: { id: patient.id, consentGiven: patient.consentGiven } });
  } catch (error) {
    res.status(401).json({ error: "Verification failed" });
  }
});

// POST /auth/responder/login
router.post("/responder/login", responderLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { badgeId, pin } = z.object({ badgeId: z.string(), pin: z.string() }).parse(req.body);
    if (isDemoMode()) {
      const responder = mockStore.respondersByBadge.get(badgeId);
      if (!responder || !responder.isActive) return res.status(401).json({ error: "Invalid credentials" });
      const pinValid = await bcryptjs.compare(pin, responder.pinHash);
      if (!pinValid) return res.status(401).json({ error: "Invalid credentials" });
      const role: JWTPayload["role"] = badgeId === "ADMIN01" ? "admin" : "responder";
      const payload: JWTPayload = { role, id: responder.id, badgeId: responder.badgeId, name: responder.name };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      setAuthCookies(res, accessToken, refreshToken);
      return res.json({ success: true, accessToken, responder: { id: responder.id, name: responder.name, role } });
    }
    const responder = await getResponderByBadgeId(badgeId);
    if (!responder || !responder.isActive) throw new Error("Invalid credentials");
    const pinValid = await bcryptjs.compare(pin, responder.pinHash);
    if (!pinValid) throw new Error("Invalid credentials");
    const payload: JWTPayload = { role: (responder.role as any) || "responder", id: responder.id, badgeId: responder.badgeId, name: responder.name };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ success: true, accessToken, responder: { id: responder.id, name: responder.name } });
  } catch (error) {
    res.status(401).json({ error: "Login failed" });
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.json({ success: true });
});

export default router;
