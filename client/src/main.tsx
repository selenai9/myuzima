import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// Initialize the TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // For a medical app, we want to be careful about stale data, 
      // but also ensure it works when the network flickers.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Global logic to handle session expiration.
 * If any tRPC call returns an 'Unauthorized' error, 
 * we kick the user to the login page immediately.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

// Global error listeners for Queries
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

// Global error listeners for Mutations (POST/PUT/DELETE)
queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Configure tRPC Client with credentials for HttpOnly Cookie support
 */
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include", // Required for JWT-in-cookie authentication
        });
      },
    }),
  ],
});

// Mount the React Application
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

/**
 * PWA Service Worker Registration
 * Ensures medical profiles and assets are cached for offline availability.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[PWA] Service worker registered successfully");

        // Force an update check every 6 hours 
        // Important for ensuring responders have the latest security patches.
        setInterval(() => {
          registration.update();
        }, 6 * 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error("[PWA] Service worker registration failed:", error);
      });

    // Notify the app when a new version is ready to take over
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[PWA] New version detected, refreshing controller...");
    });
  });
}
