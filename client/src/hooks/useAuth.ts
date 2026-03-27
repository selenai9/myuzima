import { useState, useEffect } from "react";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        // Updated from /api/auth/status to /api/auth/me
        const response = await fetch("/api/auth/me");
        
        if (response.ok) {
          const data = await response.json();
          // If data exists, the user is logged in
          setUser(data);
          setIsAuthenticated(!!data); 
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  return { user, isAuthenticated, loading };
}
