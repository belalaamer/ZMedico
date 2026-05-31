import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";

export default function SystemInfo() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const tables = ["patients","appointments","invoices","payments","products","medical_records","profiles"];
      const out: Record<string, number> = {};
      for (const tbl of tables) {
        const { count } = await (supabase as any).from(tbl).select("*", { count: "exact", head: true });
        out[tbl] = count ?? 0;
      }
      setStats(out);
      const { data } = await (supabase as any).from("system_backups").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLastBackup(data?.created_at ?? null);
    })();
  }, []);
  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("systemInfo")}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5"><div className="text-sm text-muted-foreground">{t("version")}</div><div className="text-2xl font-bold mt-1">1.0.0</div></Card>
          <Card className="p-5"><div className="text-sm text-muted-foreground">{t("systemHealth")}</div><Badge className="status-completed mt-2">{t("healthy2")}</Badge></Card>
          <Card className="p-5"><div className="text-sm text-muted-foreground">{t("lastBackupDate")}</div><div className="text-sm mt-1">{lastBackup ? new Date(lastBackup).toLocaleString() : "—"}</div></Card>
        </div>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">{t("dbStats")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground capitalize">{k.replace("_"," ")}</div><div className="text-xl font-bold">{v}</div></div>
            ))}
          </div>
        </Card>
      </div>
    </SettingsLayout>
  );
}