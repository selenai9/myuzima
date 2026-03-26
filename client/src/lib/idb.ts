import { openDB, DBSchema, IDBPDatabase } from "idb";

/**
 * Define the structure of our IndexedDB
 */
interface EmergencyProfileDB extends DBSchema {
  profiles: {
    key: string;
    value: {
      id: string;
      qrToken: string; // Added: Required for offline matching
      patientId: string;
      bloodType: string;
      allergies: any[];
      medications: any[];
      conditions: string[];
      contacts: any[];
      lastScanned: Date;
    };
    // We define an index so we can search by qrToken directly
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
}

let db: IDBPDatabase<EmergencyProfileDB> | null = null;

/**
 * Initialize IndexedDB with versioning and indexes
 */
export async function initDB() {
  if (db) return db;

  // We increment the version to 2 to trigger the 'upgrade' for the new index
  db = await openDB<EmergencyProfileDB>("myuzima", 2, {
    upgrade(database: IDBPDatabase<EmergencyProfileDB>, oldVersion) {
      // 1. Create or Update Profiles Store
      let profileStore;
      if (!database.objectStoreNames.contains("profiles")) {
        profileStore = database.createObjectStore("profiles", { keyPath: "id" });
      } else {
        profileStore = (database as any).transaction.objectStore("profiles");
      }

      // 2. Add the QR Token index if it doesn't exist
      // This allows: database.getFromIndex("profiles", "by-token", token)
      if (!profileStore.indexNames.contains("by-token")) {
        profileStore.createIndex("by-token", "qrToken");
      }

      // 3. Create Audit Logs Store
      if (!database.objectStoreNames.contains("auditLogs")) {
        database.createObjectStore("auditLogs", { keyPath: "id" });
      }
    },
  });

  return db;
}

/**
 * Save profile to cache with LRU (Least Recently Used) eviction
 * @param profile - The profile object including the qrToken
 */
export async function cacheProfile(profile: any) {
  const database = await initDB();

  // Get all profiles to check if we are over the 50-profile limit
  const allProfiles = await database.getAll("profiles");

  // If limit reached, remove the one that hasn't been scanned in the longest time
  if (allProfiles.length >= 50) {
    const oldest = allProfiles.reduce((prev: any, current: any) =>
      new Date(prev.lastScanned) < new Date(current.lastScanned) ? prev : current
    );
    await database.delete("profiles", oldest.id);
  }

  // Save the profile - the spread operator ensures qrToken is included
  await database.put("profiles", {
    ...profile,
    lastScanned: new Date(),
  });
}

/**
 * OPTIMIZED: Get profile from cache using the QR Token index
 * This is much faster than fetching all profiles and filtering in JS
 */
export async function getProfileByToken(qrToken: string) {
  const database = await initDB();
  return await database.getFromIndex("profiles", "by-token", qrToken);
}

/**
 * Get profile by its internal ID
 */
export async function getCachedProfile(profileId: string) {
  const database = await initDB();
  return await database.get("profiles", profileId);
}

/**
 * Get all cached profiles (useful for debug or bulk sync)
 */
export async function getAllCachedProfiles() {
  const database = await initDB();
  return await database.getAll("profiles");
}

/**
 * Clear profile cache (e.g., on responder logout)
 */
export async function clearProfileCache() {
  const database = await initDB();
  await database.clear("profiles");
}

/**
 * Queue audit log for sync when internet is restored
 */
export async function queueAuditLog(auditLog: any) {
  const database = await initDB();
  await database.put("auditLogs", {
    ...auditLog,
    synced: false,
  });
}

/**
 * Get all logs that haven't been sent to the server yet
 */
export async function getUnsyncedAuditLogs() {
  const database = await initDB();
  const allLogs = await database.getAll("auditLogs");
  return allLogs.filter((log) => !log.synced);
}

/**
 * Mark a local log as synced after successful API call
 */
export async function markAuditLogSynced(auditLogId: string) {
  const database = await initDB();
  const log = await database.get("auditLogs", auditLogId);
  if (log) {
    log.synced = true;
    await database.put("auditLogs", log);
  }
}

/**
 * Remove all audit logs from local storage
 */
export async function clearAuditLogs() {
  const database = await initDB();
  await database.clear("auditLogs");
}

/**
 * Simple check for browser's online status
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Event listener for network state changes
 */
export function onOnlineStatusChange(callback: (online: boolean) => void) {
  const onlineHandler = () => callback(true);
  const offlineHandler = () => callback(false);

  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);

  return () => {
    window.removeEventListener("online", onlineHandler);
    window.removeEventListener("offline", offlineHandler);
  };
}
