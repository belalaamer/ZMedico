import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Info } from "lucide-react";

export default function AuditLogs() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (supabase as any).from("audit_logs")
      .select("id,action,entity_type,entity_id,created_at,user_id")
      .order("created_at", { ascending: false }).limit(100)
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
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm flex gap-2">
          <Info className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            {lang === "ar"
              ? "سجل التدقيق مخصص للقراءة فقط (إلحاق دائم). لا يتم حذف أو تعديل أي إدخال. يتم الاحتفاظ بآخر 100 إدخال هنا للعرض السريع؛ السجل الكامل متاح في قاعدة البيانات."
              : "The audit log is append-only — entries cannot be edited or deleted. This view shows the latest 100 events for fast review; the full history is retained in the database."}
          </p>
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