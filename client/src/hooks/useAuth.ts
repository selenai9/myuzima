import { useState, useEffect, useCallback } from "react";

interface AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  setAuthenticated: (val: boolean) => void;
}

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    
    async function checkAuth() {
      try {
        const response = await fetch("/api/auth/me");
        if (!cancelled) {
          if (response.ok) {
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkAuth();
    
    return () => {
      cancelled = true;
    };
  }, []);

  const setAuthenticated = useCallback((val: boolean) => {
    setIsAuthenticated(val);
  }, []);

  return { loading, isAuthenticated, setAuthenticated };
}
