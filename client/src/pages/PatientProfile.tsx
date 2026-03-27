import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Plus, Trash2, Download } from "lucide-react";
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
      // Profile doesn't exist yet - user will create a new one
    }
  };

  // --- Handlers ---
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle>{t("patient.profile")}</CardTitle>
            <CardDescription className="text-blue-100">{t("patient.create_profile")}</CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Blood Type */}
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.blood_type")}</label>
                <select
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Allergies Section */}
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.allergies")}</label>
                <div className="space-y-2 mb-3">
                  {allergies.map((allergy, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-red-50 p-2 rounded border border-red-200">
                      <div>
                        <p className="font-medium text-red-900">{allergy.name}</p>
                        <p className="text-xs text-red-700 uppercase">{allergy.severity}</p>
                      </div>
                      <button type="button" onClick={() => setAllergies(allergies.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-800">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder={t("patient.allergies")} value={newAllergy.name} onChange={(e) => setNewAllergy({ ...newAllergy, name: e.target.value })} />
                  <select value={newAllergy.severity} onChange={(e) => setNewAllergy({ ...newAllergy, severity: e.target.value as any })} className="px-3 py-2 border border-gray-300 rounded-md">
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                  <Button type="button" onClick={handleAddAllergy} size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Medications Section */}
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.medications")}</label>
                <div className="space-y-2 mb-3">
                  {medications.map((med, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-200">
                      <div>
                        <p className="font-medium text-blue-900">{med.name}</p>
                        <p className="text-xs text-blue-700">{med.dosage} {med.frequency && `- ${med.frequency}`}</p>
                      </div>
                      <button type="button" onClick={() => setMedications(medications.filter((_, i) => i !== idx))} className="text-blue-600 hover:text-blue-800">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder={t("patient.medications")} value={newMedication.name} onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })} />
                  <Input placeholder="Dosage" value={newMedication.dosage} onChange={(e) => setNewMedication({ ...newMedication, dosage: e.target.value })} />
                  <Button type="button" onClick={handleAddMedication} size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Conditions Section (Merged from Snippet 1) */}
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.conditions")}</label>
                <div className="space-y-2 mb-3">
                  {conditions.map((condition, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-yellow-50 p-2 rounded border border-yellow-200">
                      <p className="font-medium text-yellow-900">{condition}</p>
                      <button type="button" onClick={() => setConditions(conditions.filter((_, i) => i !== idx))} className="text-yellow-600 hover:text-yellow-800">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder={t("patient.conditions")} value={newCondition} onChange={(e) => setNewCondition(e.target.value)} />
                  <Button type="button" onClick={handleAddCondition} size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Emergency Contacts (Merged from Snippet 1) */}
              <div>
                <label className="block text-sm font-medium mb-2">{t("patient.emergency_contacts")}</label>
                <div className="space-y-2 mb-3">
                  {contacts.map((contact, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-green-50 p-2 rounded border border-green-200">
                      <div>
                        <p className="font-medium text-green-900">{contact.name}</p>
                        <p className="text-xs text-green-700">{contact.phone} - {contact.relation}</p>
                      </div>
                      <button type="button" onClick={() => setContacts(contacts.filter((_, i) => i !== idx))} className="text-green-600 hover:text-green-800">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder={t("patient.contact_name")} value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                  <Input placeholder={t("patient.contact_phone")} value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                  <div className="flex gap-2">
                    <Input placeholder={t("patient.contact_relation")} value={newContact.relation} onChange={(e) => setNewContact({ ...newContact, relation: e.target.value })} />
                    <Button type="button" onClick={handleAddContact} size="sm"><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}</> : t("common.save")}
                </Button>

                {profileExists && (
                  <Button type="button" variant="outline" onClick={handleDownloadQR} disabled={downloading}>
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="mr-2 h-4 w-4" /> {t("patient.download_qr")}</>}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
