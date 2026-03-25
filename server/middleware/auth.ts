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
  id: string;
  phone?: string;
  badgeId?: string;
  role?: string;
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

  // Attach payload to request for downstream handlers
  (req as any).user = payload;
  next();
}

/**
 * Middleware to verify responder role and badge
 */
export async function responderAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const payload = (req as any).user as JWTPayload | undefined;

  if (!payload || payload.type !== "responder") {
    return res.status(403).json({ error: "Responder authentication required" });
  }

  // Verify responder exists and is active
  const responder = await getResponderById(payload.id);
  if (!responder || !responder.isActive) {
    return res.status(403).json({ error: "Responder not found or inactive" });
  }

  // Attach responder to request
  (req as any).responder = responder;
  next();
}

/**
 * Middleware to verify admin role
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const payload = (req as any).user as JWTPayload | undefined;

  if (!payload || payload.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

/**
 * Middleware to verify patient authentication
 */
export function patientAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const payload = (req as any).user as JWTPayload | undefined;

  if (!payload || payload.type !== "patient") {
    return res.status(403).json({ error: "Patient authentication required" });
  }

  next();
}
