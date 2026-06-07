import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDataSync, notifyDataChange } from "@/lib/dataSync";
import { formatDate } from "@/lib/format";

export default function QuickConsult() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const { user } = useAuth();
  const nav = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [form, setForm] = useState({
    patient_id: "", specialty_id: "", visit_type: "consultation",
    chief_complaint_en: "", present_illness_en: "", physical_exam_en: "",
    bp_sys: "", bp_dia: "", pulse: "", temp: "", weight: "", height: "",
  });
  const [saving, setSaving] = useState(false);
  const [ctx, setCtx] = useState<{ lastVisit: any | null; diagnoses: any[] }>({ lastVisit: null, diagnoses: [] });

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

  // Load read-only context when a patient is picked
  useEffect(() => {
    if (!form.patient_id) { setCtx({ lastVisit: null, diagnoses: [] }); return; }
    let active = true;
    (async () => {
      const { data: visits } = await supabase
        .from("medical_records")
        .select("id,visit_date,chief_complaint_en,chief_complaint_ar,medical_specialties(name_en,name_ar)")
        .eq("patient_id", form.patient_id)
        .order("visit_date", { ascending: false })
        .limit(1);
      const { data: dx } = await supabase
        .from("record_diagnoses")
        .select("id,created_at,diagnoses(code,name_en,name_ar),medical_records!inner(patient_id)")
        .eq("medical_records.patient_id", form.patient_id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!active) return;
      setCtx({ lastVisit: visits?.[0] ?? null, diagnoses: dx ?? [] });
    })();
    return () => { active = false; };
  }, [form.patient_id]);

  const bmi = useMemo(() => {
    const w = Number(form.weight), h = Number(form.height);
    return w > 0 && h > 0 ? +((w / Math.pow(h / 100, 2)).toFixed(1)) : null;
  }, [form.weight, form.height]);

  const persist = async (status: "draft" | "completed"): Promise<string | null> => {
    if (!form.patient_id) return toast.error(t("selectPatient"));
    setSaving(true);
    const { data: rec, error } = await supabase.from("medical_records").insert({
      patient_id: form.patient_id, branch_id: currentBranchId, doctor_id: user?.id ?? null,
      specialty_id: form.specialty_id || null, visit_type: form.visit_type as any,
      chief_complaint_en: form.chief_complaint_en || null,
      chief_complaint_ar: form.chief_complaint_en || null,
      present_illness_en: form.present_illness_en || null,
      present_illness_ar: form.present_illness_en || null,
      notes_en: form.physical_exam_en || null,
      notes_ar: form.physical_exam_en || null,
      status,
    } as any).select("id").single();
    if (error || !rec) { setSaving(false); toast.error(error?.message ?? "error"); return null; }

    const vp: any = {
      patient_id: form.patient_id, medical_record_id: rec.id, recorded_by: user?.id ?? null,
    };
    let hasVital = false;
    if (form.bp_sys) { vp.blood_pressure_systolic = Number(form.bp_sys); hasVital = true; }
    if (form.bp_dia) { vp.blood_pressure_diastolic = Number(form.bp_dia); hasVital = true; }
    if (form.pulse) { vp.heart_rate = Number(form.pulse); hasVital = true; }
    if (form.temp) { vp.temperature = Number(form.temp); hasVital = true; }
    if (form.weight) { vp.weight = Number(form.weight); hasVital = true; }
    if (form.height) { vp.height = Number(form.height); hasVital = true; }
    if (bmi != null) { vp.bmi = bmi; hasVital = true; }
    if (hasVital) {
      const { error: vErr } = await supabase.from("vital_signs").insert(vp);
      if (vErr) toast.error(vErr.message);
    }

    setSaving(false);
    toast.success(t("save"));
    notifyDataChange("medical_records");
    return rec.id;
  };

  const saveAndStay = async () => {
    const id = await persist("completed");
    if (id) nav("/medical/records");
  };
  const saveAndOpen = async () => {
    const id = await persist("draft");
    if (id) nav(`/medical/records/${id}`);
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
            <Combobox
              value={form.patient_id}
              onChange={(v) => setForm({ ...form, patient_id: v })}
              options={patients.map((p) => ({
                value: p.id,
                label: `#${p.patient_code} · ${p.first_name_en} ${p.last_name_en ?? ""}`.trim(),
              }))}
              placeholder={t("selectPatient")}
              searchPlaceholder={lang === "ar" ? "ابحث عن مريض..." : "Search patient..."}
            />
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
        </div>

        {/* Read-only context */}
        {form.patient_id && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t("lastVisitSummary")}</div>
              {ctx.lastVisit ? (
                <div className="truncate">
                  {formatDate(ctx.lastVisit.visit_date, lang)} · {ctx.lastVisit.chief_complaint_en || ctx.lastVisit.chief_complaint_ar || t("consultation")}
                  {ctx.lastVisit.medical_specialties && <> · {lang === "ar" ? ctx.lastVisit.medical_specialties.name_ar : ctx.lastVisit.medical_specialties.name_en}</>}
                </div>
              ) : <div className="text-muted-foreground">{t("noPriorVisits")}</div>}
            </div>
            {ctx.diagnoses.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("recentDiagnoses")}</div>
                <div className="flex flex-wrap gap-1">
                  {ctx.diagnoses.map((d) => d.diagnoses && (
                    <Badge key={d.id} variant="outline" className="text-xs">
                      {d.diagnoses.code ? `${d.diagnoses.code} · ` : ""}{lang === "ar" ? (d.diagnoses.name_ar ?? d.diagnoses.name_en) : d.diagnoses.name_en}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vitals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>{t("bloodPressure")} (mmHg)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" placeholder="120" value={form.bp_sys} onChange={(e) => setForm({ ...form, bp_sys: e.target.value })} />
              <span>/</span>
              <Input type="number" placeholder="80" value={form.bp_dia} onChange={(e) => setForm({ ...form, bp_dia: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5"><Label>{t("pulse")} (bpm)</Label><Input type="number" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("temperature")} (°C)</Label><Input type="number" step="0.1" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("weight")} (kg)</Label><Input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("height")} (cm)</Label><Input type="number" step="0.1" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("bmi")}</Label><Input value={bmi ?? ""} readOnly className="bg-muted/40" /></div>
        </div>

        <div className="space-y-2"><Label>{t("chiefComplaint")}</Label><Textarea value={form.chief_complaint_en} onChange={(e) => setForm({ ...form, chief_complaint_en: e.target.value })} maxLength={1000} rows={2} /></div>
        <div className="space-y-2"><Label>{t("presentIllness")}</Label><Textarea value={form.present_illness_en} onChange={(e) => setForm({ ...form, present_illness_en: e.target.value })} maxLength={2000} rows={3} /></div>
        <div className="space-y-2"><Label>{t("physicalExam")}</Label><Textarea value={form.physical_exam_en} onChange={(e) => setForm({ ...form, physical_exam_en: e.target.value })} maxLength={2000} rows={3} /></div>

        <div className="flex justify-end gap-2 pt-2 flex-wrap">
          <Button variant="outline" onClick={saveAndStay} disabled={saving}>{t("saveQuickConsult")}</Button>
          <Button className="gradient-primary text-primary-foreground" onClick={saveAndOpen} disabled={saving}>{t("openFullRecord")}</Button>
        </div>
      </Card>
    </div>
  );
}