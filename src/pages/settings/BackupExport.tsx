import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// xlsx (~300 KB) is loaded on-demand only when an admin actually triggers an export.
import { Download, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { formatDateTime } from "@/lib/format";
import { useBranch } from "@/contexts/BranchContext";

export default function BackupExport() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { currentBranchId, branchSelectionReady } = useBranch();
  // R2: admin gate routed through the canonical AuthorizationService.
  // Replaces a bespoke user_roles fetch that mirrored `isSuperAdmin()`.
  const { authz, loading: authzLoading } = useAuthorization("BackupExport");
  const canBackup = authz.isSuperAdmin();
  const [lastBackup, setLastBackup] = useState<{ created_at: string; rows_count: number | null; size_bytes: number | null } | null>(null);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupError, setBackupError] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const refreshLastBackup = async () => {
    setBackupLoading(true);
    setBackupError(false);
    const { data, error } = await (supabase as any)
      .from("system_backups")
      .select("created_at,rows_count,size_bytes,status")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setBackupLoading(false);
    if (error) { setBackupError(true); return; }
    setLastBackup(data ?? null);
  };
  useEffect(() => { void refreshLastBackup(); }, []);

  const guard = () => {
    if (!canBackup) { toast.error(t("backupRestricted")); return false; }
    if (!branchSelectionReady || !currentBranchId) {
      toast.error(lang === "ar" ? "اختر فرعًا قبل التصدير" : "Select a branch before exporting");
      return false;
    }
    return true;
  };

  const exportTable = async (table: string, filename: string) => {
    if (!guard() || exporting) return;
    setExporting(table);
    try {
      const { data: result, error } = await supabase.functions.invoke("admin-export", {
        body: { mode: "table", table, branch_id: currentBranchId },
      });
      if (error || (result as any)?.error) throw error ?? new Error(String((result as any)?.error));
      const rows = (result as any)?.data?.[table];
      if (!Array.isArray(rows)) throw new Error("Invalid table export response");
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, table);
      XLSX.writeFile(wb, filename);
      toast.success(t("saved"));
    } catch {
      toast.error(t("backupExportFailed"));
    } finally {
      setExporting(null);
    }
  };

  const exportAllJson = async () => {
    if (!guard() || exporting) return;
    setExporting("all");
    try {
      const { data: result, error } = await supabase.functions.invoke("admin-export", {
        body: { mode: "all", branch_id: currentBranchId },
      });
      if (error || (result as any)?.error) throw error ?? new Error(String((result as any)?.error));
      const out = (result as any)?.data;
      if (!out || typeof out !== "object" || Array.isArray(out)) throw new Error("Invalid full export response");
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `zmedico-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      try {
        const tablesCount = Object.keys(out).length;
        const rowsCount = Object.values(out).reduce((acc: number, v: any) => acc + (Array.isArray(v) ? v.length : 0), 0);
        await (supabase as any).from("system_backups").insert({
          backup_type: "manual", status: "completed",
          size_bytes: blob.size, tables_count: tablesCount, rows_count: rowsCount,
          created_by: user?.id ?? null,
        });
        await refreshLastBackup();
      } catch {}
      toast.success(t("saved"));
    } catch {
      toast.error(t("backupExportFailed"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("backupExport")}</h1>
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground" role={backupError ? "alert" : undefined}>
          {backupLoading ? (
            <span>{t("loading")}</span>
          ) : backupError ? (
            <span className="inline-flex items-center gap-2">{t("backupLoadFailed")} <Button variant="ghost" size="sm" onClick={() => void refreshLastBackup()}>{t("retry")}</Button></span>
          ) : lastBackup ? (
            <>{t("lastBackup")}: <span className="font-medium text-foreground">{formatDateTime(lastBackup.created_at, lang)}</span>{lastBackup.rows_count != null ? <> · {lastBackup.rows_count.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} {t("rows")}</> : null}{lastBackup.size_bytes != null ? <> · {(lastBackup.size_bytes/1024/1024).toFixed(2)} {t("megabytes")}</> : null}</>
          ) : (
            <>{t("noBackupRecorded")}</>
          )}
        </div>
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">{t("snapshotNotice")}</div>
        {!authzLoading && !canBackup && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("backupRestricted")}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Database className="size-5 text-primary" /><h3 className="font-semibold">{t("backupSection")}</h3></div>
            <p className="text-sm text-muted-foreground">{t("backupDescription")}</p>
            <Button disabled={!canBackup || Boolean(exporting)} aria-busy={exporting === "all"} className="gradient-primary text-primary-foreground" onClick={exportAllJson}><Download className="me-2 size-4" />{t("backupNow")}</Button>
          </Card>
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Download className="size-5 text-primary" /><h3 className="font-semibold">{t("exportSection")}</h3></div>
            <div className="grid gap-2">
              <Button disabled={!canBackup || Boolean(exporting)} aria-busy={exporting === "patients"} variant="outline" onClick={() => exportTable("patients", "patients.xlsx")}>{t("exportPatients")}</Button>
              <Button disabled={!canBackup || Boolean(exporting)} aria-busy={exporting === "invoices"} variant="outline" onClick={() => exportTable("invoices", "invoices.xlsx")}>{t("exportInvoices")}</Button>
              <Button disabled={!canBackup || Boolean(exporting)} aria-busy={exporting === "appointments"} variant="outline" onClick={() => exportTable("appointments", "appointments.xlsx")}>{t("exportAppointments")}</Button>
              <Button disabled={!canBackup || Boolean(exporting)} aria-busy={exporting === "products"} variant="outline" onClick={() => exportTable("products", "products.xlsx")}>{t("exportProducts")}</Button>
            </div>
          </Card>
        </div>
      </div>
    </SettingsLayout>
  );
}