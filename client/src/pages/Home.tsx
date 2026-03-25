import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, AlertTriangle, Shield } from "lucide-react";

export default function Home() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "rw" ? "en" : "rw";
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-indigo-600">{t("app_title")}</h1>
            <p className="text-sm text-gray-600">{t("app_subtitle")}</p>
          </div>
          <Button variant="outline" onClick={toggleLanguage} size="sm">
            {i18n.language === "rw" ? "English" : "Kinyarwanda"}
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            {t("app_title")} — {t("app_subtitle")}
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Life-critical medical information at your fingertips. Emergency responders can access encrypted patient profiles via QR codes, even without connectivity.
          </p>
        </div>

        {/* Three User Flows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Patient Flow */}
          <Card className="hover:shadow-lg transition-shadow border-blue-200 bg-blue-50">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-6 w-6 text-blue-600" />
                <CardTitle>{t("patient.title")}</CardTitle>
              </div>
              <CardDescription>Create and manage your emergency profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-gray-700">
                <li>✓ Phone-based OTP registration</li>
                <li>✓ Encrypted medical information</li>
                <li>✓ QR code emergency card</li>
                <li>✓ Access history tracking</li>
              </ul>
              <Button
                onClick={() => setLocation("/patient/register")}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {t("patient.register")}
              </Button>
            </CardContent>
          </Card>

          {/* Responder Flow */}
          <Card className="hover:shadow-lg transition-shadow border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-6 w-6 text-green-600" />
                <CardTitle>{t("responder.title")}</CardTitle>
              </div>
              <CardDescription>Access patient profiles in emergencies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-gray-700">
                <li>✓ Badge ID + PIN authentication</li>
                <li>✓ QR code scanning</li>
                <li>✓ Offline access support</li>
                <li>✓ Critical alerts & allergies</li>
              </ul>
              <Button
                onClick={() => setLocation("/responder/scan")}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {t("responder.login")}
              </Button>
            </CardContent>
          </Card>

          {/* Admin Flow */}
          <Card className="hover:shadow-lg transition-shadow border-purple-200 bg-purple-50">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-6 w-6 text-purple-600" />
                <CardTitle>{t("admin.title")}</CardTitle>
              </div>
              <CardDescription>Manage responders and audit logs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2 text-gray-700">
                <li>✓ Responder registry management</li>
                <li>✓ Immutable audit logs</li>
                <li>✓ System statistics</li>
                <li>✓ Access control & RBAC</li>
              </ul>
              <Button
                onClick={() => setLocation("/admin")}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {t("admin.title")} {t("common.access")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-12">
          <h3 className="text-2xl font-bold mb-6 text-center">Key Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <div className="text-2xl">🔐</div>
              <div>
                <h4 className="font-semibold mb-1">AES-256-GCM Encryption</h4>
                <p className="text-sm text-gray-600">All sensitive patient data encrypted at rest and in transit</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-2xl">📱</div>
              <div>
                <h4 className="font-semibold mb-1">Offline-First PWA</h4>
                <p className="text-sm text-gray-600">Works seamlessly on 3G networks and without connectivity</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-2xl">📊</div>
              <div>
                <h4 className="font-semibold mb-1">Immutable Audit Logs</h4>
                <p className="text-sm text-gray-600">Every profile access tracked with timestamp and responder ID</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-2xl">🌍</div>
              <div>
                <h4 className="font-semibold mb-1">Multi-Language Support</h4>
                <p className="text-sm text-gray-600">Kinyarwanda and English with USSD fallback for feature phones</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <h4 className="font-semibold mb-1">DATA UNAVAILABLE Banner</h4>
                <p className="text-sm text-gray-600">Critical safety feature prevents blank medical displays</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-2xl">🔔</div>
              <div>
                <h4 className="font-semibold mb-1">SMS Notifications</h4>
                <p className="text-sm text-gray-600">Patients notified via Africa's Talking when profile accessed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-600 py-8 border-t">
          <p className="mb-2">MyUZIMA Emergency QR Access System</p>
          <p className="text-sm">
            Enabling life-saving emergency response in Rwanda with secure, offline-capable medical data access
          </p>
        </footer>
      </section>
    </div>
  );
}
