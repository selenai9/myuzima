import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Plus, Trash2, Eye } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Responder {
  id: string;
  badgeId: string;
  name: string;
  role: "EMT" | "DOCTOR" | "NURSE";
  isActive: boolean;
}

interface AuditLog {
  id: string;
  responderId: string;
  patientId: string;
  timestamp: string;
  accessMethod: "QR_SCAN" | "USSD" | "OFFLINE_CACHE";
  deviceIp: string;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"responders" | "audit" | "stats">("responders");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Responder Management
  const [responders, setResponders] = useState<Responder[]>([]);
  const [newResponder, setNewResponder] = useState({
    badgeId: "",
    name: "",
    role: "EMT" as const,
    facilityId: "",
    pin: "",
  });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);

  // Stats
  const [stats, setStats] = useState({ totalScans: 0 });

  useEffect(() => {
    if (tab === "responders") {
      // In production, would fetch responders list
    } else if (tab === "audit") {
      loadAuditLogs();
    } else if (tab === "stats") {
      loadStats();
    }
  }, [tab, auditPage]);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAuditLogs({
        limit: 50,
        offset: auditPage * 50,
      });
      setAuditLogs(response.logs);
      setAuditTotal(response.pagination.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAdminStats();
      setStats(response.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddResponder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiClient.addResponder(newResponder);
      toast.success(t("common.success"));
      setNewResponder({ badgeId: "", name: "", role: "EMT", facilityId: "", pin: "" });
      // Refresh responders list
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateResponder = async (responderId: string) => {
    if (!confirm(t("admin.deactivate"))) return;

    setLoading(true);
    try {
      await apiClient.deactivateResponder(responderId);
      toast.success(t("common.success"));
      setResponders(responders.filter((r) => r.id !== responderId));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{t("admin.title")}</h1>
          <p className="text-gray-600">{t("app_subtitle")}</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={tab === "responders" ? "default" : "outline"}
            onClick={() => setTab("responders")}
          >
            {t("admin.responders")}
          </Button>
          <Button
            variant={tab === "audit" ? "default" : "outline"}
            onClick={() => setTab("audit")}
          >
            {t("admin.audit_logs")}
          </Button>
          <Button
            variant={tab === "stats" ? "default" : "outline"}
            onClick={() => setTab("stats")}
          >
            {t("admin.stats")}
          </Button>
        </div>

        {/* Responders Tab */}
        {tab === "responders" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add Responder Form */}
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.add_responder")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddResponder} className="space-y-4">
                  <Input
                    placeholder={t("admin.responder_name")}
                    value={newResponder.badgeId}
                    onChange={(e) => setNewResponder({ ...newResponder, badgeId: e.target.value })}
                    required
                  />
                  <Input
                    placeholder={t("admin.responder_name")}
                    value={newResponder.name}
                    onChange={(e) => setNewResponder({ ...newResponder, name: e.target.value })}
                    required
                  />
                  <select
                    value={newResponder.role}
                    onChange={(e) => setNewResponder({ ...newResponder, role: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="EMT">EMT</option>
                    <option value="DOCTOR">Doctor</option>
                    <option value="NURSE">Nurse</option>
                  </select>
                  <Input
                    placeholder={t("admin.facility")}
                    value={newResponder.facilityId}
                    onChange={(e) => setNewResponder({ ...newResponder, facilityId: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="PIN (4 digits)"
                    type="password"
                    maxLength={4}
                    value={newResponder.pin}
                    onChange={(e) => setNewResponder({ ...newResponder, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        {t("admin.add_responder")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Responders List */}
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.responders")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {responders.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">{t("common.no_results")}</p>
                  ) : (
                    responders.map((responder) => (
                      <div
                        key={responder.id}
                        className="flex items-center justify-between bg-gray-50 p-3 rounded border"
                      >
                        <div>
                          <p className="font-medium">{responder.name}</p>
                          <p className="text-xs text-gray-600">
                            {responder.badgeId} - {responder.role}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeactivateResponder(responder.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Audit Logs Tab */}
        {tab === "audit" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.audit_logs")}</CardTitle>
              <CardDescription>
                {t("common.showing")} {auditLogs.length} {t("common.of")} {auditTotal}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">{t("common.timestamp")}</th>
                          <th className="text-left p-2">Responder ID</th>
                          <th className="text-left p-2">Patient ID</th>
                          <th className="text-left p-2">{t("common.access")}</th>
                          <th className="text-left p-2">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="p-2 text-xs font-mono">{log.responderId.slice(0, 8)}</td>
                            <td className="p-2 text-xs font-mono">{log.patientId.slice(0, 8)}</td>
                            <td className="p-2 text-xs">{log.accessMethod}</td>
                            <td className="p-2 text-xs">{log.deviceIp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex justify-between items-center mt-4">
                    <Button
                      onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
                      disabled={auditPage === 0}
                      variant="outline"
                    >
                      {t("common.previous")}
                    </Button>
                    <span className="text-sm">
                      {t("admin.page")} {auditPage + 1}
                    </span>
                    <Button
                      onClick={() => setAuditPage(auditPage + 1)}
                      disabled={auditPage * 50 + auditLogs.length >= auditTotal}
                      variant="outline"
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats Tab */}
        {tab === "stats" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.total_scans")}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <p className="text-4xl font-bold text-blue-600">{stats.totalScans}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("common.timestamp")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-gray-600">{new Date().toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
