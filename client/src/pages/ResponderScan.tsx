import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, AlertTriangle, Wifi, WifiOff, Zap } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { apiClient } from "@/lib/api";
import { cacheProfile, isOnline, getAllCachedProfiles } from "@/lib/idb";
import { toast } from "sonner";

interface EmergencyProfile {
  id: string;
  patientId: string;
  bloodType: string;
  allergies: any[];
  medications: any[];
  conditions: string[];
  contacts: any[];
  dataAvailable: boolean;
  dataUnavailableReason?: string;
}

export default function ResponderScan() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"login" | "scan" | "view">("login");
  const [badgeId, setBadgeId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(isOnline());
  const [scannerReady, setScannerReady] = useState(false);
  const [profile, setProfile] = useState<EmergencyProfile | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const unsubscribe = window.addEventListener("online", () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));
    return () => {
      window.removeEventListener("online", () => setOnline(true));
      window.removeEventListener("offline", () => setOnline(false));
    };
  }, []);

  useEffect(() => {
    if (step === "scan" && !scannerReady) {
      initializeScanner();
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [step, scannerReady]);

  const initializeScanner = () => {
    if (scannerRef.current) return;

    scannerRef.current = new Html5QrcodeScanner(
      "qr-scanner",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => handleQRScan(decodedText),
      (error) => console.error("QR scan error:", error)
    );

    setScannerReady(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!/^\d{4}$/.test(pin)) {
        throw new Error(t("errors.invalid_pin"));
      }

      await apiClient.responderLogin(badgeId, pin);
      toast.success(t("common.success"));
      setStep("scan");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = async (qrToken: string) => {
    setLoading(true);
    setError("");

    try {
      // Try to scan online first
      if (online) {
        const response = await apiClient.scanQRCode(qrToken);
        setProfile(response.profile);

        // Cache profile for offline access
        if (response.profile.dataAvailable) {
          const profileWithTimestamp = {
            ...response.profile,
            lastScanned: new Date(),
          };
          await cacheProfile(profileWithTimestamp);
        }
      } else {
        // Offline: search cached profiles
        const cachedProfiles = await getAllCachedProfiles();
        const found = cachedProfiles.find((p) => p.id === qrToken);

        if (found) {
          setProfile({ ...found, dataAvailable: true } as EmergencyProfile);
        } else {
          throw new Error(t("errors.profile_not_found"));
        }
      }

      setStep("view");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTorch = async () => {
    if (scannerRef.current) {
      try {
        if (torchOn) {
          await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: false } as any] });
        } else {
          await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: true } as any] });
        }
        setTorchOn(!torchOn);
      } catch (err) {
        console.error("Torch error:", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Online Status Badge */}
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">{t("responder.title")}</h1>
          <Badge variant={online ? "default" : "destructive"} className="flex gap-1">
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? t("common.online") : t("common.offline")}
          </Badge>
        </div>

        {/* Login Step */}
        {step === "login" && (
          <Card>
            <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
              <CardTitle>{t("responder.login")}</CardTitle>
              <CardDescription className="text-green-100">{t("app_subtitle")}</CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t("responder.badge_id")}</label>
                  <Input
                    type="text"
                    placeholder="BADGE-001"
                    value={badgeId}
                    onChange={(e) => setBadgeId(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t("responder.pin")}</label>
                  <Input
                    type="password"
                    placeholder="0000"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
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
                    t("responder.login")
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Scanner Step */}
        {step === "scan" && (
          <Card>
            <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
              <CardTitle>{t("responder.scan_qr")}</CardTitle>
              <CardDescription className="text-green-100">
                {online ? t("common.online") : t("responder.offline_mode")}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div id="qr-scanner" className="mb-4 rounded-lg overflow-hidden" />

              <div className="flex gap-2">
                <Button
                  onClick={toggleTorch}
                  variant="outline"
                  className="flex-1"
                  disabled={!scannerReady}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {torchOn ? t("responder.torch_off") : t("responder.torch_on")}
                </Button>

                <Button
                  onClick={() => setStep("login")}
                  variant="outline"
                  className="flex-1"
                >
                  {t("common.logout")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile View Step */}
        {step === "view" && profile && (
          <Card>
            <CardHeader className={`text-white rounded-t-lg ${profile.dataAvailable ? "bg-gradient-to-r from-blue-600 to-indigo-600" : "bg-gradient-to-r from-red-600 to-orange-600"}`}>
              <CardTitle>{t("responder.emergency_profile")}</CardTitle>
              <CardDescription className={profile.dataAvailable ? "text-blue-100" : "text-red-100"}>
                {profile.dataAvailable ? t("common.success") : t("responder.data_unavailable")}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              {!profile.dataAvailable && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t("responder.data_unavailable")}</strong>
                    <p className="mt-1">{profile.dataUnavailableReason || t("responder.data_unavailable_message")}</p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Blood Type - Prominent Display */}
              <div className="bg-red-50 border-2 border-red-300 p-4 rounded-lg">
                <p className="text-xs text-red-600 font-semibold uppercase">{t("responder.blood_type")}</p>
                <p className="text-4xl font-bold text-red-900">{profile.bloodType}</p>
              </div>

              {/* Allergies - Red Warning */}
              {profile.allergies && profile.allergies.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <p className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("responder.allergies")}
                  </p>
                  <div className="space-y-1">
                    {profile.allergies.map((allergy: any, idx: number) => (
                      <div key={idx} className="text-sm text-red-800">
                        • <strong>{allergy.name}</strong>
                        {allergy.severity && ` (${allergy.severity})`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medications */}
              {profile.medications && profile.medications.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <p className="font-semibold text-blue-900 mb-2">{t("responder.medications")}</p>
                  <div className="space-y-1">
                    {profile.medications.map((med: any, idx: number) => (
                      <div key={idx} className="text-sm text-blue-800">
                        • <strong>{med.name}</strong> - {med.dosage}
                        {med.frequency && ` (${med.frequency})`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {profile.conditions && profile.conditions.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <p className="font-semibold text-yellow-900 mb-2">{t("responder.conditions")}</p>
                  <div className="space-y-1">
                    {profile.conditions.map((condition: string, idx: number) => (
                      <div key={idx} className="text-sm text-yellow-800">
                        • {condition}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergency Contacts */}
              {profile.contacts && profile.contacts.length > 0 && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <p className="font-semibold text-green-900 mb-2">{t("responder.emergency_contacts")}</p>
                  <div className="space-y-2">
                    {profile.contacts.map((contact: any, idx: number) => (
                      <div key={idx} className="text-sm text-green-800">
                        <p>
                          <strong>{contact.name}</strong> ({contact.relation})
                        </p>
                        <p className="flex items-center gap-2">
                          <a href={`tel:${contact.phone}`} className="text-green-600 hover:underline">
                            {contact.phone}
                          </a>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.location.href = `tel:${contact.phone}`}
                          >
                            {t("responder.call")}
                          </Button>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button onClick={() => setStep("scan")} className="flex-1">
                  {t("responder.scan_qr")}
                </Button>
                <Button onClick={() => setStep("login")} variant="outline" className="flex-1">
                  {t("common.logout")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
