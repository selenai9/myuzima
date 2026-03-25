import { openDB, DBSchema, IDBPDatabase } from "idb";

interface EmergencyProfileDB extends DBSchema {
  profiles: {
    key: string;
    value: {
      id: string;
      patientId: string;
      bloodType: string;
      allergies: any[];
      medications: any[];
      conditions: string[];
      contacts: any[];
      lastScanned: Date;
    };
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
}

let db: IDBPDatabase<EmergencyProfileDB> | null = null;

/**
 * Initialize IndexedDB
 */
export async function initDB() {
  if (db) return db;

  db = await openDB<EmergencyProfileDB>("myuzima", 1, {
    upgrade(database: IDBPDatabase<EmergencyProfileDB>) {
      // Create profiles store
      if (!database.objectStoreNames.contains("profiles")) {
        database.createObjectStore("profiles", { keyPath: "id" });
      }

      // Create audit logs store
      if (!database.objectStoreNames.contains("auditLogs")) {
        database.createObjectStore("auditLogs", { keyPath: "id" });
      }
    },
  });

  return db;
}

/**
 * Save profile to IndexedDB cache
 */
export async function cacheProfile(profile: any) {
  const database = await initDB();

  // Get all profiles to check count
  const allProfiles = await database.getAll("profiles");

  // If we have 50+ profiles, remove oldest one (LRU eviction)
  if (allProfiles.length >= 50) {
    const oldest = allProfiles.reduce((prev: any, current: any) =>
      new Date(prev.lastScanned) < new Date(current.lastScanned) ? prev : current
    );
    await database.delete("profiles", oldest.id);
  }

  // Save profile
  await database.put("profiles", {
    ...profile,
    lastScanned: new Date(),
  });
}

/**
 * Get profile from cache
 */
export async function getCachedProfile(profileId: string) {
  const database = await initDB();
  return await database.get("profiles", profileId);
}

/**
 * Get all cached profiles
 */
export async function getAllCachedProfiles() {
  const database = await initDB();
  return await database.getAll("profiles");
}

/**
 * Clear profile cache
 */
export async function clearProfileCache() {
  const database = await initDB();
  await database.clear("profiles");
}

/**
 * Queue audit log for sync
 */
export async function queueAuditLog(auditLog: any) {
  const database = await initDB();
  await database.put("auditLogs", {
    ...auditLog,
    synced: false,
  });
}

/**
 * Get unsynced audit logs
 */
export async function getUnsyncedAuditLogs() {
  const database = await initDB();
  const allLogs = await database.getAll("auditLogs");
  return allLogs.filter((log) => !log.synced);
}

/**
 * Mark audit log as synced
 */
export async function markAuditLogSynced(auditLogId: string) {
  const database = await initDB();
  const log = await database.get("auditLogs", auditLogId);
  if (log) {
    (log as any).synced = true;
    await database.put("auditLogs", log);
  }
}

/**
 * Clear audit logs
 */
export async function clearAuditLogs() {
  const database = await initDB();
  await database.clear("auditLogs");
}

/**
 * Check if online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Listen for online/offline changes
 */
export function onOnlineStatusChange(callback: (online: boolean) => void) {
  const onlineHandler = () => callback(true);
  const offlineHandler = () => callback(false);

  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);

  // Return unsubscribe function
  return () => {
    window.removeEventListener("online", onlineHandler);
    window.removeEventListener("offline", offlineHandler);
  };
}
