import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import authRoutes from "../routes/auth";
import patientRoutes from "../routes/patient";
import emergencyRoutes from "../routes/emergency";
import adminRoutes from "../routes/admin";
import healthRoutes from "../routes/health";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // CORS - Allow frontend connections from any origin (academic demo)
  app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Configure body parser
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Enable cookie parsing to read HttpOnly tokens
  app.use(cookieParser());

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // MyUZIMA API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/patient", patientRoutes);
  app.use("/api/emergency", emergencyRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/health", healthRoutes);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`\n🚀 MyUZIMA Server running on http://localhost:${port}/`);
    console.log(`\n--- API Routes Registered ---`);
    console.log(`[AUTH]      POST   /api/auth/register`);
    console.log(`[AUTH]      POST   /api/auth/verify-otp`);
    console.log(`[AUTH]      POST   /api/auth/refresh`);
    console.log(`[AUTH]      POST   /api/auth/logout`);
    console.log(`[AUTH]      GET    /api/auth/me`);
    console.log(`[AUTH]      GET    /api/auth/status`);
    console.log(`[PATIENT]   POST   /api/patient/consent`);
    console.log(`[PATIENT]   GET    /api/patient/profile`);
    console.log(`[PATIENT]   POST   /api/patient/profile`);
    console.log(`[PATIENT]   PUT    /api/patient/profile`);    console.log(`[PATIENT]   GET    /api/patient/qr`);
    console.log(`[PATIENT]   GET    /api/patient/access-history`);
    console.log(`[EMERGENCY] POST   /api/emergency/scan`);
    console.log(`[EMERGENCY] POST   /api/emergency/audit/log`);
    console.log(`[ADMIN]     GET    /api/admin/responders`);
    console.log(`[ADMIN]     GET    /api/admin/facilities`);
    console.log(`[ADMIN]     POST   /api/admin/responder`);
    console.log(`[ADMIN]     DELETE /api/admin/responder/:id`);
    console.log(`[ADMIN]     GET    /api/admin/audit-logs`);
    console.log(`[ADMIN]     GET    /api/admin/stats`);
    console.log(`[HEALTH]    GET    /api/health`);
    console.log(`-----------------------------\n`);
  });
}

startServer().catch(console.error);
