import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pill } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export default function Prescriptions() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("prescriptions")
      .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,patient_code)")
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setItems(data ?? []));
  }, []);

  const filtered = items.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const p = r.patients;
    return (`${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.toLowerCase().includes(s)
      || `${p?.patient_code ?? ""}`.includes(s));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("prescriptions")}</h1>
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs"/>
      </div>
      <Card className="shadow-card overflow-hidden">
        {filtered.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noResults")}</div> : (
          <div className="divide-y divide-border">
            {filtered.map((rx) => {
              const p = rx.patients;
              const name = lang === "ar" ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim() : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();
              return (
                <Link key={rx.id} to={`/medical/prescriptions/${rx.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                  <Pill className="size-5 text-primary"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{name} <span className="text-xs text-muted-foreground">#{p?.patient_code}</span></div>
                    <div className="text-xs text-muted-foreground">{formatDate(rx.prescription_date, lang)}</div>
                  </div>
                  <Badge variant="outline" className={rx.status === "active" ? "status-progress" : rx.status === "completed" ? "status-completed" : "status-cancelled"}>{rx.status === "active" ? t("activeRx") : rx.status === "completed" ? t("completed") : t("discontinued")}</Badge>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}