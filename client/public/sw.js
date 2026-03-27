// MyUZIMA Service Worker - v1.0.6
const CACHE_NAME = "myuzima-v1.0.6";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

// Only cache the bare essentials; let the 'fetch' event cache the rest dynamically
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
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

  if (url.origin !== location.origin) return;

  // 1. API Strategy (Network First)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // 2. SPA Navigation (Serve index.html)
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  // 3. Hashed Assets (Cache First) - Vite assets contain hashes, they never change!
  if (request.method === "GET" && url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // 4. Other Statics
  if (request.method === "GET" && url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|jpeg|webp)$/i)) {
    event.respondWith(cacheFirstStrategy(request));
  }
});

// --- Strategies ---

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    // Only cache successful GET requests to the API
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "Offline" }), { 
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
    return new Response("Not Found", { status: 404 });
  }
}

// --- Background Sync Logic ---

const promisify = (request) => new Promise((res, rej) => {
  request.onsuccess = () => res(request.result);
  request.onerror = () => rej(request.error);
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myuzima", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    // (onupgradeneeded is handled in idb.ts, but kept here for SW isolation)
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

self.addEventListener("message", (event) => {
  if (event.data.type === "SYNC_AUDIT_LOGS") {
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

    const tokenData = await promisify(metaStore.get("auth_token"));
    const allLogs = await promisify(logStore.getAll());
    const unsyncedLogs = allLogs.filter(log => !log.synced);

    if (unsyncedLogs.length === 0) return;

    const formattedLogs = unsyncedLogs.map(log => ({
      patientId: log.patientId,
      accessType: log.accessMethod || "OFFLINE_CACHE", // Mapping to Backend Schema
      timestamp: log.timestamp || new Date().toISOString()
    }));

    const response = await fetch("/api/emergency/audit/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tokenData?.value && { "Authorization": `Bearer ${tokenData.value}` })
      },
      credentials: 'include',
      body: JSON.stringify({ logs: formattedLogs })
    });

    if (response.ok) {
      const deleteTx = db.transaction("auditLogs", "readwrite");
      const deleteStore = deleteTx.objectStore("auditLogs");
      for (const log of unsyncedLogs) {
        deleteStore.delete(log.id);
      }
    }
  } catch (err) {
    console.error("[SW] Sync Error:", err);
  } finally {
    if (db) db.close();
  }
}
