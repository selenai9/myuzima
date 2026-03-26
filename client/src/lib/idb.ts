import { openDB, DBSchema, IDBPDatabase } from "idb";

interface EmergencyProfileDB extends DBSchema {
  profiles: {
    key: string;
    value: {
      id: string;
      qrToken: string;
      patientId: string;
      bloodType: string;
      allergies: any[];
      medications: any[];
      conditions: string[];
      contacts: any[];
      lastScanned: Date;
    };
    indexes: { "by-token": string }; 
  };
  auditLogs: {
    key: string;
    value: {
      id: string;
      responderId: string;
      patientId: string;
      timestamp: Date;
      accessMethod: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
      deviceIp: string;
      synced: boolean;
    };
  };
  metadata: {
    key: string;
    value: { key: string; value: any };
  };
}

let db: IDBPDatabase<EmergencyProfileDB> | null = null;

export async function initDB() {
  if (db) return db;

  // Version 3 ensures all stores and indexes are created
  db = await openDB<EmergencyProfileDB>("myuzima", 3, {
    upgrade(database: IDBPDatabase<EmergencyProfileDB>) {
      // 1. Profiles Store with Index
      if (!database.objectStoreNames.contains("profiles")) {
        const profileStore = database.createObjectStore("profiles", { keyPath: "id" });
        profileStore.createIndex("by-token", "qrToken");
      }

      // 2. Audit Logs Store
      if (!database.objectStoreNames.contains("auditLogs")) {
        database.createObjectStore("auditLogs", { keyPath: "id" });
      }

      // 3. Metadata Store (Shared with Service Worker)
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    },
  });
  return db;
}

// --- AUTH HELPERS (Shared with Service Worker) ---

/**
 * Stores a session indicator (e.g., "cookie-session-active") 
 * to let the Service Worker know it should attempt authenticated requests.
 */
export async function storeAuthToken(token: string) {
  const database = await initDB();
  await database.put("metadata", { key: "auth_token", value: token });
}

/**
 * Retrieves the session indicator.
 */
export async function getAuthToken(): Promise<string | null> {
  const database = await initDB();
  const entry = await database.get("metadata", "auth_token");
  return entry?.value ?? null;
}

/**
 * NEW: Explicitly removes the session indicator from IDB.
 * Used during logout or when a 401 refresh fails.
 */
export async function clearAuthToken() {
  const database = await initDB();
  await database.delete("metadata", "auth_token");
}

/**
 * NEW: Security utility to wipe the medical cache.
 * Vital for shared devices to ensure one patient's data 
 * isn't left in the browser for the next person.
 */
export async function clearProfileCache() {
  const database = await initDB();
  const tx = database.transaction("profiles", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// --- PROFILE CACHE (LRU Logic) ---
export async function cacheProfile(profile: any) {
  const database = await initDB();
  const allProfiles = await database.getAll("profiles");

  if (allProfiles.length >= 50) {
    const oldest = allProfiles.reduce((prev: any, current: any) =>
      new Date(prev.lastScanned) < new Date(current.lastScanned) ? prev : current
    );
    await database.delete("profiles", oldest.id);
  }

  await database.put("profiles", {
    ...profile,
    lastScanned: new Date(),
  });
}

/**
 * High-speed offline lookup for QR Scans
 */
export async function getProfileByToken(qrToken: string) {
  const database = await initDB();
  return await database.getFromIndex("profiles", "by-token", qrToken);
}

// --- AUDIT LOG QUEUEING ---
export async function queueAuditLog(auditLog: any) {
  const database = await initDB();
  await database.put("auditLogs", {
    ...auditLog,
    synced: false,
  });
}

export async function getUnsyncedAuditLogs() {
  const database = await initDB();
  const allLogs = await database.getAll("auditLogs");
  return allLogs.filter((log) => !log.synced);
}

export async function markAuditLogSynced(auditLogId: string) {
  const database = await initDB();
  const log = await database.get("auditLogs", auditLogId);
  if (log) {
    log.synced = true;
    await database.put("auditLogs", log);
  }
}

// --- UTILS ---
export function isOnline() {
  return navigator.onLine;
}
