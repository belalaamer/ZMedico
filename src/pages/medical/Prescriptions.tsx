import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pill } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { RowActions } from "@/components/RowActions";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { patientDisplayName, patientDisplayDirection } from "@/lib/patientName";
import { useAuthorization } from "@/lib/authz/useAuthorization";

export default function Prescriptions() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const navigate = useNavigate();
  const { authz } = useAuthorization("Prescriptions");
  const canEdit = authz.can("medical_records.edit");
  const canDelete = authz.can("medical_records.delete");
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const load = () => {
    // `prescriptions` has no branch_id column, so branch scope is derived
    // through the parent medical record — the same indirection the
    // RESTRICTIVE RLS policy uses via user_has_branch_access_via_medical_record.
    // The inner join also keeps orphan rows (medical_record_id IS NULL) out
    // of the list, matching the hardened server-side policy.
    let q = supabase.from("prescriptions")
      .select("*, patients(first_name_en,last_name_en,first_name_ar,last_name_ar,name_language,patient_code), medical_records!inner(branch_id)")
      .is("deleted_at", null);
    if (currentBranchId) q = q.eq("medical_records.branch_id", currentBranchId);
    q.order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setItems(data ?? []));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const softDelete = async (rx: any): Promise<void> => {
    const { error } = await supabase.from("prescriptions").update({ deleted_at: new Date().toISOString() } as any).eq("id", rx.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  // NOTE: patient_code is still included in the search filter below (so
  // searching by clinic number keeps working) even though it's no longer
  // shown as a visible badge in the row -- per the UX fix, the number should
  // only be *displayed* on the main Patients list, not here.
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
              const name = patientDisplayName(p, lang);
              const nameDirection = patientDisplayDirection(p, lang);
              return (
                <div key={rx.id} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                  <Link to={`/medical/prescriptions/${rx.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <Pill className="size-5 text-primary"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" dir={nameDirection}>{name}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(rx.prescription_date, lang)}</div>
                  </div>
                  <Badge variant="outline" className={rx.status === "active" ? "status-progress" : rx.status === "completed" ? "status-completed" : "status-cancelled"}>{rx.status === "active" ? t("activeRx") : rx.status === "completed" ? t("completed") : t("discontinued")}</Badge>
                  </Link>
                  {(canEdit || canDelete) ? (
                    <RowActions
                      onEdit={() => navigate(`/medical/prescriptions/${rx.id}`)}
                      onDelete={() => softDelete(rx)}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
