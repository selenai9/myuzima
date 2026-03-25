import rateLimit from "express-rate-limit";

/**
 * Rate limiter for OTP registration (3 attempts per 30 minutes)
 */
export const otpRegisterLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 3, // 3 requests per window
  message: "Too many registration attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by phone number from request body
    return (req.body?.phone as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for OTP verification (5 attempts per 15 minutes)
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many OTP verification attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by phone number
    return (req.body?.phone as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for responder login (5 attempts per 15 minutes)
 */
export const responderLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by badge ID
    return (req.body?.badgeId as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for general API endpoints (100 requests per 15 minutes)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
