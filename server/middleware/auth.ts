import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getResponderById } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

/**
 * JWT payload structure - SYNCED with patient.ts
 */
export interface JWTPayload {
  role: "patient" | "responder" | "admin"; // Changed 'type' to 'role'
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
  const token = req.cookies?.accessToken || 
                req.headers.authorization?.split(" ")[1];

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
  if (!req.user || req.user.role !== "patient") { // Use .role
    return res.status(403).json({ error: "Patient authentication required" });
  }
  next();
}

/**
 * Responder Guard (Updated for Audit Logs)
 */
export async function responderAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== "responder" && req.user.role !== "admin")) {
    return res.status(403).json({ error: "Responder access required" });
  }

  // Only perform DB check if it's a dedicated responder role
  if (req.user.role === "responder") {
    const responder = await getResponderById(req.user.id);
    if (!responder || !responder.isActive) {
      return res.status(403).json({ error: "Responder inactive" });
    }
    req.responder = responder;
  }
  
  next();
}
