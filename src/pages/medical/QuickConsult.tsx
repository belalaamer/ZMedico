import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDataSync, notifyDataChange } from "@/lib/dataSync";

export default function QuickConsult() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const nav = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [form, setForm] = useState({ patient_id: "", specialty_id: "", visit_type: "consultation", chief_complaint_ar: "", chief_complaint_en: "", notes_ar: "", notes_en: "" });
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(() => {
    supabase.from("patients")
      .select("id,first_name_en,last_name_en,patient_code")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setPatients(data ?? []));
  }, []);

  useEffect(() => {
    loadPatients();
    supabase.from("medical_specialties").select("*").eq("is_active", true).order("name_en").then(({ data }) => setSpecs(data ?? []));
  }, [loadPatients]);

  useDataSync(["patients"], () => loadPatients());

  const save = async (status: "draft" | "completed") => {
    if (!form.patient_id) return toast.error(t("selectPatient"));
    setSaving(true);
    const { data, error } = await supabase.from("medical_records").insert({
      patient_id: form.patient_id, branch_id: currentBranchId, doctor_id: user?.id ?? null,
      specialty_id: form.specialty_id || null, visit_type: form.visit_type as any,
      chief_complaint_ar: form.chief_complaint_ar || null, chief_complaint_en: form.chief_complaint_en || null,
      notes_ar: form.notes_ar || null, notes_en: form.notes_en || null, status,
    } as any).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("save"));
    notifyDataChange("medical_records");
    nav(`/medical/records`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("quickConsult")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("quickConsultIntro")}</p>
      </div>
      <Card className="p-6 shadow-card space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2"><Label>{t("patientName")}</Label>
            <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("selectPatient")} /></SelectTrigger>
              <SelectContent>{patients.map((p) => <SelectItem key={p.id} value={p.id}>#{p.patient_code} · {p.first_name_en} {p.last_name_en ?? ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>{t("specialty")}</Label>
            <Select value={form.specialty_id || "none"} onValueChange={(v) => setForm({ ...form, specialty_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— {t("none")} —</SelectItem>
                {specs.map((s) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>{t("visitType")}</Label>
            <Select value={form.visit_type} onValueChange={(v) => setForm({ ...form, visit_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">{t("visitConsultation")}</SelectItem>
                <SelectItem value="follow_up">{t("visitFollowUp")}</SelectItem>
                <SelectItem value="procedure">{t("visitProcedure")}</SelectItem>
                <SelectItem value="emergency">{t("visitEmergency")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>{t("chiefComplaint")} (EN)</Label><Textarea value={form.chief_complaint_en} onChange={(e) => setForm({ ...form, chief_complaint_en: e.target.value })} maxLength={1000} rows={2} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>{t("chiefComplaint")} (AR)</Label><Textarea dir="rtl" value={form.chief_complaint_ar} onChange={(e) => setForm({ ...form, chief_complaint_ar: e.target.value })} maxLength={1000} rows={2} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>{t("notes")} (EN)</Label><Textarea value={form.notes_en} onChange={(e) => setForm({ ...form, notes_en: e.target.value })} maxLength={2000} rows={3} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>{t("notes")} (AR)</Label><Textarea dir="rtl" value={form.notes_ar} onChange={(e) => setForm({ ...form, notes_ar: e.target.value })} maxLength={2000} rows={3} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => save("draft")} disabled={saving}>{t("saveAsDraft")}</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => save("completed")} disabled={saving}>{t("markCompleted")}</Button>
        </div>
      </Card>
    </div>
  );
}