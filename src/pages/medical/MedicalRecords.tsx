import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export default function MedicalRecords() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    let q = supabase.from("medical_records").select("*, patients(*), medical_specialties(name_en,name_ar)").order("visit_date", { ascending: false }).limit(200);
    if (currentBranchId) q = q.eq("branch_id", currentBranchId);
    q.then(({ data }) => setItems(data ?? []));
  }, [currentBranchId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("medicalRecords")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length}</p>
        </div>
        <Button asChild className="gradient-primary text-primary-foreground"><Link to="/medical/quick-consult"><Plus className="me-2 size-4" />{t("addRecord")}</Link></Button>
      </div>
      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noVisits")}</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((r) => {
              const p = r.patients;
              const name = lang === "ar" ? `${p?.first_name_ar ?? p?.first_name_en ?? ""} ${p?.last_name_ar ?? p?.last_name_en ?? ""}`.trim() : `${p?.first_name_en ?? ""} ${p?.last_name_en ?? ""}`.trim();
              return (
                <div key={r.id} className="flex items-center gap-4 p-4">
                  <FileText className="size-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{name} <span className="text-xs text-muted-foreground">#{p?.patient_code}</span></div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.visit_date, lang)} · {r.medical_specialties ? (lang === "ar" ? r.medical_specialties.name_ar : r.medical_specialties.name_en) : "—"}</div>
                  </div>
                  <Badge variant="outline">{t(("visit_" + r.visit_type) as any) ?? r.visit_type}</Badge>
                  <Badge variant="outline" className={r.status === "completed" ? "status-completed" : r.status === "reviewed" ? "status-progress" : "status-cancelled"}>{r.status}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}