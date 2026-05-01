import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";

export default function AuditLogs() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (supabase as any).from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }: any) => setItems(data ?? []));
  }, []);

  const filtered = items.filter(i => !q || (i.entity_type ?? "").includes(q) || (i.action ?? "").includes(q));

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{t("auditLogs")}</h1>
          <Input className="w-64" placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Card className="overflow-hidden"><div className="divide-y">
          {filtered.map(i => (
            <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
              <Badge variant="outline" className="capitalize">{i.action}</Badge>
              <Badge variant="outline">{i.entity_type}</Badge>
              <div className="flex-1 truncate text-muted-foreground">{i.entity_id ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
            </div>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">{t("noData")}</div>}
        </div></Card>
      </div>
    </SettingsLayout>
  );
}