import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, ArrowLeft, Activity } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--color-healthcare-bg)] p-4">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-[var(--color-healthcare-teal)]/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-[var(--color-healthcare-accent)]/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md healthcare-card border-0 overflow-hidden page-enter">
        <CardContent className="p-8 sm:p-10 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-healthcare-accent)]/10">
                <AlertCircle className="h-10 w-10 text-[var(--color-healthcare-accent)]" />
              </div>
              {/* Decorative pulse */}
              <div className="absolute -inset-2 rounded-3xl bg-[var(--color-healthcare-accent)]/5 animate-pulse -z-10" />
            </div>
          </div>

          {/* Error code */}
          <p className="text-6xl font-bold gradient-text mb-2">404</p>

          <h2 className="text-xl font-bold text-[var(--color-healthcare-text)] mb-3">
            Page Not Found
          </h2>

          <p className="text-sm text-[var(--color-healthcare-muted)] mb-8 leading-relaxed max-w-xs mx-auto">
            Sorry, the page you're looking for doesn't exist or may have been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleGoHome}
              className="btn-healthcare px-6 py-3"
            >
              <Home className="h-4 w-4" />
              Go Home
            </button>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-[var(--color-healthcare-muted)] hover:bg-[var(--color-healthcare-bg)] transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </button>
          </div>

          {/* Footer brand */}
          <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-border/50">
            <Activity className="h-3.5 w-3.5 text-[var(--color-healthcare-teal)]" />
            <span className="text-[10px] font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider">
              MyUZIMA Emergency System
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
