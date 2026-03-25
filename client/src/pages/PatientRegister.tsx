import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export default function PatientRegister() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
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
      // Validate phone format
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
      // Validate OTP format
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

    // Redirect to profile creation
    setLocation("/patient/profile");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <CardTitle>{t("patient.register")}</CardTitle>
          <CardDescription className="text-blue-100">{t("app_subtitle")}</CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "phone" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.phone")}</label>
                <Input
                  type="tel"
                  placeholder="+250 7XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("patient.verify")
                )}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-md mb-4">
                <p className="text-sm text-gray-600">
                  {t("common.success")} <strong>{phone}</strong>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.otp")}</label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  required
                  className="text-center text-2xl tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("patient.verify")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setStep("phone")}
                disabled={loading}
              >
                {t("common.back")}
              </Button>
            </form>
          )}

          {step === "consent" && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900">{t("common.success")}</p>
                  <p className="text-sm text-green-700">{phone} {t("common.verified")}</p>
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <p className="text-sm font-medium text-amber-900 mb-3">{t("patient.consent")}</p>
                <p className="text-sm text-amber-800 mb-4">{t("patient.consent_text")}</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-amber-900">{t("patient.consent")}</span>
                </label>
              </div>

              <Button
                onClick={handleConsentSubmit}
                className="w-full"
                disabled={!consentGiven}
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
