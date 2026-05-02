import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Activity, FileText, Edit3, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export default function PatientMedicalTab({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [history, setHistory] = useState<any | null>(null);
  const [vitals, setVitals] = useState<any | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [docFilter, setDocFilter] = useState<string>("all");
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: v }, { data: r }, { data: d }] = await Promise.all([
      supabase.from("medical_history").select("*").eq("patient_id", patientId).maybeSingle(),
      supabase.from("vital_signs").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false }).limit(1),
      supabase.from("medical_records").select("*, medical_specialties(name_en,name_ar), profiles(full_name)").eq("patient_id", patientId).order("visit_date", { ascending: false }).limit(50),
      supabase.from("patient_documents").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(60),
    ]);
    setHistory(h); setVitals(v?.[0] ?? null); setRecords(r ?? []); setDocs(d ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patientId]);

  const filteredDocs = docFilter === "all" ? docs : docs.filter((d) => d.document_type === docFilter);

  return (
    <div className="space-y-4">
      {/* History */}
      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="size-4"/>{t("medicalHistory")}</h3>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit3 className="me-2 size-3.5"/>{t("edit")}</Button>
        </div>
        {!history ? <div className="text-sm text-muted-foreground">{t("noHistory")}</div> : (
          <div className="space-y-2 text-sm">
            {history.has_allergies && (history.allergies_en || history.allergies_ar) && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-xs font-semibold text-destructive uppercase mb-1">{t("allergies")}</div>
                <div>{lang === "ar" ? history.allergies_ar : history.allergies_en}</div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              {history.has_diabetes && <Badge variant="outline" className="status-review">{t("diabetes")}</Badge>}
              {history.has_hypertension && <Badge variant="outline" className="status-review">{t("hypertension")}</Badge>}
              {history.has_heart_disease && <Badge variant="outline" className="status-cancelled">{t("heartDisease")}</Badge>}
              {history.has_bleeding_disorder && <Badge variant="outline" className="status-cancelled">{t("bleedingDisorder")}</Badge>}
              {history.is_pregnant && <Badge variant="outline" className="status-progress">{t("pregnant")}</Badge>}
            </div>
            {(history.current_medications_en || history.current_medications_ar) && (
              <div><div className="text-xs text-muted-foreground">{t("currentMedications")}</div><div>{lang === "ar" ? history.current_medications_ar : history.current_medications_en}</div></div>
            )}
            {(history.previous_surgeries_en || history.previous_surgeries_ar) && (
              <div><div className="text-xs text-muted-foreground">{t("previousSurgeries")}</div><div>{lang === "ar" ? history.previous_surgeries_ar : history.previous_surgeries_en}</div></div>
            )}
            {(history.family_history_en || history.family_history_ar) && (
              <div><div className="text-xs text-muted-foreground">{t("familyHistory")}</div><div>{lang === "ar" ? history.family_history_ar : history.family_history_en}</div></div>
            )}
          </div>
        )}
      </Card>

      <HistoryDialog open={editing} onOpenChange={setEditing} patientId={patientId} userId={user?.id} initial={history} onSaved={() => { setEditing(false); load(); }} />

      {/* Latest vitals */}
      <Card className="p-5 shadow-card">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity className="size-4"/>{t("latestVitals")}</h3>
        {!vitals ? <div className="text-sm text-muted-foreground">{t("noVitals")}</div> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
            {[
              ["bloodPressure", vitals.blood_pressure_systolic ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}` : "—"],
              ["heartRate", vitals.heart_rate ?? "—"],
              ["temperature", vitals.temperature ?? "—"],
              ["bmi", vitals.bmi ?? "—"],
              ["weight", vitals.weight ?? "—"],
              ["height", vitals.height ?? "—"],
              ["bloodOxygen", vitals.blood_oxygen ?? "—"],
              ["bloodSugar", vitals.blood_sugar ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{t(k as any)}</div>
                <div className="font-bold tabular-nums">{v as any}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground">{vitals ? formatDate(vitals.recorded_at, lang) : ""}</div>
      </Card>

      {/* Visits timeline */}
      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{t("visitsTimeline")}</h3>
          <Button asChild size="sm"><Link to="/medical/quick-consult"><Plus className="me-2 size-3.5"/>{t("addRecord")}</Link></Button>
        </div>
        {records.length === 0 ? <div className="text-sm text-muted-foreground">{t("noVisits")}</div> : (
          <div className="space-y-2">
            {records.map((r) => (
              <Link key={r.id} to={`/medical/records/${r.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40">
                <FileText className="size-4 text-muted-foreground"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.chief_complaint_en || r.chief_complaint_ar || t("consultation")}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(r.visit_date, lang)} · {r.medical_specialties ? (lang === "ar" ? r.medical_specialties.name_ar : r.medical_specialties.name_en) : "—"} {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}</div>
                </div>
                <Badge variant="outline" className={r.status === "completed" ? "status-completed" : r.status === "reviewed" ? "status-progress" : "status-cancelled"}>{r.status === "draft" ? t("statusDraft") : r.status === "completed" ? t("statusCompleted") : t("statusReviewed")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Documents */}
      <Card className="p-5 shadow-card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold">{t("documentsGallery")}</h3>
          <select value={docFilter} onChange={(e) => setDocFilter(e.target.value)} className="text-sm border border-border bg-background rounded-md px-2 py-1">
            <option value="all">{t("filterAll")}</option>
            <option value="lab_result">{t("docLabResult")}</option>
            <option value="xray">{t("docXray")}</option>
            <option value="mri">{t("docMri")}</option>
            <option value="ct_scan">{t("docCt")}</option>
            <option value="report">{t("docReport")}</option>
            <option value="other">{t("docOther")}</option>
          </select>
        </div>
        {filteredDocs.length === 0 ? <div className="text-sm text-muted-foreground">{t("noDocuments")}</div> : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredDocs.map((d) => (
              <button key={d.id} onClick={async () => {
                const { data } = await supabase.storage.from("patient-docs").createSignedUrl(d.file_url, 3600);
                if (data?.signedUrl) window.open(data.signedUrl, "_blank");
              }} className="text-start p-3 rounded-lg border border-border hover:bg-muted/40 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><FileText className="size-5"/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{lang === "ar" ? d.title_ar : d.title_en}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(d.created_at, lang)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function HistoryDialog({ open, onOpenChange, patientId, userId, initial, onSaved }: any) {
  const { t } = useI18n();
  const [f, setF] = useState<any>(() => initial ?? {});
  useEffect(() => { setF(initial ?? {}); }, [initial, open]);

  const save = async () => {
    const payload: any = {
      patient_id: patientId, last_updated_by: userId,
      has_allergies: !!f.has_allergies, allergies_en: f.allergies_en || null, allergies_ar: f.allergies_ar || null,
      has_diabetes: !!f.has_diabetes, has_hypertension: !!f.has_hypertension, has_heart_disease: !!f.has_heart_disease,
      has_bleeding_disorder: !!f.has_bleeding_disorder, is_pregnant: !!f.is_pregnant,
      pregnancy_due_date: f.pregnancy_due_date || null,
      current_medications_en: f.current_medications_en || null, current_medications_ar: f.current_medications_ar || null,
      previous_surgeries_en: f.previous_surgeries_en || null, previous_surgeries_ar: f.previous_surgeries_ar || null,
      family_history_en: f.family_history_en || null, family_history_ar: f.family_history_ar || null,
      notes_en: f.notes_en || null, notes_ar: f.notes_ar || null,
    };
    let error;
    if (initial?.id) {
      const r = await supabase.from("medical_history").update(payload).eq("id", initial.id);
      error = r.error;
    } else {
      const r = await supabase.from("medical_history").insert(payload);
      error = r.error;
    }
    if (error) return toast.error(error.message);
    toast.success(t("save")); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("medicalHistory")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["has_allergies", "allergies"], ["has_diabetes", "diabetes"], ["has_hypertension", "hypertension"],
              ["has_heart_disease", "heartDisease"], ["has_bleeding_disorder", "bleedingDisorder"], ["is_pregnant", "pregnant"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 p-2 rounded-md border border-border">
                <Checkbox checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: !!v })} />
                <span className="text-sm">{t(label as any)}</span>
              </label>
            ))}
          </div>
          {f.has_allergies && (
            <div className="space-y-1.5"><Label>{t("allergies")}</Label><Textarea rows={2} value={f.allergies_en ?? ""} onChange={(e) => setF({ ...f, allergies_en: e.target.value, allergies_ar: e.target.value })}/></div>
          )}
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>{t("currentMedications")}</Label><Textarea rows={2} value={f.current_medications_en ?? ""} onChange={(e) => setF({ ...f, current_medications_en: e.target.value, current_medications_ar: e.target.value })}/></div>
            <div className="space-y-1.5"><Label>{t("previousSurgeries")}</Label><Textarea rows={2} value={f.previous_surgeries_en ?? ""} onChange={(e) => setF({ ...f, previous_surgeries_en: e.target.value, previous_surgeries_ar: e.target.value })}/></div>
            <div className="space-y-1.5"><Label>{t("familyHistory")}</Label><Textarea rows={2} value={f.family_history_en ?? ""} onChange={(e) => setF({ ...f, family_history_en: e.target.value, family_history_ar: e.target.value })}/></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button onClick={save} className="gradient-primary text-primary-foreground">{t("saveHistory")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}