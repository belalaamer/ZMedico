import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function BackupExport() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsAdmin(false); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsAdmin(!!data); });
    return () => { cancelled = true; };
  }, [user]);

  const guard = () => {
    if (!isAdmin) { toast.error("Admin access required"); return false; }
    return true;
  };

  const exportTable = async (table: string, filename: string) => {
    if (!guard()) return;
    const { data: result, error } = await supabase.functions.invoke("admin-export", {
      body: { mode: "table", table },
    });
    if (error) return toast.error(error.message);
    if ((result as any)?.error) return toast.error((result as any).error);
    const rows = (result as any)?.data?.[table] ?? [];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table);
    XLSX.writeFile(wb, filename);
    toast.success(t("saved"));
  };

  const exportAllJson = async () => {
    if (!guard()) return;
    const { data: result, error } = await supabase.functions.invoke("admin-export", {
      body: { mode: "all" },
    });
    if (error) return toast.error(error.message);
    if ((result as any)?.error) return toast.error((result as any).error);
    const out = (result as any)?.data ?? {};
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
    } catch {}
    toast.success(t("saved"));
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("backupExport")}</h1>
        {isAdmin === false && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Backup and export are restricted to administrators.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Database className="size-5 text-primary" /><h3 className="font-semibold">Backup</h3></div>
            <p className="text-sm text-muted-foreground">Export full snapshot of core tables as JSON.</p>
            <Button disabled={!isAdmin} className="gradient-primary text-primary-foreground" onClick={exportAllJson}><Download className="me-2 size-4" />{t("backupNow")}</Button>
          </Card>
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Download className="size-5 text-primary" /><h3 className="font-semibold">Export</h3></div>
            <div className="grid gap-2">
              <Button disabled={!isAdmin} variant="outline" onClick={() => exportTable("patients", "patients.xlsx")}>{t("exportPatients")}</Button>
              <Button disabled={!isAdmin} variant="outline" onClick={() => exportTable("invoices", "invoices.xlsx")}>{t("exportInvoices")}</Button>
              <Button disabled={!isAdmin} variant="outline" onClick={() => exportTable("appointments", "appointments.xlsx")}>Export appointments</Button>
              <Button disabled={!isAdmin} variant="outline" onClick={() => exportTable("products", "products.xlsx")}>Export products</Button>
            </div>
          </Card>
        </div>
      </div>
    </SettingsLayout>
  );
}