import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOnline: boolean;
  isPending: boolean;
  error: string | null;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: "serviceWorker" in navigator,
    isRegistered: false,
    isOnline: navigator.onLine,
    isPending: false,
    error: null,
  });

  // Use useCallback to prevent unnecessary re-renders in the effect
  const triggerBackgroundSync = useCallback(async () => {
    if (!state.isSupported || !("SyncManager" in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      // 'sync' is not yet in the standard TS ServiceWorkerRegistration type
      await (registration as any).sync.register("sync-audit-logs");
      console.log("[SW] Background sync registered/triggered");
    } catch (error) {
      console.error("[SW] Background sync failed:", error);
    }
  }, [state.isSupported]);

  useEffect(() => {
    if (!state.isSupported) return;

    const register = async () => {
      try {
        setState((s) => ({ ...s, isPending: true }));
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        setState((s) => ({ ...s, isRegistered: true, isPending: false }));

        // Handle updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              toast.info("Update available", {
                description: "Refresh to use the latest version.",
                action: { label: "Update", onClick: () => window.location.reload() },
                duration: Infinity,
              });
            }
          });
        });
      } catch (err) {
        setState((s) => ({ ...s, isPending: false, error: "Registration failed" }));
      }
    };

    register();

    // Online/Offline listeners
    const toggleOnline = () => {
      const online = navigator.onLine;
      setState((s) => ({ ...s, isOnline: online }));
      if (online) {
        toast.success("Back online. Syncing changes...");
        triggerBackgroundSync();
      } else {
        toast.error("Offline mode active. Accessing cached data.");
      }
    };

    window.addEventListener("online", toggleOnline);
    window.addEventListener("offline", toggleOnline);

    return () => {
      window.removeEventListener("online", toggleOnline);
      window.removeEventListener("offline", toggleOnline);
    };
  }, [state.isSupported, triggerBackgroundSync]);

  const manualSync = async () => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return toast.error("Service worker not active");

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (msg) => {
        if (msg.data.success) {
          toast.success("Audit logs synced");
          resolve(true);
        } else {
          toast.error("Sync failed");
          resolve(false);
        }
      };
      sw.postMessage({ type: "SYNC_AUDIT_LOGS" }, [channel.port2]);
    });
  };

  return { ...state, triggerBackgroundSync, manualSync };
}

// ... useNotificationPermission and usePushNotifications remain largely the same
