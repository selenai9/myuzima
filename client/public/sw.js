// This is the Service Worker script. It serves as the middleman between the app and the internet. Even if the responder is in a remote area with low or no internet, the app still works.
// To force a cache refresh, please update the version number below.
const CACHE_NAME = "myuzima-v1";
const RUNTIME_CACHE = "myuzima-runtime-v1";
const API_CACHE = "myuzima-api-v1";

// URLs to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE && name !== API_CACHE)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network-first strategy with fallback to cache
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    return event.respondWith(networkFirstStrategy(request));
  }

  // Static assets - cache-first with network fallback
  if (
    request.method === "GET" &&
    (url.pathname.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp)$/i) ||
      url.pathname === "/" ||
      url.pathname === "/index.html")
  ) {
    return event.respondWith(cacheFirstStrategy(request));
  }

  // Default - network-first
  return event.respondWith(networkFirstStrategy(request));
});

/**
 * Network-first strategy: try network, fall back to cache
 */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log("[SW] Network request failed, trying cache:", request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Return offline page for navigation requests
    if (request.mode === "navigate") {
      return caches.match("/index.html");
    }

    return new Response("Offline - Resource not available", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

/**
 * Cache-first strategy: try cache, fall back to network
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log("[SW] Cache miss and network unavailable:", request.url);
    return new Response("Offline - Resource not available", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

/**
 * Background Sync - Sync queued audit logs when back online
 */
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync event:", event.tag);

  if (event.tag === "sync-audit-logs") {
    event.waitUntil(syncAuditLogs());
  }
});

/**
 * Sync queued audit logs from IndexedDB
 */
async function syncAuditLogs() {
  try {
    console.log("[SW] Starting audit log sync");

    // Open IndexedDB
    const db = await openDB();
    const tx = db.transaction("auditLogQueue", "readonly");
    const store = tx.objectStore("auditLogQueue");
    const queuedLogs = await store.getAll();

    console.log(`[SW] Found ${queuedLogs.length} queued audit logs`);

    if (queuedLogs.length === 0) {
      return;
    }

    // Try to sync each log
    const writeTx = db.transaction("auditLogQueue", "readwrite");
    const writeStore = writeTx.objectStore("auditLogQueue");

    for (const log of queuedLogs) {
      try {
        const response = await fetch("/api/audit/log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getStoredToken()}`,
          },
          body: JSON.stringify(log),
        });

        if (response.ok) {
          // Remove from queue on success
          await writeStore.delete(log.id);
          console.log("[SW] Synced audit log:", log.id);
        } else {
          console.error("[SW] Failed to sync audit log:", response.status);
        }
      } catch (error) {
        console.error("[SW] Error syncing audit log:", error);
      }
    }

    await writeTx.done;
    console.log("[SW] Audit log sync complete");
  } catch (error) {
    console.error("[SW] Error during audit log sync:", error);
    throw error;
  }
}

/**
 * Helper: Open IndexedDB
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myuzima", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("auditLogQueue")) {
        db.createObjectStore("auditLogQueue", { keyPath: "id" });
      }
    };
  });
}

/**
 * Helper: Get stored JWT token
 */
async function getStoredToken() {
  return new Promise((resolve) => {
    const request = indexedDB.open("myuzima", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("metadata", "readonly");
      const store = tx.objectStore("metadata");
      const tokenRequest = store.get("token");

      tokenRequest.onsuccess = () => {
        resolve(tokenRequest.result?.value || "");
      };
    };
  });
}

/**
 * Message handler for client communication
 */
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data);

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "SYNC_AUDIT_LOGS") {
    syncAuditLogs().then(() => {
      event.ports[0].postMessage({ success: true });
    }).catch((error) => {
      event.ports[0].postMessage({ success: false, error: error.message });
    });
  }
});

/**
 * Push notification handler for patient alerts
 */
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received");

  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || "Your emergency profile was accessed",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "myuzima-alert",
    requireInteraction: true,
    actions: [
      {
        action: "view",
        title: "View Details",
      },
      {
        action: "close",
        title: "Dismiss",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title || "MyUZIMA Alert", options));
});

/**
 * Notification click handler
 */
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action);

  event.notification.close();

  if (event.action === "view" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === "/" && "focus" in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      })
    );
  }
});
