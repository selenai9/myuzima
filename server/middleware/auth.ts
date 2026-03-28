import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getResponderById } from "../db";
import { isDemoMode, mockStore } from "../mockStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  role: "patient" | "responder" | "admin";
  id: string;
  phone?: string;
  badgeId?: string;
  name?: string;
}

// Extend Express Request to carry our auth data
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      responder?: any;
    }
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "15m";   // 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d";   // 7 days

// ─── Token Generation ─────────────────────────────────────────────────────────

/**
 * Generate a short-lived access token (15 minutes)
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate a long-lived refresh token (7 days)
 */
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verify and decode a JWT token
 * Returns the decoded payload or null if invalid/expired
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── Auth Middleware (JWT Gate) ────────────────────────────────────────────────

/**
 * Core Authentication Middleware
 * Extracts and verifies JWT from:
 *   1. HttpOnly cookie ("accessToken")
 *   2. Authorization header ("Bearer <token>")
 * Attaches decoded user to req.user
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  // 1. Try HttpOnly cookie first (preferred — more secure)
  if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  // 2. Fallback to Authorization header (for mobile / Postman / service-worker)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
};

// ─── Patient Guard ────────────────────────────────────────────────────────────

/**
 * Patient Role Middleware
 * Ensures the authenticated user has a "patient" role.
 * Must be used AFTER authMiddleware.
 */
export const patientAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user || user.role !== "patient") {
    return res.status(403).json({ error: "Patient access required" });
  }

  next();
};

// ─── Admin Guard ──────────────────────────────────────────────────────────────

/**
 * Admin Role Middleware
 * Ensures the authenticated user has an "admin" role.
 * Must be used AFTER authMiddleware.
 */
export const adminAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};

// ─── Responder Guard ──────────────────────────────────────────────────────────

/**
 * Responder Guard
 * Ensures the user has a responder role and is currently active.
 * Skips DB lookups when running in Demo Mode.
 */
export const responderAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  // 1. Basic Role Check
  if (!user || user.role !== "responder") {
    return res.status(403).json({ error: "Responder access required" });
  }

  // 2. Demo Mode Bypass
  if (isDemoMode()) {
    // Check against mockStore instead of the database
    const demoResponder = mockStore.respondersByBadge.get(user.badgeId || "");
    
    // Check for explicit demo ID or a valid mock responder
    if (user.id === "responder-demo-1" || (demoResponder && demoResponder.isActive)) {
      req.responder = demoResponder || { 
        id: user.id, 
        name: user.name, 
        isActive: true 
      };
      return next(); // Exit early and move to the controller
    }
    
    return res.status(403).json({ error: "Responder account inactive (Demo)" });
  }

  // 3. Production Database Check
  try {
    const responder = await getResponderById(user.id);
    
    if (!responder || !responder.isActive) {
      return res.status(403).json({ error: "Responder inactive or not found" });
    }

    req.responder = responder;
    next();
  } catch (error) {
    console.error("Database Auth Error:", error);
    res.status(500).json({ error: "Internal server error during authentication" });
  }
};
