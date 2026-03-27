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
      lastScanned: string; 
    };
    indexes: { "by-token": string }; 
  };
  auditLogs: {
    key: string;
    value: {
      id: string;
      patientId: string;
      timestamp: string; 
      accessMethod: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
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

  db = await openDB<EmergencyProfileDB>("myuzima", 3, {
    upgrade(database: IDBPDatabase<EmergencyProfileDB>) {
      if (!database.objectStoreNames.contains("profiles")) {
        const profileStore = database.createObjectStore("profiles", { keyPath: "id" });
        profileStore.createIndex("by-token", "qrToken");
      }
      if (!database.objectStoreNames.contains("auditLogs")) {
        database.createObjectStore("auditLogs", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    },
  });
  return db;
}

// --- AUTH HELPERS ---
export async function storeAuthToken(token: string) {
  const database = await initDB();
  await database.put("metadata", { key: "auth_token", value: token });
}

export async function getAuthToken(): Promise<string | null> {
  const database = await initDB();
  const entry = await database.get("metadata", "auth_token");
  return entry?.value ?? null;
}

export async function clearAuthToken() {
  const database = await initDB();
  await database.delete("metadata", "auth_token");
}

/**
 * Security utility to wipe the medical cache.
 */
export async function clearProfileCache() {
  const database = await initDB();
  const tx = database.transaction("profiles", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// --- PROFILE CACHE ---
export async function cacheProfile(profile: any) {
  const database = await initDB();
  const allProfiles = await database.getAll("profiles");

  if (allProfiles.length >= 50) {
    const oldest = allProfiles.sort((a, b) => 
      new Date(a.lastScanned).getTime() - new Date(b.lastScanned).getTime()
    )[0];
    await database.delete("profiles", oldest.id);
  }

  await database.put("profiles", {
    ...profile,
    lastScanned: new Date().toISOString(),
  });
}

export async function getProfileByToken(qrToken: string) {
  const database = await initDB();
  return await database.getFromIndex("profiles", "by-token", qrToken);
}

// --- AUDIT LOG QUEUEING ---
export async function queueAuditLog(patientId: string, method: "QR_SCAN" | "OFFLINE_CACHE") {
  const database = await initDB();
  await database.put("auditLogs", {
    id: crypto.randomUUID(),
    patientId: patientId,
    accessMethod: method,
    timestamp: new Date().toISOString(),
    synced: false,
  });
}

export async function clearSyncedLogs() {
  const database = await initDB();
  const allLogs = await database.getAll("auditLogs");
  const syncedIds = allLogs.filter(log => log.synced).map(log => log.id);
  
  const tx = database.transaction("auditLogs", "readwrite");
  for (const id of syncedIds) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export function isOnline() {
  return navigator.onLine;
}
