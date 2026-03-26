import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // 1. Set up the default settings (where to go if not logged in)
  const { 
    redirectOnUnauthenticated = false, 
    redirectPath = getLoginUrl() 
  } = options ?? {};
  
  const utils = trpc.useUtils();

  // 2. Ask the server: "Who is the current user?"
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false, // Don't keep trying if it fails once
    refetchOnWindowFocus: false, // Don't refresh just because the user clicked back onto the tab
  });

  // 3. Prepare the "Logout" action
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // If logout works, immediately wipe the user data from the app's memory
      utils.auth.me.setData(undefined, null);
    },
  });

  // 4. The actual Logout function you call from a button
  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      // If we get an "Unauthorized" error, it means they were already logged out, so we just ignore it
      if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
        return;
      }
      throw error;
    } finally {
      // Always make sure the app forgets the user and double-checks the status
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  // 5. Organise the information into a simple "Status Report"
  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  // 6. Save the user info to the computer's storage whenever it changes
  // This is the "proper" way to handle side effects like saving files
  useEffect(() => {
    if (meQuery.data) {
      localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data));
    }
  }, [meQuery.data]);

  // 7. The "Bouncer" logic: Redirect the user if they aren't allowed to be here
  useEffect(() => {
    // Stop if we don't want to redirect, or if we are still busy loading/logging out
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return; // Stop if the user is logged in
    if (typeof window === "undefined") return; // Stop if we aren't in a browser
    if (window.location.pathname === redirectPath) return; // Stop if we're already on the login page

    // If we got this far, send them to the login page
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  // 8. Return all the tools so the rest of the app can use them
  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
