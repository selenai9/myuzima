import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "../../client/index.html"
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  /**
   * DIRECTORY STRATEGY:
   * 1. Primary: dist/public (Where your package.json build script points)
   * 2. Fallback: client/dist (Standard Vite default)
   */
  const rootDir = process.cwd();
  const distPath = path.join(rootDir, "dist", "public");
  const fallbackPath = path.join(rootDir, "client", "dist");

  let finalPath = distPath;

  // Logic to determine which folder actually contains the build
  if (fs.existsSync(path.join(distPath, "index.html"))) {
    console.log(`[Static] Serving from primary path: ${distPath}`);
    finalPath = distPath;
  } else if (fs.existsSync(path.join(fallbackPath, "index.html"))) {
    console.log(`[Static] Primary path empty. Using fallback: ${fallbackPath}`);
    finalPath = fallbackPath;
  } else {
    console.error(`[Static] CRITICAL: No index.html found in ${distPath} or ${fallbackPath}`);
  }

  // Serve all static assets (JS, CSS, Images)
  app.use(express.static(finalPath));

  // Catch-all route for React Router / PWA Navigation
  app.get("*", (_req, res) => {
    const indexPath = path.join(finalPath, "index.html");
    
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`
        <html>
          <body style="font-family: sans-serif; padding: 20px;">
            <h3>Frontend Build Missing</h3>
            <p>The server is running, but the UI files are not in the expected location.</p>
            <p><b>Paths checked:</b></p>
            <ul>
              <li>${distPath}</li>
              <li>${fallbackPath}</li>
            </ul>
          </body>
        </html>
      `);
    }
  });
}
