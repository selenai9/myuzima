import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Download,
  Droplets,
  Pill,
  HeartPulse,
  Phone,
  ArrowLeft,
  Save,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Allergy {
  name: string;
  severity?: "mild" | "moderate" | "severe";
}

interface Medication {
  name: string;
  dosage: string;
  frequency?: string;
}

interface Contact {
  name: string;
  phone: string;
  relation: string;
}

// ─── Severity Badge ────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    mild: "badge-warning",
    moderate: "badge-accent",
    severe: "badge-danger",
  };
  return (
    <span className={config[severity] || config.mild}>
      {severity.toUpperCase()}
    </span>
  );
}

export default function PatientProfile() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [profileExists, setProfileExists] = useState(false);

  // Profile Data State
  const [bloodType, setBloodType] = useState("O+");
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Input Field States
  const [newAllergy, setNewAllergy] = useState({ name: "", severity: "mild" as const });
  const [newMedication, setNewMedication] = useState({ name: "", dosage: "", frequency: "" });
  const [newCondition, setNewCondition] = useState("");
  const [newContact, setNewContact] = useState({ name: "", phone: "", relation: "" });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await apiClient.getEmergencyProfile();
      if (response.profile) {
        setProfileExists(true);
        setBloodType(response.profile.bloodType);
        setAllergies(response.profile.allergies || []);
        setMedications(response.profile.medications || []);
        setConditions(response.profile.conditions || []);
        setContacts(response.profile.contacts || []);
      }
    } catch (err) {
      // Profile doesn't exist yet
    }
  };

  const handleAddAllergy = () => {
    if (newAllergy.name.trim()) {
      setAllergies([...allergies, newAllergy]);
      setNewAllergy({ name: "", severity: "mild" });
    }
  };

  const handleAddMedication = () => {
    if (newMedication.name.trim() && newMedication.dosage.trim()) {
      setMedications([...medications, newMedication]);
      setNewMedication({ name: "", dosage: "", frequency: "" });
    }
  };

  const handleAddCondition = () => {
    if (newCondition.trim()) {
      setConditions([...conditions, newCondition]);
      setNewCondition("");
    }
  };

  const handleAddContact = () => {
    if (newContact.name.trim() && newContact.phone.trim() && newContact.relation.trim()) {
      setContacts([...contacts, newContact]);
      setNewContact({ name: "", phone: "", relation: "" });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const profileData = { bloodType, allergies, medications, conditions, contacts };

      if (profileExists) {
        await apiClient.updateEmergencyProfile(profileData);
        toast.success(t("patient.profile_updated"));
      } else {
        await apiClient.createEmergencyProfile(profileData);
        toast.success(t("common.success"));
        setProfileExists(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadQR = async () => {
    setDownloading(true);
    try {
      const pdfBlob = await apiClient.downloadQRCard();
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myuzima-emergency-card-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.network_error"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-healthcare-bg)]">
      {/* ── Top Navigation ─────────────────────── */}
      <div className="border-b border-border/50 bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-healthcare-teal-light)] text-[var(--color-healthcare-muted)] hover:text-[var(--color-healthcare-deep)] transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-healthcare-teal)]" />
            <span className="text-sm font-semibold text-[var(--color-healthcare-text)]">
              Emergency Profile
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Content ──────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 page-enter">
        <Card className="healthcare-card border-0 overflow-hidden">
          {/* Card Header with gradient */}
          <CardHeader className="bg-gradient-to-r from-[var(--color-healthcare-teal)] to-[var(--color-healthcare-deep)] p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <HeartPulse className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-white text-xl font-bold">
                  {t("patient.profile")}
                </CardTitle>
                <CardDescription className="text-white/70 text-sm">
                  {t("patient.create_profile")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-8">
            {error && (
              <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-8">
              {/* ═══ Blood Type ═══ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Droplets className="h-4 w-4 text-[var(--color-healthcare-danger)]" />
                  <label className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                    {t("patient.blood_type")}
                  </label>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBloodType(type)}
                      className={`
                        py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border-2
                        ${
                          bloodType === type
                            ? "bg-[var(--color-healthcare-danger)] text-white border-[var(--color-healthcare-danger)] shadow-md shadow-red-200"
                            : "bg-white text-[var(--color-healthcare-muted)] border-border hover:border-[var(--color-healthcare-danger)]/30 hover:text-[var(--color-healthcare-danger)]"
                        }
                      `}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* ═══ Allergies ═══ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-[var(--color-healthcare-danger)]" />
                  <label className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                    {t("patient.allergies")}
                  </label>
                  {allergies.length > 0 && (
                    <span className="badge-danger">{allergies.length}</span>
                  )}
                </div>
                <div className="space-y-2 mb-3">
                  {allergies.map((allergy, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-red-50 p-3 border border-red-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-red-900">{allergy.name}</p>
                          <SeverityBadge severity={allergy.severity || "mild"} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllergies(allergies.filter((_, i) => i !== idx))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-100 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="healthcare-input flex-1"
                    placeholder="Allergy name"
                    value={newAllergy.name}
                    onChange={(e) => setNewAllergy({ ...newAllergy, name: e.target.value })}
                  />
                  <select
                    value={newAllergy.severity}
                    onChange={(e) => setNewAllergy({ ...newAllergy, severity: e.target.value as any })}
                    className="healthcare-select w-32"
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddAllergy}
                    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)] hover:bg-[var(--color-healthcare-teal)] hover:text-white transition-all duration-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ═══ Medications ═══ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Pill className="h-4 w-4 text-[var(--color-healthcare-info)]" />
                  <label className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                    {t("patient.medications")}
                  </label>
                  {medications.length > 0 && (
                    <span className="badge-teal">{medications.length}</span>
                  )}
                </div>
                <div className="space-y-2 mb-3">
                  {medications.map((med, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-blue-50 p-3 border border-blue-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                          <Pill className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-blue-900">{med.name}</p>
                          <p className="text-xs text-blue-600">
                            {med.dosage} {med.frequency && `• ${med.frequency}`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMedications(medications.filter((_, i) => i !== idx))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-blue-400 hover:bg-blue-100 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="healthcare-input flex-1"
                    placeholder="Medication name"
                    value={newMedication.name}
                    onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })}
                  />
                  <input
                    className="healthcare-input w-28"
                    placeholder="Dosage"
                    value={newMedication.dosage}
                    onChange={(e) => setNewMedication({ ...newMedication, dosage: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)] hover:bg-[var(--color-healthcare-teal)] hover:text-white transition-all duration-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ═══ Conditions ═══ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <HeartPulse className="h-4 w-4 text-[var(--color-healthcare-accent)]" />
                  <label className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                    {t("patient.conditions")}
                  </label>
                  {conditions.length > 0 && (
                    <span className="badge-warning">{conditions.length}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {conditions.map((condition, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 border border-amber-200 group"
                    >
                      {condition}
                      <button
                        type="button"
                        onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-amber-400 hover:bg-amber-200 hover:text-amber-700 transition-all"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="healthcare-input flex-1"
                    placeholder="e.g. Diabetes, Hypertension"
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddCondition}
                    className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)] hover:bg-[var(--color-healthcare-teal)] hover:text-white transition-all duration-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* ═══ Emergency Contacts ═══ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4 text-[var(--color-healthcare-success)]" />
                  <label className="text-sm font-semibold text-[var(--color-healthcare-text)]">
                    {t("patient.emergency_contacts")}
                  </label>
                  {contacts.length > 0 && (
                    <span className="badge-success">{contacts.length}</span>
                  )}
                </div>
                <div className="space-y-2 mb-3">
                  {contacts.map((contact, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 border border-emerald-100 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                          {contact.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-emerald-900">{contact.name}</p>
                          <p className="text-xs text-emerald-600">
                            {contact.phone} • {contact.relation}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    className="healthcare-input"
                    placeholder={t("patient.contact_name")}
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  />
                  <input
                    className="healthcare-input"
                    placeholder={t("patient.contact_phone")}
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="healthcare-input flex-1"
                      placeholder={t("patient.contact_relation")}
                      value={newContact.relation}
                      onChange={(e) => setNewContact({ ...newContact, relation: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)] hover:bg-[var(--color-healthcare-teal)] hover:text-white transition-all duration-200"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ═══ Action Buttons ═══ */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/50">
                <button type="submit" className="btn-healthcare flex-1 py-3" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {t("common.save")}
                    </>
                  )}
                </button>

                {profileExists && (
                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    disabled={downloading}
                    className="btn-accent py-3 px-6"
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        {t("patient.download_qr")}
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
