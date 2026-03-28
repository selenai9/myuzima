import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { cacheProfile, getProfileByToken } from "@/lib/idb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, WifiOff, Heart, Pill, Activity, Phone, Keyboard, Upload, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

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
  const [manualToken, setManualToken] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // Auto-start camera when on scan step
  useEffect(() => {
    if (step !== "scan") return;
    startCamera();
    return () => { stopCamera(); };
  }, [step]);

  const startCamera = async () => {
    try {
      html5QrRef.current = new Html5Qrcode("qr-reader");
      await html5QrRef.current.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          stopCamera();
          handleQRScan(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err: any) {
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (html5QrRef.current) {
      html5QrRef.current.stop().catch(() => {});
      html5QrRef.current = null;
    }
    setCameraActive(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      stopCamera();
      const scanner = new Html5Qrcode("qr-reader");
      const result = await scanner.scanFile(file, false);
      await scanner.clear();
      handleQRScan(result);
    } catch {
      setError("Could not read QR code from image. Try a clearer photo.");
      startCamera();
    }
  };

  const handleQRScan = async (qrToken: string) => {
    setLoading(true);
    setError("");
    try {
      if (online) {
        const response = await apiClient.scanQRCode(qrToken);
        setProfile(response.profile);
        if (response.profile.dataAvailable) {
          await cacheProfile({ ...response.profile, qrToken, lastScanned: new Date() });
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
      const msg = err?.response?.data?.error || err?.message || "Scan failed or token invalid";
      setError(msg);
      toast.error(msg);
      startCamera();
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    let token = manualToken.trim();
    if (/^\d+$/.test(token)) token = `demo-qr-${token}`;
    if (token) { stopCamera(); handleQRScan(token); }
  };

  const resetToScan = () => {
    setStep("scan");
    setProfile(null);
    setManualToken("");
    setShowManual(false);
    setError("");
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
            <WifiOff className="w-5 h-5" /><span>{t("responder.offline_mode_active")}</span>
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
            ) : <p className="text-gray-500">{t("profile.no_allergies")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Pill className="w-5 h-5" />{t("profile.medications")}</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.medications.length > 0 ? profile.medications.map((m, i) => (
              <div key={i} className="border-b last:border-b-0 py-2">
                <p className="font-semibold">{m.name}</p>
                <p className="text-sm text-gray-600">{m.dosage}{m.frequency && ` - ${m.frequency}`}</p>
              </div>
            )) : <p className="text-gray-500">No medications recorded</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" />{t("profile.conditions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.conditions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.conditions.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
              </div>
            ) : <p className="text-gray-500">No conditions recorded</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5" />{t("profile.contacts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.contacts.length > 0 ? profile.contacts.map((c, i) => (
              <a key={i} href={`tel:${c.phone}`} className="block border-b last:border-b-0 py-3">
                <p className="font-semibold">{c.name} ({c.relation})</p>
                <p className="text-blue-600">{c.phone}</p>
              </a>
            )) : <p className="text-gray-500">No contacts recorded</p>}
          </CardContent>
        </Card>
        <button onClick={resetToScan} className="w-full py-3 bg-gray-800 text-white rounded-xl font-semibold">
          {t("responder.scan_another")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Heart className="w-6 h-6 text-red-400" />
            <span className="text-white text-xl font-bold">MyUZIMA</span>
          </div>
          <p className="text-gray-400 text-sm">Emergency Scanner</p>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
          <div id="qr-reader" className="w-full h-full" />

          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-6 left-6 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-6 right-6 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-6 left-6 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-6 right-6 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-lg" />
            </div>
          )}

          {!cameraActive && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-3">
              <Heart className="w-12 h-12 opacity-30" />
              <p className="text-sm text-center px-4">Camera unavailable.<br />Use image upload or manual entry.</p>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-white text-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm">Fetching profile…</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-xl text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!showManual ? (
          <div className="grid grid-cols-2 gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" /> Upload Image
            </button>
            <button
              onClick={() => { stopCamera(); setShowManual(true); }}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Keyboard className="w-4 h-4" /> Enter Token
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="w-full bg-gray-800 border border-gray-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
              placeholder="Paste token or type number…"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              autoFocus
              disabled={loading}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setShowManual(false); setManualToken(""); setError(""); startCamera(); }}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-3 bg-gray-700 text-white rounded-xl font-medium"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={loading || !manualToken.trim()}
                className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Scanning…" : "Submit"}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-500">
          {cameraActive ? "Point camera at QR code — scans automatically" : t("responder.scan_instructions")}
        </p>
      </div>
    </div>
  );
}
