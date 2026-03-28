import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, WifiOff, AlertCircle } from "lucide-react";

export function SecureLoader() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isTakingLong, setIsTakingLong] = useState(false);

  // App version for tracking updates
  const APP_VERSION = "v1.0.4-beta";

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // Timer to notify user if connection is lagging
    const timer = setTimeout(() => {
      setIsTakingLong(true);
    }, 5000);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--color-healthcare-bg)] p-6">
      <div className="relative flex flex-col items-center gap-8 page-enter">
        
        {/* ── Logo Section ────────────────────── */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-border/40 p-2">
            <img 
              src="/logo.svg" 
              alt="MyUZIMA Logo" 
              className="h-full w-full object-contain" 
            />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--color-healthcare-text)]">
            MyUZIMA
          </span>
        </div>

        {/* ── Status Icon ─────────────────────── */}
        <div className="relative">
          {isOffline ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200">
              <WifiOff className="h-10 w-10 text-amber-500 animate-pulse" />
            </div>
          ) : isTakingLong ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200">
              <AlertCircle className="h-10 w-10 text-amber-500" />
            </div>
          ) : (
            <div className="relative flex h-20 w-20 items-center justify-center">
              {/* Soft background pulse */}
              <div className="absolute inset-0 rounded-2xl bg-[var(--color-healthcare-teal)]/10 animate-pulse" />
              <ShieldCheck className="relative h-10 w-10 text-[var(--color-healthcare-teal)]" />
              {/* Outer spinning ring */}
              <Loader2 className="absolute -inset-3 h-[104px] w-[104px] animate-spin text-[var(--color-healthcare-teal)]/20" />
            </div>
          )}
        </div>

        {/* ── Status Text ─────────────────────── */}
        <div className="text-center max-w-xs">
          <h2 className="text-lg font-bold text-[var(--color-healthcare-text)] mb-1">
            {isOffline ? "Offline Mode" : "Secure Access"}
          </h2>
          <p className="text-sm text-[var(--color-healthcare-muted)] leading-relaxed">
            {isOffline
              ? "No internet connection. Accessing local emergency cache..."
              : isTakingLong
              ? "Connection is slow. Still verifying..."
              : "Verifying emergency credentials..."}
          </p>
        </div>

        {/* ── Visual Progress Bar ──────────────── */}
        {!isOffline && !isTakingLong && (
          <div className="w-48 h-1 rounded-full bg-[var(--color-healthcare-teal)]/10 overflow-hidden">
            <div 
              className="h-full bg-[var(--color-healthcare-teal)] rounded-full animate-pulse transition-all duration-700" 
              style={{ width: "65%" }} 
            />
          </div>
        )}

        {/* ── Action Button ───────────────────── */}
        {(isOffline || isTakingLong) && (
          <button
            onClick={() => window.location.reload()}
            className="btn-healthcare text-xs px-6 py-2.5"
          >
            Retry Connection
          </button>
        )}
      </div>

      {/* ── Footer Branding ─────────────────── */}
      <div className="absolute bottom-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isOffline ? "bg-amber-400" : "bg-[var(--color-healthcare-teal)]"}`} />
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-healthcare-muted)] font-semibold">
            {isOffline ? "Secure Offline Session" : "End-to-End Encrypted Session"}
          </span>
        </div>
        <span className="text-[9px] font-mono text-[var(--color-healthcare-muted)]/60 bg-white/50 px-3 py-1 rounded-full border border-border/50">
          {APP_VERSION}
        </span>
      </div>
    </div>
  );
}
