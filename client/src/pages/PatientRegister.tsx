import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Phone,
  KeyRound,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useAuthContext } from "../App";

export default function PatientRegister() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { setAuthenticated } = useAuthContext();
  const [step, setStep] = useState<"phone" | "otp" | "consent">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
        throw new Error(t("errors.invalid_phone"));
      }

      await apiClient.patientRegister(phone);
      toast.success(t("common.success"));
      setStep("otp");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!/^\d{6}$/.test(otp)) {
        throw new Error(t("errors.invalid_otp"));
      }

      await apiClient.patientVerifyOTP(phone, otp);
      setStep("consent");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConsentSubmit = async () => {
    if (!consentGiven) {
      setError(t("patient.consent_text"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiClient.recordConsent();
      setAuthenticated(true);
      toast.success(t("common.success"));
      setLocation("/patient/profile");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Step indicator config
  const steps = [
    { key: "phone", label: "Phone", icon: Phone },
    { key: "otp", label: "Verify", icon: KeyRound },
    { key: "consent", label: "Consent", icon: ShieldCheck },
  ];
  const currentStepIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-[var(--color-healthcare-bg)] flex flex-col">
      {/* ── Top Navigation ────────────────────── */}
      <div className="border-b border-border/50 bg-white/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 flex items-center h-14 gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-healthcare-teal-light)] text-[var(--color-healthcare-muted)] hover:text-[var(--color-healthcare-deep)] transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-healthcare-teal)]" />
            <span className="text-sm font-semibold text-[var(--color-healthcare-text)]">
              {t("patient.register")}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md page-enter">
          {/* ── Step Indicator ────────────────── */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = idx === currentStepIdx;
              const isCompleted = idx < currentStepIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div
                    className={`
                      flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300
                      ${
                        isActive
                          ? "bg-[var(--color-healthcare-teal)] text-white shadow-md shadow-[var(--color-healthcare-teal)]/25"
                          : isCompleted
                          ? "bg-[var(--color-healthcare-success)] text-white"
                          : "bg-[var(--color-healthcare-bg)] text-[var(--color-healthcare-muted)] border border-border"
                      }
                    `}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-8 rounded-full transition-all duration-300 ${
                        isCompleted ? "bg-[var(--color-healthcare-success)]" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <Card className="healthcare-card border-0 overflow-hidden shadow-xl shadow-teal-900/5">
            {/* Card Header */}
            <CardHeader className="bg-gradient-to-r from-[var(--color-healthcare-teal)] to-[var(--color-healthcare-deep)] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  {step === "phone" && <Phone className="h-5 w-5 text-white" />}
                  {step === "otp" && <KeyRound className="h-5 w-5 text-white" />}
                  {step === "consent" && <ShieldCheck className="h-5 w-5 text-white" />}
                </div>
                <div>
                  <CardTitle className="text-white text-base font-semibold">
                    {step === "phone" && t("patient.register")}
                    {step === "otp" && "Verify Your Phone"}
                    {step === "consent" && "Data Consent"}
                  </CardTitle>
                  <CardDescription className="text-white/70 text-xs">
                    {t("app_subtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {error && (
                <Alert variant="destructive" className="mb-4 rounded-xl border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {/* ═══ Step 1: Phone ═══ */}
              {step === "phone" && (
                <form onSubmit={handlePhoneSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-2">
                      {t("patient.phone")}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-healthcare-muted)]" />
                      <input
                        type="tel"
                        placeholder="+250 7XX XXX XXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={loading}
                        required
                        className="healthcare-input pl-11"
                      />
                    </div>
                    <p className="text-xs text-[var(--color-healthcare-muted)] mt-2">
                      We'll send an OTP to verify your phone number
                    </p>
                  </div>
                  <button type="submit" className="btn-healthcare w-full py-3" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("common.loading")}
                      </>
                    ) : (
                      t("patient.verify")
                    )}
                  </button>
                </form>
              )}

              {/* ═══ Step 2: OTP ═══ */}
              {step === "otp" && (
                <form onSubmit={handleOtpSubmit} className="space-y-5">
                  <div className="rounded-xl bg-[var(--color-healthcare-teal-light)] p-4 border border-[var(--color-healthcare-teal)]/20">
                    <p className="text-sm text-[var(--color-healthcare-deep)]">
                      OTP sent to <strong className="font-semibold">{phone}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-2">
                      {t("patient.otp")}
                    </label>
                    <input
                      type="text"
                      placeholder="• • • • • •"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                      disabled={loading}
                      required
                      className="healthcare-input text-center text-2xl tracking-[0.5em] font-bold"
                    />
                  </div>
                  <button type="submit" className="btn-healthcare w-full py-3" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("common.loading")}
                      </>
                    ) : (
                      t("patient.verify")
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-[var(--color-healthcare-muted)] hover:bg-[var(--color-healthcare-bg)] transition-all duration-200"
                  >
                    {t("common.back")}
                  </button>
                </form>
              )}

              {/* ═══ Step 3: Consent ═══ */}
              {step === "consent" && (
                <div className="space-y-5">
                  <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-emerald-900">{t("common.success")}</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {phone} {t("common.verified")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-5 border border-amber-200">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="h-4 w-4 text-amber-700" />
                      <p className="text-sm font-semibold text-amber-900">
                        {t("patient.consent")}
                      </p>
                    </div>
                    <p className="text-sm text-amber-800 leading-relaxed mb-4">
                      {t("patient.consent_text")}
                    </p>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={consentGiven}
                          onChange={(e) => setConsentGiven(e.target.checked)}
                          className="peer sr-only"
                          disabled={loading}
                        />
                        <div className="h-5 w-5 rounded-md border-2 border-amber-300 bg-white peer-checked:bg-[var(--color-healthcare-teal)] peer-checked:border-[var(--color-healthcare-teal)] transition-all duration-200 flex items-center justify-center">
                          <svg
                            className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-amber-900 group-hover:text-amber-800">
                        {t("patient.consent")}
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={handleConsentSubmit}
                    className="btn-healthcare w-full py-3"
                    disabled={!consentGiven || loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("common.loading")}
                      </>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        {t("common.next")}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-[var(--color-healthcare-muted)] mt-6 uppercase tracking-widest font-medium">
            End-to-End Encrypted • AES-256-GCM
          </p>
        </div>
      </div>
    </div>
  );
}
