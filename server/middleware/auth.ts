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
 * Extend Express Request type to include our user payload
 * This removes the need for (req as any) in your routes.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      responder?: any;
    }
  }
}

/**
 * Generate access token (15 minutes)
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate refresh token (7 days)
 */
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Express middleware to verify JWT token from Authorization header
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Attach payload to request
  // Because of the 'declare global' above, req.user is now valid TypeScript
  req.user = payload;
  next();
}

/**
 * Middleware to verify patient authentication
 * Specifically ensures the 'type' is 'patient'
 */
export function patientAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.type !== "patient") {
    return res.status(403).json({ error: "Patient authentication required" });
  }

  // For the recordConsent route, we rely on req.user.id being the Patient's ID
  next();
}

/**
 * Middleware to verify responder role and badge
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
