// MyUZIMA Service Worker - v1.0.6
// Finalized: Schema Alignment & Authenticated Batch Audit Sync

const CACHE_NAME = "myuzima-v1.0.6";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

// NOTE: In production (Vite build), these paths usually live in /assets/
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
];

// --- Install & Activate ---
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
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- Fetch Event (Traffic Controller) ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) return;

  // API Requests: Network First, then Cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Navigation Requests: Always serve index.html (SPA support)
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  // Static Assets: Cache First
  if (request.method === "GET" && url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|jpeg|webp)$/i)) {
    event.respondWith(cacheFirstStrategy(request));
  }
});

// --- Strategies ---
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "Offline - Data Unreachable" }), { 
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
    return new Response("Asset Unavailable", { status: 404 });
  }
}

// --- Background Sync & IndexedDB ---

/**
 * Helper to wrap IDB requests in Promises
 */
const promisify = (request) => new Promise((res, rej) => {
  request.onsuccess = () => res(request.result);
  request.onerror = () => rej(request.error);
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myuzima", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("profiles")) {
        const store = db.createObjectStore("profiles", { keyPath: "id" });
        store.createIndex("by-token", "qrToken");
      }
      if (!db.objectStoreNames.contains("auditLogs")) {
        db.createObjectStore("auditLogs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    };
  });
}

/**
 * Background Sync Listener
 */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

/**
 * Message Listener (Manual Sync)
 */
self.addEventListener("message", (event) => {
  if (event.data.type === "SYNC_AUDIT_LOGS") {
    event.waitUntil(
      syncAuditLogs().then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      }).catch((err) => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: false, error: err.message });
        }
      })
    );
  }
});

/**
 * Authenticated Batch Sync Logic
 */
async function syncAuditLogs() {
  let db;
  try {
    db = await openDB();
    const tx = db.transaction(["auditLogs", "metadata"], "readonly");
    const logStore = tx.objectStore("auditLogs");
    const metaStore = tx.objectStore("metadata");

    // 1. Get Auth Token (Bearer fallback)
    const tokenData = await promisify(metaStore.get("auth_token"));
    
    // 2. Get All Logs and filter unsynced
    const allLogs = await promisify(logStore.getAll());
    const unsyncedLogs = allLogs.filter(log => !log.synced);

    if (unsyncedLogs.length === 0) return;

    // 3. Format logs to match Backend Zod Schema (emergency.ts)
    const formattedLogs = unsyncedLogs.map(log => ({
      patientId: log.patientId,
      accessType: log.accessMethod || "OFFLINE_CACHE", // Syncing key naming
      timestamp: log.timestamp || new Date().toISOString()
    }));

    // 4. POST to the Batch Route
    const response = await fetch("/api/emergency/audit/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tokenData?.value && { "Authorization": `Bearer ${tokenData.value}` })
      },
      credentials: 'include', // Ensures HttpOnly cookies are sent
      body: JSON.stringify({ logs: formattedLogs })
    });

    if (response.ok) {
      // 5. Clean up IDB on success
      const deleteTx = db.transaction("auditLogs", "readwrite");
      const deleteStore = deleteTx.objectStore("auditLogs");
      
      for (const log of unsyncedLogs) {
        // Delete to save space once confirmed on server
        deleteStore.delete(log.id);
      }
      console.log(`[SW] Successfully synced ${unsyncedLogs.length} logs.`);
    } else {
      console.error(`[SW] Sync failed with status: ${response.status}`);
    }
  } catch (err) {
    console.error("[SW] Background sync error:", err);
  } finally {
    if (db) db.close();
  }
}
