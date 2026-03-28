import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { cacheProfile, getProfileByToken } from "@/lib/idb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Camera, Flashlight, WifiOff, Heart, Pill, Activity, Phone } from "lucide-react";

interface EmergencyProfile {
  id: string;
  patientId: string;
  bloodType: string;
  allergies: Array<{ name: string; severity?: string }>;
  medications: Array<{ name: string; dosage: string; frequency?: string }>;
  conditions: string[];
  contacts: Array<{ name: string; phone: string; relation: string }>;
  dataAvailable: boolean;
}

type Step = "scan" | "view";

export default function ResponderScan() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("scan");
  const [profile, setProfile] = useState<EmergencyProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleQRScan = async (qrToken: string) => {
    setLoading(true);
    setError("");

    try {
      if (online) {
        const response = await apiClient.scanQRCode(qrToken);
        setProfile(response.profile);

        if (response.profile.dataAvailable) {
          await cacheProfile({
            ...response.profile,
            qrToken,
            lastScanned: new Date(),
          });
        }
      } else {
        const cached = await getProfileByToken(qrToken);

        if (cached) {
          setProfile({ ...cached, dataAvailable: true } as EmergencyProfile);
          toast.info(t("responder.offline_mode_active"));
        } else {
          throw new Error(t("errors.profile_not_found_offline"));
        }
      }
      setStep("view");
    } catch (err: any) {
      setError(err?.message || "Scan failed");
      toast.error(err?.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualInput = () => {
    const token = prompt("Enter QR token manually:");
    if (token) {
      handleQRScan(token);
    }
  };

  const bloodTypeColors: Record<string, string> = {
    "A+": "bg-red-500", "A-": "bg-red-600",
    "B+": "bg-blue-500", "B-": "bg-blue-600",
    "AB+": "bg-purple-500", "AB-": "bg-purple-600",
    "O+": "bg-green-500", "O-": "bg-green-600",
  };

  if (step === "view" && profile) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 space-y-4">
        {!online && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 p-3 rounded-lg flex items-center gap-2">
            <WifiOff className="w-5 h-5" />
            <span>{t("responder.offline_mode_active")}</span>
          </div>
        )}

        {!profile.dataAvailable && (
          <div className="bg-red-100 border border-red-400 text-red-800 p-4 rounded-lg text-center font-bold text-lg">
            ⚠️ DATA UNAVAILABLE — Decryption Failed
          </div>
        )}

        {/* Blood Type Badge */}
        <div className="flex justify-center">
          <Badge className={`${bloodTypeColors[profile.bloodType] || "bg-gray-500"} text-white text-4xl px-8 py-4 rounded-2xl`}>
            {profile.bloodType}
          </Badge>
        </div>

        {/* Allergies */}
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> {t("profile.allergies")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.allergies.length > 0 ? (
              <div className="space-y-2">
                {profile.allergies.map((a, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 p-3 rounded-lg">
                    <span className="font-semibold">{a.name}</span>
                    {a.severity && <Badge variant="destructive" className="ml-2">{a.severity}</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">{t("profile.no_allergies")}</p>
            )}
          </CardContent>
        </Card>

        {/* Medications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5" /> {t("profile.medications")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.medications.map((m, i) => (
              <div key={i} className="border-b last:border-b-0 py-2">
                <p className="font-semibold">{m.name}</p>
                <p className="text-sm text-gray-600">{m.dosage} {m.frequency && `- ${m.frequency}`}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" /> {t("profile.conditions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.conditions.map((c, i) => (
                <Badge key={i} variant="secondary">{c}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contacts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" /> {t("profile.contacts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.contacts.map((c, i) => (
              <a key={i} href={`tel:${c.phone}`} className="block border-b last:border-b-0 py-3">
                <p className="font-semibold">{c.name} ({c.relation})</p>
                <p className="text-blue-600">{c.phone}</p>
              </a>
            ))}
          </CardContent>
        </Card>

        <Button onClick={() => { setStep("scan"); setProfile(null); }} className="w-full">
          {t("responder.scan_another")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center flex items-center justify-center gap-2">
            <Heart className="w-6 h-6 text-red-500" />
            MyUZIMA — Emergency Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">
              {error}
            </div>
          )}
          <Button onClick={handleManualInput} disabled={loading} className="w-full" size="lg">
            <Camera className="w-5 h-5 mr-2" />
            {loading ? "Scanning..." : t("responder.scan_qr")}
          </Button>
          <p className="text-center text-sm text-gray-500">
            {t("responder.scan_instructions")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
