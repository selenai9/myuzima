// MyUZIMA Service Worker - v1.0.7
const CACHE_NAME = "myuzima-v1.0.7";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

// Essential shell assets
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.svg", // Added branded logo
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => ![CACHE_NAME, RUNTIME_CACHE, API_CACHE].includes(name))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (like analytics) to avoid opaque cache issues
  if (url.origin !== location.origin) return;

  // 1. API Strategy (Network First) - Critical for Medical Data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // 2. SPA Navigation - Ensures the app loads even if the specific URL isn't cached
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 3. Static Assets & Fonts (Cache First)
  // We explicitly target woff2 for our self-hosted Inter font
  if (
    request.method === "GET" && 
    (url.pathname.includes("/assets/") || url.pathname.match(/\.(js|css|woff2|svg|png|jpg|jpeg|webp)$/i))
  ) {
    event.respondWith(cacheFirstStrategy(request));
  }
});

// --- Strategies ---

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    // Only cache successful GET requests to the API (don't cache POST/PUT/DELETE)
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    // If offline and no cache, return a JSON error that the UI can handle
    return cached || new Response(JSON.stringify({ error: "Offline - No cached data available" }), { 
      status: 503, 
      headers: { "Content-Type": "application/json" } 
    });
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Asset not found offline", { status: 404 });
  }
}

// --- Background Sync Logic for Audit Logs ---

async function openDB() {
  return new Promise((resolve, reject) => {
    // Version 3 matches your current IndexedDB setup
    const request = indexedDB.open("myuzima", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

const promisify = (request) => new Promise((res, rej) => {
  request.onsuccess = () => res(request.result);
  request.onerror = () => rej(request.error);
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

// Message listener for manual sync triggers from the UI
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SYNC_AUDIT_LOGS") {
    event.waitUntil(syncAuditLogs());
  }
});

async function syncAuditLogs() {
  let db;
  try {
    db = await openDB();
    const tx = db.transaction(["auditLogs", "metadata"], "readonly");
    const logStore = tx.objectStore("auditLogs");
    const metaStore = tx.objectStore("metadata");

    const allLogs = await promisify(logStore.getAll());
    const unsyncedLogs = allLogs.filter(log => !log.synced);

    if (unsyncedLogs.length === 0) return;

    const formattedLogs = unsyncedLogs.map(log => ({
      patientId: log.patientId,
      accessType: log.accessMethod || "OFFLINE_CACHE",
      timestamp: log.timestamp || new Date().toISOString()
    }));

    const response = await fetch("/api/emergency/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include', // Ensures the HttpOnly JWT is sent
      body: JSON.stringify({ logs: formattedLogs })
    });

    if (response.ok) {
      const deleteTx = db.transaction("auditLogs", "readwrite");
      const deleteStore = deleteTx.objectStore("auditLogs");
      for (const log of unsyncedLogs) {
        deleteStore.delete(log.id);
      }
      console.log(`[SW] Successfully synced ${unsyncedLogs.length} logs.`);
    }
  } catch (err) {
    console.error("[SW] Sync Error:", err);
  } finally {
    if (db) db.close();
  }
}
