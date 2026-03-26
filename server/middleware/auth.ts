import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getResponderById } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * JWT payload structure
 */
export interface JWTPayload {
  type: "patient" | "responder";
  id: string; // This is the patientId or responderId
  phone?: string;
  badgeId?: string;
  role?: string;
}

/**
 * Extend Express Request type
 */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      responder?: any;
    }
  }
}

export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * UPDATED: Express middleware to verify JWT token from Cookies (C-03)
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Check HttpOnly Cookie first (Production behavior)
  // 2. Fallback to Authorization header (Development/Testing behavior)
  const token = req.cookies?.accessToken || 
                (req.headers.authorization?.startsWith("Bearer ") 
                  ? req.headers.authorization.substring(7) 
                  : null);

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
 * Middleware to verify patient authentication
 */
export function patientAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "patient") {
    return res.status(403).json({ error: "Patient authentication required" });
  }
  next();
}

/**
 * Middleware to verify responder role
 */
export async function responderAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "responder") {
    return res.status(403).json({ error: "Responder authentication required" });
  }

  const responder = await getResponderById(req.user.id);
  if (!responder || !responder.isActive) {
    return res.status(403).json({ error: "Responder not found or inactive" });
  }

  req.responder = responder;
  next();
}

/**
 * Middleware to verify admin role
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
