import { useEffect, useState } from "react";
import { 
  getUnsyncedAuditLogs, 
  markAuditLogSynced, 
  isOnline, 
  onOnlineStatusChange 
} from "@/lib/idb";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export function useSync() {
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(isOnline());

  /**
   * The Sync Engine
   * Finds all logs marked as 'synced: false' and pushes them to the server
   */
  const performSync = async () => {
    if (syncing) return; // Prevent double-syncing if already in progress

    try {
      const unsyncedLogs = await getUnsyncedAuditLogs();

      if (unsyncedLogs.length > 0) {
        setSyncing(true);
        console.log(`[Sync] Attempting to upload ${unsyncedLogs.length} offline logs...`);

        // Call the new API route we just built
        await apiClient.syncOfflineAuditLogs(unsyncedLogs);

        // If successful, mark them all as synced in local IndexedDB
        for (const log of unsyncedLogs) {
          await markAuditLogSynced(log.id);
        }

        toast.success(`Synced ${unsyncedLogs.length} emergency logs to server.`);
      }
    } catch (error) {
      console.error("[Sync] Background sync failed:", error);
      // We don't toast an error here to avoid annoying the user during bad signal
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Effect: Listen for network changes
   */
  useEffect(() => {
    const unsubscribe = onOnlineStatusChange((status) => {
      setOnline(status);
      if (status) {
        // If we just came back online, trigger the sync immediately!
        performSync();
      }
    });

    // Also attempt a sync on initial app load if we are online
    if (online) {
      performSync();
    }

    return () => unsubscribe();
  }, [online]);

  return { online, syncing, performSync };
}
