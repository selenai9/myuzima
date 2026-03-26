// MyUZIMA Service Worker - v1.0.5
// Added: Version 3 IDB Support & Authenticated Batch Audit Sync

const CACHE_NAME = "myuzima-v1.0.5";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/src/main.tsx", 
  "/src/App.tsx",
];

// --- Install & Activate (Standard PWA Lifecycle) ---
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
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    return event.respondWith(networkFirstStrategy(request));
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  if (request.method === "GET" && url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|jpeg|webp)$/i)) {
    return event.respondWith(cacheFirstStrategy(request));
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
    return cached || new Response("Offline - Medical Data Unreachable", { status: 503 });
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

// --- NEW: Authenticated Background Sync Logic ---

/**
 * Open IndexedDB (Must match Version 3 from idb.ts)
 */
function openDB() {
  return new Promise((resolve, reject) => {
    // UPDATED: Version 3 to match the high-speed index version
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

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

/**
 * Authenticated Batch Sync
 * 1. Grabs token from 'metadata'
 * 2. Grabs unsynced logs from 'auditLogs'
 * 3. Sends to /api/emergency/audit/log
 */
async function syncAuditLogs() {
  const db = await openDB();
  const tx = db.transaction(["auditLogs", "metadata"], "readwrite");
  const logStore = tx.objectStore("auditLogs");
  const metaStore = tx.objectStore("metadata");

  // 1. Get Auth Token
  const tokenRequest = metaStore.get("auth_token");
  const tokenData = await new Promise((res) => (tokenRequest.onsuccess = () => res(tokenRequest.result)));
  
  if (!tokenData || !tokenData.value) {
    console.warn("[SW] Sync aborted: No auth token found in IndexedDB");
    return;
  }

  // 2. Get Unsynced Logs
  const allLogsRequest = logStore.getAll();
  const allLogs = await new Promise((res) => (allLogsRequest.onsuccess = () => res(allLogsRequest.result)));
  const unsyncedLogs = allLogs.filter(log => !log.synced);

  if (unsyncedLogs.length === 0) return;

  try {
    // 3. POST to the Batch Route we created in emergency.ts
    const response = await fetch("/api/emergency/audit/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenData.value}`
      },
      body: JSON.stringify({ logs: unsyncedLogs })
    });

    if (response.ok) {
      // 4. Mark as synced in IDB
      const updateTx = db.transaction("auditLogs", "readwrite");
      const updateStore = updateTx.objectStore("auditLogs");
      
      for (const log of unsyncedLogs) {
        log.synced = true;
        updateStore.put(log);
      }
      console.log(`[SW] Successfully synced ${unsyncedLogs.length} logs`);
    }
  } catch (err) {
    console.error("[SW] Sync failed:", err);
  }
}
