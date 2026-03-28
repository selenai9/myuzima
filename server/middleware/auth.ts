import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getResponderById } from "../db";
import { isDemoMode, mockStore } from "../mockStore";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * JWT payload structure - SYNCED with patient.ts
 */
export interface JWTPayload {
  role: "patient" | "responder" | "admin";
  id: string;
  phone?: string;
  badgeId?: string;
  name?: string; // Added for Audit Logs
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      responder?: any;
    }
  }
}

// 1. New Export: Generate Access Token
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

// 2. New Export: Generate Refresh Token
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

// Helper: Verify Token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Main Auth Middleware
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = payload;
  next();
}

/**
 * Patient Guard
 */
export function patientAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "patient") {
    return res.status(403).json({ error: "Patient authentication required" });
  }
  next();
}

/**
 * Responder Guard
 * Fixes applied: 
 * 1. Added async for getResponderById
 * 2. Changed user.type to user.role
 * 3. Unified DB check inside function scope
 */
export const responderAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user || user.role !== "responder") {
    return res.status(403).json({ error: "Responder access required" });
  }

  // ── DEMO MODE: responders live in mockStore, not the DB ──────────────────
  if (isDemoMode()) {
    const demoResponder = mockStore.respondersByBadge.get(user.badgeId || "");
    // For the hardcoded demo JWT (id: "responder-demo-1"), always allow
    if (user.id === "responder-demo-1" || (demoResponder && demoResponder.isActive)) {
      req.responder = demoResponder || { id: user.id, name: user.name, isActive: true };
      return next();
    }
    return res.status(403).json({ error: "Responder inactive" });
  }

  try {
    // Perform DB check to ensure account is active
    const responder = await getResponderById(user.id);
    if (!responder || !responder.isActive) {
      return res.status(403).json({ error: "Responder inactive" });
    }
    
    req.responder = responder;
    next();
  } catch (error) {
    console.error("Responder Auth Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Admin Guard
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
