import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { cacheProfile, getProfileByToken } from "@/lib/idb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Camera, WifiOff, Heart, Pill, Activity, Phone, Keyboard } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode"; // <-- Added library

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
  
  // UI States
  const [manualToken, setManualToken] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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

  // Initialize Camera Scanner
  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          scanner.clear(); // Stop scanning on success
          setShowScanner(false);
          handleQRScan(decodedText);
        },
        (err) => {
          // Ignore continuous scanning errors to prevent console spam
        }
      );

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [showScanner]);

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
      setError(err?.message || "Scan failed or token invalid. (403 Forbidden usually means the token doesn't exist)");
      toast.error(err?.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    let tokenToSubmit = manualToken.trim();
    
    // FIX: If user only types the numbers for the demo, automatically fix the formatting
    if (/^\d+$/.test(tokenToSubmit)) {
      tokenToSubmit = `demo-qr-${tokenToSubmit}`;
    }

    if (tokenToSubmit) {
      handleQRScan(tokenToSubmit);
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
        {/* ... (Your existing 'view' mode UI stays exactly the same) ... */}
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

        <div className="flex justify-center">
          <Badge className={`${bloodTypeColors[profile.bloodType] || "bg-gray-500"} text-white text-4xl px-8 py-4 rounded-2xl`}>
            {profile.bloodType}
          </Badge>
        </div>

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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5" /> {t("profile.medications")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.medications.length > 0 ? (
              profile.medications.map((m, i) => (
                <div key={i} className="border-b last:border-b-0 py-2">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-sm text-gray-600">{m.dosage} {m.frequency && `- ${m.frequency}`}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No medications recorded</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" /> {t("profile.conditions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.conditions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.conditions.map((c, i) => (
                  <Badge key={i} variant="secondary">{c}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No conditions recorded</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" /> {t("profile.contacts")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.contacts.length > 0 ? (
              profile.contacts.map((c, i) => (
                <a key={i} href={`tel:${c.phone}`} className="block border-b last:border-b-0 py-3">
                  <p className="font-semibold">{c.name} ({c.relation})</p>
                  <p className="text-blue-600">{c.phone}</p>
                </a>
              ))
            ) : (
              <p className="text-gray-500">No contacts recorded</p>
            )}
          </CardContent>
        </Card>

        <Button onClick={() => { setStep("scan"); setProfile(null); setManualToken(""); setShowInput(false); setShowScanner(false); }} className="w-full">
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
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Camera Scanner View */}
          {showScanner && (
             <div className="space-y-4">
               <div id="reader" className="w-full rounded-lg overflow-hidden"></div>
               <Button variant="outline" onClick={() => setShowScanner(false)} className="w-full">Cancel Scan</Button>
             </div>
          )}

          {/* Initial Button Menu */}
          {!showInput && !showScanner && (
            <div className="space-y-3">
              <Button
                onClick={() => setShowScanner(true)}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan QR Code Image
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowInput(true)}
                disabled={loading}
                className="w-full"
              >
                <Keyboard className="w-4 h-4 mr-2" />
                Enter Token Manually
              </Button>
            </div>
          )}

          {/* Manual Input View */}
          {showInput && !showScanner && (
            <div className="space-y-2">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter QR token (e.g., 1774719612135)"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                autoFocus
                disabled={loading}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowInput(false); setManualToken(""); setError(""); }}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleManualSubmit}
                  disabled={loading || !manualToken.trim()}
                  className="flex-1"
                >
                  {loading ? "Scanning..." : "Submit"}
                </Button>
              </div>
            </div>
          )}

          <p className="text-center text-sm text-gray-500 mt-4">
            {t("responder.scan_instructions")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
