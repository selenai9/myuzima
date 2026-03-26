import { ShieldCheck, Loader2 } from "lucide-react";

export function SecureLoader() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50">
      <div className="relative flex flex-col items-center gap-6">
        {/* The Branding: A red shield icon for MyUZIMA */}
        <div className="relative">
          <ShieldCheck className="h-16 w-16 text-red-600" />
          {/* A spinning ring around the shield */}
          <Loader2 className="absolute -inset-2 h-20 w-20 animate-spin text-red-200" />
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            MyUZIMA Secure Access
          </h2>
          <p className="text-sm text-slate-500 animate-pulse">
            Verifying emergency credentials...
          </p>
        </div>
      </div>
      
      {/* Privacy Note at the bottom */}
      <div className="absolute bottom-8 text-[10px] uppercase tracking-widest text-slate-400">
        End-to-End Encrypted Session
      </div>
    </div>
  );
}
