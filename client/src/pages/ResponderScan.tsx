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
// UPDATED: Added getProfileByToken to our imports from the IDB library
import { cacheProfile, isOnline, getProfileByToken } from "@/lib/idb";
import { toast } from "sonner";

/**
 * Interface defining the medical data structure
 */
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

  /**
   * Listen for browser online/offline events to toggle app behavior
   */
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

  /**
   * Handle the QR Scan Result
   * This is the core logic for MyUZIMA's emergency access
   */
  const handleQRScan = async (qrToken: string) => {
    setLoading(true);
    setError("");

    try {
      if (online) {
        // --- PATH A: ONLINE ---
        // Fetch fresh medical data from the server
        const response = await apiClient.scanQRCode(qrToken);
        const freshProfile = response.profile;
        setProfile(freshProfile);

        // Update the local cache so this person is "safe" for future offline use
        if (freshProfile.dataAvailable) {
          await cacheProfile({
            ...freshProfile,
            qrToken: qrToken, // Save the token so we can find it later without internet
            lastScanned: new Date(),
          });
        }
      } else {
        // --- PATH B: OFFLINE ---
        // Use the IndexedDB index lookup we created in lib/idb.ts
        const cached = await getProfileByToken(qrToken);

        if (cached) {
          setProfile({ ...cached, dataAvailable: true } as EmergencyProfile);
          toast.info(t("responder.offline_mode_active"));
        } else {
          // If not in our top 50 local cache and no signal, we can't fetch it
          throw new Error(t("errors.profile_not_found_offline"));
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

  /**
   * Initialize the camera scanner using html5-qrcode
   */
  const initializeScanner = () => {
    if (scannerRef.current) return;

    scannerRef.current = new Html5QrcodeScanner(
      "qr-scanner",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => handleQRScan(decodedText),
      (error) => console.error("Scanner tracking...", error)
    );

    setScannerReady(true);
  };

  // ... (Rest of UI rendering like handleLogin and toggleTorch remain the same)
  return (
    // The UI code you provided previously goes here
    <div>{/* UI elements */}</div>
  );
}
