import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, WifiOff, AlertCircle } from "lucide-react";

export function SecureLoader() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isTakingLong, setIsTakingLong] = useState(false);

  // This version number can be updated manually as you push new code to GitHub
  const APP_VERSION = "v1.0.4-beta";

  useEffect(() => {
    // 1. Monitor real-time connection status
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    // 2. Start a "Slow Connection" timer (5 seconds)
    // In an emergency, we don't want the user staring at a spinner forever
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
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-6">
      <div className="relative flex flex-col items-center gap-6">
        
        {/* VISUAL ICON LOGIC */}
        <div className="relative">
          {isOffline ? (
            <div className="bg-orange-100 p-4 rounded-full">
              <WifiOff className="h-12 w-12 text-orange-600 animate-pulse" />
            </div>
          ) : isTakingLong ? (
            <div className="bg-yellow-100 p-4 rounded-full">
              <AlertCircle className="h-12 w-12 text-yellow-600" />
            </div>
          ) : (
            <>
              <ShieldCheck className="h-16 w-16 text-red-600" />
              <Loader2 className="absolute -inset-2 h-20 w-20 animate-spin text-red-200" />
            </>
          )}
        </div>

        {/* TEXT STATUS LOGIC */}
        <div className="text-center max-w-xs">
          <h2 className="text-lg font-semibold text-slate-900">
            {isOffline ? "Offline Mode" : "MyUZIMA Secure Access"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isOffline 
              ? "No internet connection. Accessing local emergency cache..." 
              : isTakingLong 
                ? "Connection is slow. Still trying to verify..." 
                : "Verifying emergency credentials..."}
          </p>
        </div>

        {/* RETRY BUTTON (Only shows if there's a problem) */}
        {(isOffline || isTakingLong) && (
          <button 
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-white border border-slate-200 rounded shadow-sm hover:bg-slate-50 transition-colors"
          >
            Retry Connection
          </button>
        )}
      </div>
      
      {/* FOOTER: Privacy Note + Version Number */}
      <div className="absolute bottom-8 flex flex-col items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium text-center">
          {isOffline ? "Secure Offline Session" : "End-to-End Encrypted Session"}
        </div>
        <div className="text-[9px] font-mono text-slate-300 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          {APP_VERSION}
        </div>
      </div>
    </div>
  );
}
