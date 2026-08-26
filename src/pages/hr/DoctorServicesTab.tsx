import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Kind = "service" | "procedure";
type Option = { id: string; name_en: string | null; name_ar: string | null };

export default function DoctorServicesTab({ doctorId }: { doctorId: string }) {
  const { lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [kind, setKind] = useState<Kind>("service");
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedByKind, setSelectedByKind] = useState<Record<Kind, string[]>>({ service: [], procedure: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!currentBranchId || !doctorId) { setLoading(false); return; }
    setLoading(true);
    const [catalog, assignments] = await Promise.all([
      kind === "service"
        ? supabase.from("services").select("id,name_en,name_ar").eq("is_active", true).is("deleted_at", null).order("name_en").limit(300)
        : supabase.from("procedures").select("id,name_en,name_ar").eq("is_active", true).is("deleted_at", null).order("name_en").limit(300),
      (supabase as any).from("doctor_service_assignments").select("service_id,service_kind").eq("doctor_id", doctorId).eq("branch_id", currentBranchId).eq("service_kind", kind),
    ]);
    if (catalog.error) toast.error(catalog.error.message);
    if (assignments.error) toast.error(assignments.error.message);
    setOptions((catalog.data ?? []) as Option[]);
    setSelectedByKind((current) => ({ ...current, [kind]: ((assignments.data ?? []) as { service_id: string }[]).map((row) => row.service_id) }));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [doctorId, currentBranchId, kind]);

  const selected = useMemo(() => new Set(selectedByKind[kind]), [selectedByKind, kind]);
  const toggle = (id: string) => {
    setSelectedByKind((current) => {
      const next = new Set(current[kind]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...current, [kind]: Array.from(next) };
    });
  };

  const save = async () => {
    if (!currentBranchId) { toast.error(lang === "ar" ? "اختر الفرع أولًا" : "Choose a branch first"); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_doctor_service_assignments", {
      p_doctor_id: doctorId,
      p_branch_id: currentBranchId,
      p_service_ids: selectedByKind[kind],
      p_service_kind: kind,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حفظ خدمات الطبيب" : "Doctor services saved");
    await load();
  };

  return (
    <Card className="p-5 shadow-card space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold">{lang === "ar" ? "الخدمات التي يقدمها الطبيب" : "Services this doctor provides"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "ستظهر هذه الخدمات فقط عند اختيار الطبيب في الحجز. إذا لم تحدد أي خدمة، يظل الطبيب متاحًا للخدمات غير المهيأة للحفاظ على التوافق." : "These assignments filter the doctor list during booking. If no assignments exist for a service, the legacy behavior keeps all branch doctors eligible."}</p>
        </div>
        <div className="w-40">
          <Label className="text-xs">{lang === "ar" ? "نوع الكتالوج" : "Catalog type"}</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="service">{lang === "ar" ? "الخدمات" : "Services"}</SelectItem>
              <SelectItem value="procedure">{lang === "ar" ? "الإجراءات" : "Procedures"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <div className="py-8 text-center text-sm text-muted-foreground">…</div> : options.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد عناصر نشطة من هذا النوع." : "No active items of this type."}</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${selected.has(option.id) ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
              <input type="checkbox" checked={selected.has(option.id)} onChange={() => toggle(option.id)} className="mt-0.5" />
              <span>{lang === "ar" ? option.name_ar || option.name_en : option.name_en || option.name_ar}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">{selected.size} {lang === "ar" ? "مختار" : "selected"}</p>
        <Button onClick={save} disabled={loading || saving}>{saving ? "…" : (lang === "ar" ? "حفظ الخدمات" : "Save services")}</Button>
      </div>
    </Card>
  );
}
