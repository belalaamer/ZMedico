import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Database } from "lucide-react";

export default function BackupExport() {
  const { t } = useI18n();

  const exportTable = async (table: string, filename: string) => {
    const { data, error } = await (supabase as any).from(table).select("*").limit(10000);
    if (error) return toast.error(error.message);
    const ws = XLSX.utils.json_to_sheet(data ?? []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table);
    XLSX.writeFile(wb, filename);
    toast.success(t("saved"));
  };

  const exportAllJson = async () => {
    const tables = ["patients","appointments","invoices","payments","products","medical_records"];
    const out: any = {};
    for (const tbl of tables) {
      const { data } = await (supabase as any).from(tbl).select("*").limit(10000);
      out[tbl] = data ?? [];
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `zmedico-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("backupExport")}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Database className="size-5 text-primary" /><h3 className="font-semibold">Backup</h3></div>
            <p className="text-sm text-muted-foreground">Export full snapshot of core tables as JSON.</p>
            <Button className="gradient-primary text-primary-foreground" onClick={exportAllJson}><Download className="me-2 size-4" />{t("backupNow")}</Button>
          </Card>
          <Card className="p-5 space-y-3"><div className="flex items-center gap-2"><Download className="size-5 text-primary" /><h3 className="font-semibold">Export</h3></div>
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => exportTable("patients", "patients.xlsx")}>{t("exportPatients")}</Button>
              <Button variant="outline" onClick={() => exportTable("invoices", "invoices.xlsx")}>{t("exportInvoices")}</Button>
              <Button variant="outline" onClick={() => exportTable("appointments", "appointments.xlsx")}>Export appointments</Button>
              <Button variant="outline" onClick={() => exportTable("products", "products.xlsx")}>Export products</Button>
            </div>
          </Card>
        </div>
      </div>
    </SettingsLayout>
  );
}