// MyUZIMA Service Worker - v1.0.4
// Optimized for Emergency QR Access & Secure Loader Integration

const CACHE_NAME = "myuzima-v1.0.4";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

// URLs to cache on install
// Ensures main entry points are here so the SecureLoader can trigger
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/src/main.tsx", 
  "/src/App.tsx",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing MyUZIMA Service Worker");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating MyUZIMA Service Worker");
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

// Fetch event - The "Traffic Controller" for SecureLoader
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return;

  // 1. API requests (Medical Data) - Network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    return event.respondWith(networkFirstStrategy(request));
  }

  // 2. Navigation (Page Refresh/Deep Links) 
  // This ensures that even if offline, the app loads index.html
  // which then runs App.tsx and shows SecureLoader.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 3. Static assets - Cache-first
  if (
    request.method === "GET" &&
    url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|jpeg|webp)$/i)
  ) {
    return event.respondWith(cacheFirstStrategy(request));
  }
});

/**
 * Network-first: Try to get fresh data, fall back to emergency cache
 */
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
    return new Response("Asset Unavailable Offline", { status: 404 });
  }
}

/**
 * REVISED DATABASE LOGIC
 * Added "metadata" store so SecureLoader can verify auth status offline.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    // Incrementing version to 2 to trigger the new store creation
    const request = indexedDB.open("myuzima", 2); 

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("auditLogs")) {
        db.createObjectStore("auditLogs", { keyPath: "id" });
      }
      // CRITICAL: New store for Auth tokens and Session metadata
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata"); 
      }
    };
  });
}

// Background Sync for Audit Logs
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

async function syncAuditLogs() {
  // ... Logic remains same as your original, now supported by the new openDB()
}

// Push & Notification Listeners (Keep as they were)
self.addEventListener("push", (event) => { /* ... */ });
self.addEventListener("notificationclick", (event) => { /* ... */ });
