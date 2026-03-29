import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { cacheProfile, getProfileByToken } from "@/lib/idb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, Camera, WifiOff, Heart, Pill, 
  Activity, Phone, Keyboard, Upload, X, ArrowLeft 
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

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
  const [showInput, setShowInput] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guard against concurrent stop() calls — html5-qrcode throws if stop() is
  // called while a previous stop is still in flight (state machine constraint).
  const isStopping = useRef(false);

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

  useEffect(() => {
    if (showScanner) startCamera();
    else stopCamera();
    return () => { stopCamera(); };
  }, [showScanner]);

  const startCamera = async () => {
    try {
      const scanner = new Html5Qrcode("reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.85);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Do NOT call setShowScanner(false) here — that would trigger the
          // useEffect to call stopCamera() concurrently with handleQRScan's
          // own stopCamera() call, causing the state-machine loop.
          // handleQRScan calls stopCamera() then sets state itself.
          handleQRScan(decodedText);
        },
        () => {} 
      );
    } catch (err) {
      setError("Camera failed to start. Check permissions.");
      setShowScanner(false);
    }
  };

  const stopCamera = async () => {
    // Prevent concurrent stop() calls — the html5-qrcode state machine will
    // throw "Cannot transition to a new state, already under transition" if
    // stop() is called a second time before the first resolves.
    if (isStopping.current || !html5QrRef.current?.isScanning) return;
    isStopping.current = true;
    try {
      await html5QrRef.current.stop();
      html5QrRef.current = null;
    } catch (err) {
      console.error("Scanner stop error", err);
    } finally {
      isStopping.current = false;
    }
  };

  const handleQRScan = async (decodedText: string) => {
    setLoading(true);
    setError("");
    // Stop the camera first, then hide the scanner UI — single stop path
    await stopCamera();
    setShowScanner(false);

    try {
      let token = decodedText.trim();
      if (token.startsWith('http')) {
        try {
          const url = new URL(token);
          const extracted = url.searchParams.get("token");
          if (extracted) token = extracted;
        } catch (e) {}
      }

      if (online) {
        const response = await apiClient.scanQRCode(token);
        setProfile(response.profile);
        if (response.profile.dataAvailable) {
          await cacheProfile({ ...response.profile, qrToken: token, lastScanned: new Date() });
        }
      } else {
        const cached = await getProfileByToken(token);
        if (cached) {
          setProfile({ ...cached, dataAvailable: true } as EmergencyProfile);
          toast.info("Offline mode - using cached data");
        } else throw new Error("Profile not found in offline cache.");
      }
      setStep("view");
    } catch (err: any) {
      setError(err?.message || "Scan failed");
      toast.error(err?.message || "Scan failed");
    } finally { setLoading(false); }
  };

  const handleManualSubmit = () => {
    let token = manualToken.trim();
    if (/^\d+$/.test(token)) token = `demo-qr-${token}`;
    if (token) handleQRScan(token);
  };

  const bloodTypeColors: Record<string, string> = {
    "A+": "bg-red-500", "A-": "bg-red-600",
    "B+": "bg-blue-500", "B-": "bg-blue-600",
    "AB+": "bg-purple-500", "AB-": "bg-purple-600",
    "O+": "bg-emerald-600", "O-": "bg-emerald-700",
  };

  if (step === "view" && profile) {
    return (
      <div className="min-h-screen bg-healthcare-bg p-4 space-y-4 pb-10 page-enter">
        <header className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setStep("scan")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("common.back")}
          </Button>
          {!online && <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50"><WifiOff className="w-3 h-3 mr-1" /> Offline</Badge>}
        </header>

        {!profile.dataAvailable && (
          <div className="bg-red-50 border-2 border-red-200 text-red-700 p-4 rounded-xl text-center font-bold">
             ENCRYPTED DATA UNAVAILABLE
          </div>
        )}

        <div className="flex flex-col items-center gap-2 py-4">
          <div className="text-xs font-bold text-healthcare-muted uppercase tracking-widest">Blood Type</div>
          <Badge className={`${bloodTypeColors[profile.bloodType] || "bg-slate-500"} text-white text-5xl px-10 py-6 rounded-3xl shadow-lg`}>
            {profile.bloodType}
          </Badge>
        </div>

        {/* Medical Cards */}
        <Card className="healthcare-card border-red-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-600 flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5" /> {t("profile.allergies")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {profile.allergies.length > 0 ? (
              profile.allergies.map((a, i) => (
                <div key={i} className="bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <span className="font-bold text-red-700 text-sm">{a.name}</span>
                  {a.severity && <Badge className="bg-red-200 text-red-800 text-[10px] h-5">{a.severity}</Badge>}
                </div>
              ))
            ) : <p className="text-healthcare-muted italic text-sm">None reported</p>}
          </CardContent>
        </Card>

        {/* Medications & Conditions... */}
        <Card className="healthcare-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-healthcare-text flex items-center gap-2 text-lg">
              <Pill className="w-5 h-5 text-healthcare-teal" /> {t("profile.medications")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.medications.map((m, i) => (
              <div key={i} className="border-l-4 border-healthcare-teal pl-3 py-1">
                <div className="font-bold text-healthcare-text">{m.name}</div>
                <div className="text-xs text-healthcare-muted">{m.dosage} • {m.frequency}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="healthcare-card border-healthcare-teal-light">
          <CardHeader className="pb-2">
            <CardTitle className="text-healthcare-text flex items-center gap-2 text-lg">
              <Phone className="w-5 h-5 text-healthcare-deep" /> {t("profile.contacts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.contacts.map((c, i) => (
              <div key={i} className="bg-healthcare-bg/50 p-3 rounded-xl border border-border/40">
                <div className="mb-2">
                  <div className="font-bold text-healthcare-text">{c.name}</div>
                  <div className="text-xs text-healthcare-muted uppercase font-semibold">{c.relation}</div>
                </div>
                <Button className="w-full bg-healthcare-deep hover:bg-healthcare-deep/90" asChild>
                  <a href={`tel:${c.phone}`}><Phone className="w-4 h-4 mr-2" /> Call {c.phone}</a>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={() => setStep("scan")} className="w-full mt-4" variant="outline">
          Scan Another Profile
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-healthcare-bg page-enter">
      <Card className="w-full max-w-md healthcare-card border-none shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-2">
            <Heart className="w-8 h-8 text-healthcare-teal fill-healthcare-teal" />
          </div>
          <CardTitle className="text-2xl font-black text-healthcare-text tracking-tight">
            MyUZIMA Responder
          </CardTitle>
          <p className="text-sm text-healthcare-muted">Authorized Emergency Access Only</p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div id="reader-hidden" className="hidden"></div>
          
          {showScanner ? (
            <div className="space-y-4">
              <div 
                id="reader" 
                className="w-full rounded-2xl bg-black shadow-inner" 
                style={{ minHeight: "300px" }}
              ></div>
              <Button variant="ghost" onClick={() => setShowScanner(false)} className="w-full text-healthcare-muted">
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {!showInput ? (
                <>
                  <Button onClick={() => setShowScanner(true)} disabled={loading} className="btn-healthcare w-full h-16 text-lg">
                    <Camera className="w-6 h-6" /> Scan QR Code
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="h-12 border-border">
                      <Upload className="w-4 h-4 mr-2" /> Gallery
                    </Button>
                    <Button variant="outline" onClick={() => setShowInput(true)} className="h-12 border-border">
                      <Keyboard className="w-4 h-4 mr-2" /> Manual
                    </Button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fs = new Html5Qrcode("reader-hidden");
                      fs.scanFile(file, false).then(handleQRScan).catch(() => setError("No QR found"));
                    }
                  }} />
                </>
              ) : (
                <div className="space-y-3">
                  <input
                    className="healthcare-input font-mono tracking-widest text-center text-lg"
                    placeholder="Enter Token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => { setShowInput(false); setManualToken(""); }} className="flex-1">Cancel</Button>
                    <Button onClick={handleManualSubmit} className="btn-healthcare flex-1">Submit</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-border/40">
             <div className="flex items-center justify-center gap-4 text-[10px] text-healthcare-muted font-bold uppercase tracking-widest">
                <span className={online ? "text-healthcare-success" : "text-red-400"}>
                  {online ? "● System Online" : "○ System Offline"}
                </span>
                <span>• Secure Encryption</span>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
