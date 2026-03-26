import { openDB, DBSchema, IDBPDatabase } from "idb";

/**
 * Define the structure of our IndexedDB
 */
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
  // NEW: Store for application settings and the Auth Token
  metadata: {
    key: string;
    value: any;
  };
}

let db: IDBPDatabase<EmergencyProfileDB> | null = null;

/**
 * Initialize IndexedDB with versioning and indexes
 */
export async function initDB() {
  if (db) return db;

  // Bumped version to 3 to trigger the creation of the metadata store
  db = await openDB<EmergencyProfileDB>("myuzima", 3, {
    upgrade(database: IDBPDatabase<EmergencyProfileDB>) {
      // 1. Profiles Store
      let profileStore;
      if (!database.objectStoreNames.contains("profiles")) {
        profileStore = database.createObjectStore("profiles", { keyPath: "id" });
      } else {
        profileStore = (database as any).transaction.objectStore("profiles");
      }

      if (!profileStore.indexNames.contains("by-token")) {
        profileStore.createIndex("by-token", "qrToken");
      }

      // 2. Audit Logs Store
      if (!database.objectStoreNames.contains("auditLogs")) {
        database.createObjectStore("auditLogs", { keyPath: "id" });
      }

      // 3. NEW: Metadata Store (for Auth Token)
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata");
      }
    },
  });

  return db;
}

/**
 * Save Auth Token to metadata store
 */
export async function storeAuthToken(token: string) {
  const database = await initDB();
  await database.put("metadata", token, "auth_token");
}

/**
 * Retrieve Auth Token from metadata store
 */
export async function getAuthToken() {
  const database = await initDB();
  return await database.get("metadata", "auth_token");
}

/**
 * Save profile to cache with LRU (Least Recently Used) eviction
 */
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
 * Get profile from cache using the QR Token index
 */
export async function getProfileByToken(qrToken: string) {
  const database = await initDB();
  return await database.getFromIndex("profiles", "by-token", qrToken);
}

export async function getCachedProfile(profileId: string) {
  const database = await initDB();
  return await database.get("profiles", profileId);
}

export async function getAllCachedProfiles() {
  const database = await initDB();
  return await database.getAll("profiles");
}

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

export async function clearAuditLogs() {
  const database = await initDB();
  await database.clear("auditLogs");
}

export function isOnline() {
  return navigator.onLine;
}

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
