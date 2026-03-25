import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOnline: boolean;
  isPending: boolean;
  error: string | null;
}

/**
 * Hook to manage service worker registration and background sync
 */
export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: "serviceWorker" in navigator,
    isRegistered: false,
    isOnline: navigator.onLine,
    isPending: false,
    error: null,
  });

  useEffect(() => {
    if (!state.isSupported) {
      console.warn("[SW] Service Workers not supported");
      return;
    }

    registerServiceWorker();
    setupOnlineOfflineListeners();
    setupBackgroundSync();
  }, [state.isSupported]);

  const registerServiceWorker = async () => {
    try {
      setState((prev) => ({ ...prev, isPending: true, error: null }));

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      console.log("[SW] Service worker registered successfully", registration);
      setState((prev) => ({ ...prev, isRegistered: true, isPending: false }));

      // Check for updates periodically
      setInterval(() => {
        registration.update().catch((error) => {
          console.error("[SW] Error checking for updates:", error);
        });
      }, 60000); // Check every minute

      // Handle waiting service worker (new version available)
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New service worker available
            console.log("[SW] New version available");
            toast.info("New version available. Refresh to update.", {
              action: {
                label: "Refresh",
                onClick: () => window.location.reload(),
              },
              duration: 0,
            });

            // Notify service worker to skip waiting
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      // Handle controller change (new service worker activated)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("[SW] Service worker controller changed");
        window.location.reload();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[SW] Registration failed:", error);
      setState((prev) => ({
        ...prev,
        isRegistered: false,
        isPending: false,
        error: message,
      }));
    }
  };

  const setupOnlineOfflineListeners = () => {
    const handleOnline = () => {
      console.log("[SW] Online");
      setState((prev) => ({ ...prev, isOnline: true }));
      toast.success("Back online");

      // Trigger background sync when coming back online
      triggerBackgroundSync();
    };

    const handleOffline = () => {
      console.log("[SW] Offline");
      setState((prev) => ({ ...prev, isOnline: false }));
      toast.error("You are offline. Changes will sync when back online.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  };

  const setupBackgroundSync = () => {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) {
      console.warn("[SW] Background Sync not supported");
      return;
    }

    // Register background sync for audit logs
    navigator.serviceWorker.ready.then((registration) => {
      (registration as any).sync.register("sync-audit-logs").catch((error: Error) => {
        console.error("[SW] Failed to register background sync:", error);
      });
    });
  };

  const triggerBackgroundSync = async () => {
    if (!("serviceWorker" in navigator) || !("SyncManager" in window)) {
      console.warn("[SW] Background Sync not supported");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register("sync-audit-logs");
      console.log("[SW] Background sync triggered");
      toast.info("Syncing offline changes...");
    } catch (error) {
      console.error("[SW] Failed to trigger background sync:", error);
    }
  };

  const manualSync = async () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      toast.error("Service worker not available");
      return;
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        if (event.data.success) {
          toast.success("Audit logs synced successfully");
          resolve(true);
        } else {
          toast.error(event.data.error || "Sync failed");
          reject(new Error(event.data.error));
        }
      };

      controller.postMessage(
        { type: "SYNC_AUDIT_LOGS" },
        [channel.port2]
      );
    });
  };

  return {
    ...state,
    triggerBackgroundSync,
    manualSync,
  };
}

/**
 * Hook to request notification permission for push alerts
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    Notification.permission
  );

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      console.warn("Notifications not supported");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  };

  return { permission, requestPermission };
}

/**
 * Hook to subscribe to push notifications
 */
export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);

  const subscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("Push notifications not supported");
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY,
      });

      console.log("[SW] Push subscription created:", subscription);
      setIsSubscribed(true);

      // Send subscription to server
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      return true;
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      return false;
    }
  };

  const unsubscribe = async () => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
        return true;
      }
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
    }

    return false;
  };

  return { isSubscribed, subscribe, unsubscribe };
}
