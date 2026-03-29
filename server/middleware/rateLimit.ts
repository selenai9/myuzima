import rateLimit from "express-rate-limit";

/**
 * Rate limiter for OTP registration (3 attempts per 30 minutes)
 */
export const otpRegisterLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 3, 
  message: "Too many registration attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Fix: Use the correct validation key for v8+
  validate: { keyGeneratorIpFallback: false }, 
  keyGenerator: (req) => {
    return (req.body?.phone as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for OTP verification (5 attempts per 15 minutes)
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: "Too many OTP verification attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Fix: Use the correct validation key for v8+
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return (req.body?.phone as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for responder login (5 attempts per 15 minutes)
 */
export const responderLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: "Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ Fix: Use the correct validation key for v8+
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    return (req.body?.badgeId as string) || req.ip || "unknown";
  },
});

/**
 * Rate limiter for general API endpoints (100 requests per 15 minutes)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: "Too many requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
