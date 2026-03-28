import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Users,
  ClipboardList,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Activity,
  Shield,
  Clock,
  UserPlus,
  Wifi,
  WifiOff,
} from "lucide-react";
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

// â”€â”€â”€ Reusable Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
  loading?: boolean;
}) {
  return (
    <div className="healthcare-card border-0 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--color-healthcare-muted)] mb-1">
            {label}
          </p>
          {loading ? (
            <div className="h-9 w-24 rounded-lg skeleton-shimmer" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-[var(--color-healthcare-text)]">
              {value}
            </p>
          )}
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: bgColor }}
        >
          <Icon className="h-6 w-6" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Role Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    EMT: { bg: "bg-amber-50", text: "text-amber-700" },
    DOCTOR: { bg: "bg-[var(--color-healthcare-teal-light)]", text: "text-[var(--color-healthcare-deep)]" },
    NURSE: { bg: "bg-blue-50", text: "text-blue-700" },
  };
  const { bg, text } = config[role] || config.EMT;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
      {role}
    </span>
  );
}

// â”€â”€â”€ Access Method Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AccessBadge({ method }: { method: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    QR_SCAN: { bg: "bg-[var(--color-healthcare-teal-light)]", text: "text-[var(--color-healthcare-deep)]", icon: Activity },
    USSD: { bg: "bg-blue-50", text: "text-blue-700", icon: Wifi },
    OFFLINE_CACHE: { bg: "bg-amber-50", text: "text-amber-700", icon: WifiOff },
  };
  const { bg, text, icon: Icon } = config[method] || config.QR_SCAN;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
      <Icon className="h-3 w-3" />
      {method.replace("_", " ")}
    </span>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function AdminDashboard() {
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

  const handleAddResponder = async (data: any) => {
  setAddingResponder(true);  // or whatever your loading state is called
  try {
    await apiClient.addResponder(data);
    toast.success("Responder added successfully");
    setShowAddForm(false);   // close modal/form if applicable
    await loadResponders();  // refresh the list
  } catch (err: any) {
    toast.error(err?.response?.data?.error || "Failed to add responder");
  } finally {
    setAddingResponder(false);  // ← this is the fix — was missing
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

  const tabs = [
    { key: "responders" as const, label: t("admin.responders"), icon: Users },
    { key: "audit" as const, label: t("admin.audit_logs"), icon: ClipboardList },
    { key: "stats" as const, label: t("admin.stats"), icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-healthcare-bg)]">
      {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="border-b border-border/50 bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-healthcare-deep)]/10">
                <Shield className="h-5 w-5 text-[var(--color-healthcare-deep)]" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[var(--color-healthcare-text)]">
                  {t("admin.title")}
                </h1>
                <p className="text-xs text-[var(--color-healthcare-muted)] -mt-0.5">
                  {t("app_subtitle")}
                </p>
              </div>
            </div>
            <div className="badge-teal text-[10px]">
              <span className="relative flex h-1.5 w-1.5 mr-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-healthcare-teal)] opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-healthcare-teal)]"></span>
              </span>
              System Active
            </div>
          </div>

          {/* â”€â”€ Tab Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="flex gap-1 -mb-px">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200
                  ${
                    tab === key
                      ? "border-[var(--color-healthcare-teal)] text-[var(--color-healthcare-teal)]"
                      : "border-transparent text-[var(--color-healthcare-muted)] hover:text-[var(--color-healthcare-text)] hover:border-border"
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* â”€â”€ Main Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-enter">
        {error && (
          <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* â•â•â• RESPONDERS TAB â•â•â• */}
        {tab === "responders" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Add Responder Form */}
            <div className="lg:col-span-2">
              <Card className="healthcare-card border-0 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-[var(--color-healthcare-teal)] to-[var(--color-healthcare-deep)] p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                      <UserPlus className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-white text-base font-semibold">
                      {t("admin.add_responder")}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleAddResponder} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-1.5">
                        Badge ID
                      </label>
                      <input
                        className="healthcare-input"
                        placeholder="e.g. RW-EMT-0042"
                        value={newResponder.badgeId}
                        onChange={(e) => setNewResponder({ ...newResponder, badgeId: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-1.5">
                        {t("admin.responder_name")}
                      </label>
                      <input
                        className="healthcare-input"
                        placeholder="Full name"
                        value={newResponder.name}
                        onChange={(e) => setNewResponder({ ...newResponder, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-1.5">
                        Role
                      </label>
                      <select
                        value={newResponder.role}
                        onChange={(e) => setNewResponder({ ...newResponder, role: e.target.value as any })}
                        className="healthcare-select"
                      >
                        <option value="EMT">EMT</option>
                        <option value="DOCTOR">Doctor</option>
                        <option value="NURSE">Nurse</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-1.5">
                        {t("admin.facility")}
                      </label>
                      <input
                        className="healthcare-input"
                        placeholder="Facility ID"
                        value={newResponder.facilityId}
                        onChange={(e) => setNewResponder({ ...newResponder, facilityId: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-healthcare-muted)] uppercase tracking-wider mb-1.5">
                        PIN
                      </label>
                      <input
                        className="healthcare-input"
                        placeholder="4-digit PIN"
                        type="password"
                        maxLength={4}
                        value={newResponder.pin}
                        onChange={(e) => setNewResponder({ ...newResponder, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-healthcare w-full mt-2" disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          {t("admin.add_responder")}
                        </>
                      )}
                    </button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Responders List */}
            <div className="lg:col-span-3">
              <Card className="healthcare-card border-0">
                <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
                  <CardTitle className="text-base font-semibold text-[var(--color-healthcare-text)]">
                    {t("admin.responders")}
                  </CardTitle>
                  <span className="badge-teal">{responders.length} total</span>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {responders.length === 0 ? (
                      <div className="text-center py-12">
                        <Users className="h-12 w-12 mx-auto text-[var(--color-healthcare-muted)]/30 mb-4" />
                        <p className="text-sm font-medium text-[var(--color-healthcare-muted)]">
                          {t("common.no_results")}
                        </p>
                        <p className="text-xs text-[var(--color-healthcare-muted)]/60 mt-1">
                          Add a responder using the form
                        </p>
                      </div>
                    ) : (
                      responders.map((responder) => (
                        <div
                          key={responder.id}
                          className="flex items-center justify-between rounded-xl bg-[var(--color-healthcare-bg)] p-4 border border-border/30 hover:border-[var(--color-healthcare-teal)]/30 hover:bg-[var(--color-healthcare-teal-50)] transition-all duration-200 group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-healthcare-teal)]/10 text-[var(--color-healthcare-teal)] font-bold text-sm">
                              {responder.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-[var(--color-healthcare-text)]">
                                {responder.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-[var(--color-healthcare-muted)] font-mono">
                                  {responder.badgeId}
                                </span>
                                <RoleBadge role={responder.role} />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeactivateResponder(responder.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-healthcare-muted)] hover:bg-red-50 hover:text-red-600 transition-all duration-200 opacity-0 group-hover:opacity-100"
                            aria-label="Deactivate responder"
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
          </div>
        )}

        {/* â•â•â• AUDIT LOGS TAB â•â•â• */}
        {tab === "audit" && (
          <Card className="healthcare-card border-0">
            <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
              <div>
                <CardTitle className="text-base font-semibold text-[var(--color-healthcare-text)]">
                  {t("admin.audit_logs")}
                </CardTitle>
                <p className="text-xs text-[var(--color-healthcare-muted)] mt-0.5">
                  {t("common.showing")} {auditLogs.length} {t("common.of")} {auditTotal} records
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-healthcare-muted)]" />
                <input
                  className="healthcare-input pl-9 w-64"
                  placeholder="Search logs..."
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--color-healthcare-teal)]" />
                  <p className="text-sm text-[var(--color-healthcare-muted)]">Loading audit logs...</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="healthcare-table">
                      <thead>
                        <tr>
                          <th>{t("common.timestamp")}</th>
                          <th>Responder ID</th>
                          <th>Patient ID</th>
                          <th>{t("common.access")}</th>
                          <th>IP Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <div className="text-center py-12">
                                <ClipboardList className="h-12 w-12 mx-auto text-[var(--color-healthcare-muted)]/30 mb-3" />
                                <p className="text-sm text-[var(--color-healthcare-muted)]">No audit logs found</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => (
                            <tr key={log.id}>
                              <td>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3.5 w-3.5 text-[var(--color-healthcare-muted)]" />
                                  <span className="text-xs font-medium">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span className="text-xs font-mono bg-[var(--color-healthcare-bg)] px-2 py-1 rounded-md">
                                  {log.responderId.slice(0, 8)}â€¦
                                </span>
                              </td>
                              <td>
                                <span className="text-xs font-mono bg-[var(--color-healthcare-bg)] px-2 py-1 rounded-md">
                                  {log.patientId.slice(0, 8)}â€¦
                                </span>
                              </td>
                              <td>
                                <AccessBadge method={log.accessMethod} />
                              </td>
                              <td>
                                <span className="text-xs text-[var(--color-healthcare-muted)]">
                                  {log.deviceIp}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-border/50 px-6 py-4">
                    <p className="text-xs text-[var(--color-healthcare-muted)]">
                      {t("admin.page")} {auditPage + 1}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
                        disabled={auditPage === 0}
                        variant="outline"
                        size="sm"
                        className="rounded-lg h-8 px-3"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        {t("common.previous")}
                      </Button>
                      <Button
                        onClick={() => setAuditPage(auditPage + 1)}
                        disabled={auditPage * 50 + auditLogs.length >= auditTotal}
                        variant="outline"
                        size="sm"
                        className="rounded-lg h-8 px-3"
                      >
                        {t("common.next")}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* â•â•â• STATS TAB â•â•â• */}
        {tab === "stats" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={Activity}
                label={t("admin.total_scans")}
                value={stats.totalScans.toLocaleString()}
                color="var(--color-healthcare-teal)"
                bgColor="var(--color-healthcare-teal-light)"
                loading={loading}
              />
              <StatCard
                icon={Users}
                label="Active Responders"
                value={responders.length}
                color="var(--color-healthcare-deep)"
                bgColor="var(--color-healthcare-deep-light)"
                loading={loading}
              />
              <StatCard
                icon={Shield}
                label="System Uptime"
                value="99.9%"
                color="var(--color-healthcare-success)"
                bgColor="#ECFDF5"
                loading={loading}
              />
              <StatCard
                icon={Clock}
                label={t("common.timestamp")}
                value={new Date().toLocaleDateString()}
                color="var(--color-healthcare-info)"
                bgColor="#EFF6FF"
                loading={loading}
              />
            </div>

            {/* Activity placeholder */}
            <Card className="healthcare-card border-0">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-base font-semibold text-[var(--color-healthcare-text)]">
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-healthcare-teal)]/10 mb-4">
                    <BarChart3 className="h-8 w-8 text-[var(--color-healthcare-teal)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--color-healthcare-text)] mb-1">
                    Analytics Dashboard
                  </p>
                  <p className="text-xs text-[var(--color-healthcare-muted)] max-w-sm">
                    Detailed charts and analytics will appear here as scan data accumulates in the system.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
