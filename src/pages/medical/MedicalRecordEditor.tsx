import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Plus, Printer, Upload, FileText, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { generatePrescriptionPdf } from "@/lib/prescriptionPdf";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { logPhiAccess } from "@/lib/observability/phiAudit";

type Record = any;

function calcAge(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  // Bug fix: a future dob (data-entry error, or a misdated newborn record)
  // produced a negative diff and thus a negative age (e.g. "-1 years old")
  // rendered straight to the patient header. Clamp at 0.
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

export default function MedicalRecordEditor() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();

  const [record, setRecord] = useState<Record | null>(null);
  const [patient, setPatient] = useState<any>(null);
  const [specialty, setSpecialty] = useState<any>(null);
  const [specs, setSpecs] = useState<any[]>([]);
  const [vitals, setVitals] = useState<any[]>([]); // history
  const [diagnoses, setDiagnoses] = useState<any[]>([]); // record diagnoses with join
  const [dxCatalog, setDxCatalog] = useState<any[]>([]);
  const [procs, setProcs] = useState<any[]>([]);
  const [procCatalog, setProcCatalog] = useState<any[]>([]);
  const [rxList, setRxList] = useState<any[]>([]);
  const [rxItems, setRxItems] = useState<any[]>([]);
  const [medsCatalog, setMedsCatalog] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const phiLogged = useRef(false);

  const load = async () => {
    if (!id) return;
    const { data: r } = await supabase.from("medical_records").select("*").eq("id", id).maybeSingle();
    if (!r) { toast.error(t("noResults")); return; }
    setRecord(r);
    const [{ data: p }, { data: sp }, { data: vs }, { data: rd }, { data: rp }, { data: rx }, { data: dc }] = await Promise.all([
      supabase.from("patients").select("*").eq("id", r.patient_id).maybeSingle(),
      supabase.from("medical_specialties").select("*").eq("is_active", true).order("name_en"),
      supabase.from("vital_signs").select("*").eq("patient_id", r.patient_id).order("recorded_at", { ascending: false }).limit(20),
      supabase.from("record_diagnoses").select("*, diagnoses(*)").eq("medical_record_id", r.id),
      supabase.from("record_procedures").select("*, procedures(*)").eq("medical_record_id", r.id),
      supabase.from("prescriptions").select("*").eq("medical_record_id", r.id).order("created_at", { ascending: false }),
      supabase.from("patient_documents").select("*").eq("medical_record_id", r.id).order("created_at", { ascending: false }),
    ]);
    setPatient(p);
    setSpecs(sp ?? []);
    setSpecialty((sp ?? []).find((s) => s.id === r.specialty_id) ?? null);
    setVitals(vs ?? []);
    setDiagnoses(rd ?? []);
    setProcs(rp ?? []);
    setRxList(rx ?? []);
    setDocs(dc ?? []);
    if (rx && rx.length) {
      const { data: items } = await supabase.from("prescription_items").select("*, medications(*)").eq("prescription_id", rx[0].id);
      setRxItems(items ?? []);
    } else { setRxItems([]); }
    // Task B: log PHI access once after data arrives, guarded against re-fires.
    if (!phiLogged.current) {
      phiLogged.current = true;
      logPhiAccess("medical_record", r.id, { patientId: r.patient_id });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // catalogs once
  useEffect(() => {
    supabase.from("diagnoses").select("*").order("code").then(({ data }) => setDxCatalog(data ?? []));
    supabase.from("procedures").select("*").eq("is_active", true).order("name_en").then(({ data }) => setProcCatalog(data ?? []));
    supabase.from("medications").select("*").eq("is_active", true).order("name_en").then(({ data }) => setMedsCatalog(data ?? []));
  }, []);

  if (!record || !patient) return <div className="text-center text-muted-foreground py-10">…</div>;

  const patientName = patientDisplayName(patient, lang);
  const patientDirection = patientDisplayDirection(patient, lang);
  const age = calcAge(patient.dob);

  // ============ Overview save ============
  const updateRecord = async (patch: any) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("medical_records").update(patch).eq("id", record.id);
      if (error) throw error;
      toast.success(t("save"));
      setRecord({ ...record, ...patch });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/lock|immutab|only.*attending|attending.*doctor|not allowed to edit/i.test(msg)) {
        toast.error(
          lang === "ar"
            ? "هذا السجل مقفل. يُرجى التواصل مع المسؤول لإجراء تعديل."
            : "This record is locked. Please contact an admin for override.",
          {
            description: lang === "ar"
              ? "لا يمكن تعديل السجلات المكتملة إلا من قِبل الطبيب المعالج خلال فترة السماح."
              : "Completed records can only be edited by the attending doctor within the grace window.",
          }
        );
      } else {
        toast.error(msg || (lang === "ar" ? "تعذر الحفظ" : "Save failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/medical/records"><ArrowLeft className="me-2 size-4" />{t("backToRecords")}</Link></Button>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/medical/consultation/${record.id}`}>{lang === "ar" ? "عرض الاستشارة" : "Consultation view"}</Link>
          </Button>
          <Badge variant="outline">{t(("visit_" + record.visit_type) as any) ?? record.visit_type}</Badge>
          <Badge variant="outline" className={record.status === "completed" ? "status-completed" : record.status === "reviewed" ? "status-progress" : "status-cancelled"}>
            {record.status === "draft" ? t("statusDraft") : record.status === "completed" ? t("statusCompleted") : t("statusReviewed")}
          </Badge>
        </div>
      </div>

      {/* Patient header */}
      <Card className="p-5 shadow-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-14 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
            {patientName.slice(0,1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <Link to={`/patients/${patient.id}`} className="font-bold text-lg hover:underline" dir={patientDirection}>{patientName}</Link>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {age != null && <span>{age} {t("yearsOld")}</span>}
              {patient.gender && <span>{t(patient.gender as any)}</span>}
              {patient.phone && <span>{patient.phone}</span>}
            </div>
          </div>
          <div className="text-end text-xs text-muted-foreground">
            <div>{formatDate(record.visit_date, lang)}</div>
            {specialty && <div className="font-medium text-foreground">{lang === "ar" ? specialty.name_ar : specialty.name_en}</div>}
          </div>
        </div>
      </Card>

      {record.status !== "draft" && (
        <Card className="p-3 flex items-start gap-3 border-amber-500/30 bg-amber-500/5">
          <div className="text-amber-600 dark:text-amber-400 mt-0.5">⚠</div>
          <div className="text-sm">
            <div className="font-semibold text-amber-700 dark:text-amber-300">
              {lang === "ar" ? "سجل مقفل" : "Record locked"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "التعديلات مسموحة فقط للطبيب المعالج خلال فترة السماح. لتغييرات لاحقة تواصل مع المسؤول."
                : "Edits are limited to the attending doctor within the grace window. For later changes, contact an admin for override."}
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t("overviewTab")}</TabsTrigger>
          <TabsTrigger value="vitals">{t("vitalSigns")}</TabsTrigger>
          <TabsTrigger value="diagnoses">{t("diagnosesTab")}</TabsTrigger>
          <TabsTrigger value="procedures">{t("proceduresTab")}</TabsTrigger>
          <TabsTrigger value="prescription">{t("prescriptionTab")}</TabsTrigger>
          <TabsTrigger value="documents">{t("documentsTab")}</TabsTrigger>
          <TabsTrigger value="invoice">{t("invoiceTab")}</TabsTrigger>
        </TabsList>

        {/* ========= Overview ========= */}
        <TabsContent value="overview" className="mt-4">
          <OverviewTab record={record} specs={specs} onSave={updateRecord} saving={saving} />
        </TabsContent>

        {/* ========= Vitals ========= */}
        <TabsContent value="vitals" className="mt-4">
          <VitalsTab record={record} patient={patient} vitals={vitals} userId={user?.id} reload={load} />
        </TabsContent>

        {/* ========= Diagnoses ========= */}
        <TabsContent value="diagnoses" className="mt-4">
          <DiagnosesTab record={record} catalog={dxCatalog} items={diagnoses} reload={load} />
        </TabsContent>

        {/* ========= Procedures ========= */}
        <TabsContent value="procedures" className="mt-4">
          <ProceduresTab record={record} specialty={specialty} catalog={procCatalog} items={procs} reload={load} userId={user?.id} />
        </TabsContent>

        {/* ========= Prescription ========= */}
        <TabsContent value="prescription" className="mt-4">
          <PrescriptionTab record={record} patient={patient} catalog={medsCatalog} rxList={rxList} rxItems={rxItems} reload={load} userId={user?.id} />
        </TabsContent>

        {/* ========= Documents ========= */}
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab record={record} patient={patient} docs={docs} reload={load} userId={user?.id} />
        </TabsContent>

        {/* ========= Invoice Preview ========= */}
        <TabsContent value="invoice" className="mt-4">
          <InvoicePreviewTab record={record} patient={patient} procs={procs} nav={nav} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================ Overview Tab */
function OverviewTab({ record, specs, onSave, saving }: any) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState({
    visit_type: record.visit_type, visit_date: record.visit_date, follow_up_date: record.follow_up_date ?? "",
    specialty_id: record.specialty_id ?? "",
    chief_complaint_en: record.chief_complaint_en ?? "", chief_complaint_ar: record.chief_complaint_ar ?? "",
    present_illness_en: record.present_illness_en ?? "", present_illness_ar: record.present_illness_ar ?? "",
    notes_en: record.notes_en ?? "", notes_ar: record.notes_ar ?? "",
    status: record.status,
  });

  return (
    <Card className="p-6 shadow-card space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>{t("visitDate")}</Label><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>{t("visitType")}</Label>
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
        <div className="space-y-1.5"><Label>{t("specialty")}</Label>
          <Select value={form.specialty_id || "none"} onValueChange={(v) => setForm({ ...form, specialty_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— {t("none")} —</SelectItem>
              {specs.map((s: any) => <SelectItem key={s.id} value={s.id}>{lang === "ar" ? s.name_ar : s.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t("status")}</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("statusDraft")}</SelectItem>
              <SelectItem value="completed">{t("statusCompleted")}</SelectItem>
              <SelectItem value="reviewed">{t("statusReviewed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>{t("followUpDate")}</Label><Input type="date" value={form.follow_up_date ?? ""} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} /></div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>{t("chiefComplaint")} (EN)</Label><Textarea value={form.chief_complaint_en} onChange={(e) => setForm({ ...form, chief_complaint_en: e.target.value })} rows={2} maxLength={1000}/></div>
        <div className="space-y-1.5"><Label>{t("chiefComplaint")} (AR)</Label><Textarea dir="rtl" value={form.chief_complaint_ar} onChange={(e) => setForm({ ...form, chief_complaint_ar: e.target.value })} rows={2} maxLength={1000}/></div>
        <div className="space-y-1.5"><Label>{t("presentIllness")} (EN)</Label><Textarea value={form.present_illness_en} onChange={(e) => setForm({ ...form, present_illness_en: e.target.value })} rows={4} maxLength={2000}/></div>
        <div className="space-y-1.5"><Label>{t("presentIllness")} (AR)</Label><Textarea dir="rtl" value={form.present_illness_ar} onChange={(e) => setForm({ ...form, present_illness_ar: e.target.value })} rows={4} maxLength={2000}/></div>
        <div className="space-y-1.5"><Label>{t("notes")} (EN)</Label><Textarea value={form.notes_en} onChange={(e) => setForm({ ...form, notes_en: e.target.value })} rows={3} maxLength={2000}/></div>
        <div className="space-y-1.5"><Label>{t("notes")} (AR)</Label><Textarea dir="rtl" value={form.notes_ar} onChange={(e) => setForm({ ...form, notes_ar: e.target.value })} rows={3} maxLength={2000}/></div>
      </div>

      <div className="flex justify-end pt-2">
        <Button className="gradient-primary text-primary-foreground" onClick={() => onSave({
          ...form, follow_up_date: form.follow_up_date || null, specialty_id: form.specialty_id || null,
        })} disabled={saving}><Save className="me-2 size-4"/>{t("saveChanges")}</Button>
      </div>
    </Card>
  );
}

/* ============================================================ Vitals Tab */
function VitalsTab({ record, patient, vitals, userId, reload }: any) {
  const { t, lang } = useI18n();
  const previous = vitals[0];
  const [form, setForm] = useState({
    blood_pressure_systolic: "", blood_pressure_diastolic: "", heart_rate: "", temperature: "",
    weight: "", height: "", blood_oxygen: "", respiratory_rate: "", blood_sugar: "", notes: "",
  });
  const bmi = useMemo(() => {
    const w = Number(form.weight), h = Number(form.height);
    return w > 0 && h > 0 ? +((w / Math.pow(h/100, 2)).toFixed(2)) : null;
  }, [form.weight, form.height]);

  const fields: Array<[string, string, string, string]> = [
    ["bloodPressure", "blood_pressure_systolic", "mmHg", "/ blood_pressure_diastolic"],
    ["heartRate", "heart_rate", "bpm", ""],
    ["temperature", "temperature", "°C", ""],
    ["weight", "weight", "kg", ""],
    ["height", "height", "cm", ""],
    ["bloodOxygen", "blood_oxygen", "%", ""],
    ["respiratoryRate", "respiratory_rate", "/min", ""],
    ["bloodSugar", "blood_sugar", "mg/dL", ""],
  ];

  const save = async () => {
    const payload: any = {
      patient_id: patient.id, medical_record_id: record.id, recorded_by: userId,
      notes: form.notes || null,
    };
    [["blood_pressure_systolic","int"],["blood_pressure_diastolic","int"],["heart_rate","int"],["blood_oxygen","int"],["respiratory_rate","int"],
     ["temperature","num"],["weight","num"],["height","num"],["blood_sugar","num"]].forEach(([k]) => {
      const v = (form as any)[k];
      if (v !== "" && v != null) payload[k] = Number(v);
    });
    const { error } = await supabase.from("vital_signs").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save"));
    setForm({ blood_pressure_systolic: "", blood_pressure_diastolic: "", heart_rate: "", temperature: "", weight: "", height: "", blood_oxygen: "", respiratory_rate: "", blood_sugar: "", notes: "" });
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 shadow-card space-y-4">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label>{t("bloodPressure")} (mmHg)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" placeholder="120" value={form.blood_pressure_systolic} onChange={(e) => setForm({ ...form, blood_pressure_systolic: e.target.value })}/>
              <span>/</span>
              <Input type="number" placeholder="80" value={form.blood_pressure_diastolic} onChange={(e) => setForm({ ...form, blood_pressure_diastolic: e.target.value })}/>
            </div>
            {previous?.blood_pressure_systolic && <div className="text-xs text-muted-foreground">{t("previousValue")}: {previous.blood_pressure_systolic}/{previous.blood_pressure_diastolic}</div>}
          </div>
          {fields.slice(1).map(([key, prop, unit]) => (
            <div key={prop} className="space-y-1.5">
              <Label>{t(key as any)} <span className="text-xs text-muted-foreground">({unit})</span></Label>
              <Input type="number" step="any" value={(form as any)[prop]} onChange={(e) => setForm({ ...form, [prop]: e.target.value } as any)}/>
              {previous?.[prop] != null && <div className="text-xs text-muted-foreground">{t("previousValue")}: {previous[prop]}</div>}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>{t("bmi")}</Label>
            <Input value={bmi ?? ""} readOnly className="bg-muted/40" />
            {previous?.bmi != null && <div className="text-xs text-muted-foreground">{t("previousValue")}: {previous.bmi}</div>}
          </div>
        </div>
        <div className="space-y-1.5"><Label>{t("notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></div>
        <div className="flex justify-end"><Button className="gradient-primary text-primary-foreground" onClick={save}><Save className="me-2 size-4"/>{t("saveVitals")}</Button></div>
      </Card>

      {vitals.length > 0 && (
        <Card className="shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr><th className="p-2 text-start">{t("history")}</th><th className="p-2">BP</th><th className="p-2">HR</th><th className="p-2">T°</th><th className="p-2">Wt</th><th className="p-2">Ht</th><th className="p-2">BMI</th><th className="p-2">SpO2</th><th className="p-2">RR</th><th className="p-2">Sugar</th></tr>
            </thead>
            <tbody>
              {vitals.map((v: any) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="p-2 text-xs">{formatDate(v.recorded_at, lang)}</td>
                  <td className="p-2 text-center tabular-nums">{v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.heart_rate ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.temperature ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.weight ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.height ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.bmi ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.blood_oxygen ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.respiratory_rate ?? "—"}</td>
                  <td className="p-2 text-center tabular-nums">{v.blood_sugar ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ============================================================ Diagnoses Tab */
function DiagnosesTab({ record, catalog, items, reload }: any) {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");
  const [primary, setPrimary] = useState(false);
  const [notes, setNotes] = useState("");
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return [];
    return catalog.filter((d: any) =>
      d.code.toLowerCase().includes(s) || d.name_en.toLowerCase().includes(s) || (d.name_ar ?? "").includes(s)
    ).slice(0, 10);
  }, [search, catalog]);

  const add = async (d: any) => {
    const { error } = await supabase.from("record_diagnoses").insert({
      medical_record_id: record.id, diagnosis_id: d.id, is_primary: primary, notes_en: notes || null,
    });
    if (error) return toast.error(error.message);
    setSearch(""); setPrimary(false); setNotes("");
    reload();
  };
  const remove = async (rdId: string) => {
    await supabase.from("record_diagnoses").delete().eq("id", rdId);
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1.5"><Label>{t("selectDiagnosis")}</Label>
            <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>{t("notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300}/></div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="prim" checked={primary} onCheckedChange={(v) => setPrimary(!!v)} />
          <Label htmlFor="prim" className="text-sm">{t("primaryDiagnosis")}</Label>
        </div>
        {filtered.length > 0 && (
          <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
            {filtered.map((d: any) => (
              <button key={d.id} onClick={() => add(d)} className="flex items-center gap-3 w-full p-2.5 text-start hover:bg-muted/50 border-b border-border last:border-0">
                <Badge variant="outline" className="font-mono text-[10px]">{d.code}</Badge>
                <span className="flex-1 text-sm">{lang === "ar" ? d.name_ar : d.name_en}</span>
                <Plus className="size-4 text-primary" />
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noResults")}</div> : (
          <div className="divide-y divide-border">
            {items.map((rd: any) => (
              <div key={rd.id} className="flex items-center gap-3 p-3">
                <Badge variant="outline" className="font-mono text-[10px]">{rd.diagnoses?.code}</Badge>
                {rd.is_primary && <Badge className="status-completed text-[10px]">{t("primary")}</Badge>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{lang === "ar" ? rd.diagnoses?.name_ar : rd.diagnoses?.name_en}</div>
                  {rd.notes_en && <div className="text-xs text-muted-foreground truncate">{rd.notes_en}</div>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(rd.id)}><Trash2 className="size-4 text-destructive"/></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================ Procedures Tab */
function ProceduresTab({ record, specialty, catalog, items, reload, userId }: any) {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [tooth, setTooth] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const isDental = (specialty?.name_en ?? "").toLowerCase().includes("dent");

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return [];
    return catalog.filter((p: any) =>
      (p.code ?? "").toLowerCase().includes(s) || p.name_en.toLowerCase().includes(s) || (p.name_ar ?? "").includes(s)
    ).slice(0, 10);
  }, [search, catalog]);

  const add = async () => {
    if (!selected) return toast.error(t("selectProcedure"));
    const { error } = await supabase.from("record_procedures").insert({
      medical_record_id: record.id, procedure_id: selected.id,
      tooth_number: tooth || null, quantity: Number(qty) || 1, notes_en: notes || null,
      duration_minutes: selected.default_duration ?? null, performed_by: userId,
    });
    if (error) return toast.error(error.message);
    setSelected(null); setSearch(""); setTooth(""); setQty("1"); setNotes("");
    reload();
  };
  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from("record_procedures").delete().eq("id", id);
      if (error) throw error;
      reload();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/cannot delete.*procedure|already been billed|linked to.*invoice|paid.*invoice/i.test(msg)) {
        toast.error(
          lang === "ar"
            ? "لا يمكن حذف إجراء مرتبط بفاتورة مدفوعة"
            : "Cannot delete a procedure linked to a paid invoice",
          {
            description: lang === "ar"
              ? "قم بإلغاء الفاتورة أولاً أو تواصل مع المسؤول."
              : "Cancel or void the invoice first, or contact an admin.",
          }
        );
      } else if (/lock|immutab|attending.*doctor|not allowed/i.test(msg)) {
        toast.error(
          lang === "ar"
            ? "السجل مقفل — يُرجى التواصل مع المسؤول"
            : "Record is locked — contact an admin for override"
        );
      } else {
        toast.error(msg || (lang === "ar" ? "تعذر الحذف" : "Delete failed"));
      }
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card space-y-3">
        <div className="space-y-1.5"><Label>{t("selectProcedure")}</Label>
          <Input placeholder={t("searchPlaceholder")} value={selected ? (lang === "ar" ? selected.name_ar : selected.name_en) : search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} />
        </div>
        {!selected && filtered.length > 0 && (
          <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
            {filtered.map((p: any) => (
              <button key={p.id} onClick={() => { setSelected(p); setSearch(""); }} className="flex items-center gap-3 w-full p-2.5 text-start hover:bg-muted/50 border-b border-border last:border-0">
                {p.code && <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>}
                <span className="flex-1 text-sm">{lang === "ar" ? p.name_ar : p.name_en}</span>
                {p.default_price != null && <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(p.default_price, lang)}</span>}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="grid sm:grid-cols-3 gap-3">
            {isDental && <div className="space-y-1.5"><Label>{t("toothNumber")}</Label>
              <Input value={tooth} onChange={(e) => setTooth(e.target.value)} placeholder="e.g. 11" />
            </div>}
            <div className="space-y-1.5"><Label>{t("qty")}</Label><Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-3"><Label>{t("notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300}/></div>
            <div className="sm:col-span-3 flex justify-end"><Button onClick={add} className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4"/>{t("addToRecord")}</Button></div>
          </div>
        )}
      </Card>

      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noResults")}</div> : (
          <div className="divide-y divide-border">
            {items.map((rp: any) => (
              <div key={rp.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{lang === "ar" ? rp.procedures?.name_ar : rp.procedures?.name_en}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                    {rp.tooth_number && <span>{t("toothNumber")} {rp.tooth_number}</span>}
                    <span>x{rp.quantity}</span>
                    {rp.duration_minutes && <span>{rp.duration_minutes} {t("durationMin")}</span>}
                    {rp.procedures?.default_price != null && <span className="tabular-nums">{formatMoney(rp.procedures.default_price * rp.quantity, lang)}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(rp.id)}><Trash2 className="size-4 text-destructive"/></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================ Prescription Tab */
function PrescriptionTab({ record, patient, catalog, rxList, rxItems, reload, userId }: any) {
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ dosage: "", frequency: "", duration: "", quantity: "1", instructions_en: "" });

  const rx = rxList[0]; // active prescription for this record
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return [];
    return catalog.filter((m: any) =>
      m.name_en.toLowerCase().includes(s) || (m.name_ar ?? "").includes(s) || (m.generic_name ?? "").toLowerCase().includes(s)
    ).slice(0, 10);
  }, [search, catalog]);

  const ensureRx = async () => {
    if (rx) return rx.id;
    const { data, error } = await supabase.from("prescriptions").insert({
      patient_id: patient.id, doctor_id: userId, medical_record_id: record.id,
    } as any).select("id").single();
    if (error) { toast.error(error.message); return null; }
    return data.id;
  };

  const add = async () => {
    if (!selected) return toast.error(t("selectMedication"));
    const rxId = await ensureRx();
    if (!rxId) return;
    const { error } = await supabase.from("prescription_items").insert({
      prescription_id: rxId, medication_id: selected.id, dosage: form.dosage || null,
      frequency: form.frequency || null, duration: form.duration || null,
      quantity: Number(form.quantity) || 1, instructions_en: form.instructions_en || null,
    });
    if (error) return toast.error(error.message);
    setSelected(null); setSearch(""); setForm({ dosage: "", frequency: "", duration: "", quantity: "1", instructions_en: "" });
    reload();
  };
  const remove = async (id: string) => { await supabase.from("prescription_items").delete().eq("id", id); reload(); };

  const print = () => {
    if (!rx) return;
    generatePrescriptionPdf({ prescription: rx, items: rxItems, patient, doctorName: "", lang });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card space-y-3">
        <div className="space-y-1.5"><Label>{t("selectMedication")}</Label>
          <Input placeholder={t("searchPlaceholder")} value={selected ? (lang === "ar" ? selected.name_ar : selected.name_en) : search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} />
        </div>
        {!selected && filtered.length > 0 && (
          <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
            {filtered.map((m: any) => (
              <button key={m.id} onClick={() => { setSelected(m); setSearch(""); }} className="flex items-center gap-3 w-full p-2.5 text-start hover:bg-muted/50 border-b border-border last:border-0">
                <span className="flex-1 text-sm">{lang === "ar" ? m.name_ar : m.name_en}{m.strength ? ` · ${m.strength}` : ""}</span>
                <span className="text-xs text-muted-foreground">{m.dosage_form}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5"><Label>{t("dosage")}</Label><Input placeholder="500mg" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("frequency")}</Label><Input placeholder="3x/day" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("durationField")}</Label><Input placeholder="7 days" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("qty")}</Label><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-4"><Label>{t("instructions")}</Label><Input value={form.instructions_en} onChange={(e) => setForm({ ...form, instructions_en: e.target.value })} /></div>
            <div className="md:col-span-4 flex justify-end"><Button onClick={add} className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4"/>{t("addToRecord")}</Button></div>
          </div>
        )}
      </Card>

      <Card className="shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="text-sm font-semibold">{t("rxItems")} {rx ? <span className="text-xs text-muted-foreground">({rxItems.length})</span> : null}</div>
          {rx && rxItems.length > 0 && <Button size="sm" variant="outline" onClick={print}><Printer className="me-2 size-4"/>{t("print")}</Button>}
        </div>
        {rxItems.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noResults")}</div> : (
          <div className="divide-y divide-border">
            {rxItems.map((it: any) => (
              <div key={it.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{lang === "ar" ? it.medications?.name_ar : it.medications?.name_en} {it.medications?.strength && <span className="text-xs text-muted-foreground">· {it.medications.strength}</span>}</div>
                  <div className="text-xs text-muted-foreground">{[it.dosage, it.frequency, it.duration].filter(Boolean).join(" · ")} · x{it.quantity}</div>
                  {it.instructions_en && <div className="text-xs text-muted-foreground italic mt-0.5">{it.instructions_en}</div>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(it.id)}><Trash2 className="size-4 text-destructive"/></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================ Documents Tab */
function DocumentsTab({ record, patient, docs, reload, userId }: any) {
  const { t, lang } = useI18n();
  const [type, setType] = useState<string>("other");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    const ALLOWED_MIME = new Set([
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf", "application/dicom",
    ]);
    const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|pdf|dcm|dicom)$/i;
    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
    // UX fix: these two messages were hardcoded English regardless of
    // `lang`, in a component that otherwise fully supports both languages
    // (t(...) and lang === "ar" ternaries throughout).
    if (file.size > MAX_SIZE) {
      return toast.error(`${file.name}: ${lang === "ar" ? "الملف يتجاوز الحد الأقصى 20 ميغابايت" : "file exceeds 20 MB limit"}`);
    }
    const mimeOk = file.type && ALLOWED_MIME.has(file.type);
    const extOk = ALLOWED_EXT.test(file.name);
    if (!mimeOk && !extOk) {
      return toast.error(`${file.name}: ${lang === "ar" ? "نوع ملف غير مدعوم" : "unsupported file type"}`);
    }
    const safeName = (file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(0, 100)) || "file";
    setUploading(true);
    const path = `${patient.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("patient-docs").upload(path, file);
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("patient_documents").insert({
      patient_id: patient.id, medical_record_id: record.id,
      document_type: type as any, title_ar: title || file.name, title_en: title || file.name,
      file_url: path, file_name: file.name, file_size: file.size, uploaded_by: userId,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    setTitle(""); reload(); toast.success(t("uploaded"));
  };

  const openDoc = async (path: string) => {
    const { data } = await supabase.storage.from("patient-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const remove = async (d: any) => {
    await supabase.storage.from("patient-docs").remove([d.file_url]);
    await supabase.from("patient_documents").delete().eq("id", d.id);
    reload();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>{t("documentType")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lab_result">{t("docLabResult")}</SelectItem>
                <SelectItem value="xray">{t("docXray")}</SelectItem>
                <SelectItem value="mri">{t("docMri")}</SelectItem>
                <SelectItem value="ct_scan">{t("docCt")}</SelectItem>
                <SelectItem value="prescription">{t("docPrescription")}</SelectItem>
                <SelectItem value="report">{t("docReport")}</SelectItem>
                <SelectItem value="other">{t("docOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5"><Label>{t("documentTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </div>
        <div>
          <Label htmlFor="file" className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:bg-muted/40">
            <Upload className="size-4"/> {uploading ? t("uploading") : t("uploadFile")}
          </Label>
          <input id="file" type="file" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
        </div>
      </Card>

      {docs.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noDocuments")}</div> : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {docs.map((d: any) => (
            <Card key={d.id} className="p-3 shadow-card flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><FileText className="size-5"/></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{lang === "ar" ? d.title_ar : d.title_en}</div>
                <div className="text-xs text-muted-foreground truncate">{t(("doc" + d.document_type.replace(/_/g, "").replace(/(^.)/, (c: string) => c.toUpperCase())) as any) ?? d.document_type}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openDoc(d.file_url)}><Upload className="size-4 rotate-180"/></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(d)}><Trash2 className="size-4 text-destructive"/></Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ Invoice Preview Tab */
function InvoicePreviewTab({ record, patient, procs, nav, userId }: any) {
  const { t, lang } = useI18n();
  const items = procs.filter((rp: any) => rp.procedures?.default_price != null);
  const total = items.reduce((s: number, rp: any) => s + (Number(rp.procedures.default_price) * Number(rp.quantity)), 0);
  const [existing, setExisting] = useState<any[]>([]);

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, status, total, paid_amount")
        .eq("patient_id", patient.id)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false });
      setExisting(data ?? []);
    })();
  }, [patient?.id]);

  const create = async () => {
    if (items.length === 0) return toast.error(t("noResults"));
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        patient_id: patient.id,
        branch_id: record.branch_id,
        medical_record_id: record.id,
        status: "draft",
        created_by: userId,
      } as any, { defaultToNull: false })
      .select("id")
      .single();
    // UX fix: hardcoded English fallback regardless of `lang`.
    if (error || !inv) return toast.error(error?.message ?? (lang === "ar" ? "خطأ" : "error"));
    const rows = items.map((rp: any) => ({
      invoice_id: inv.id, item_type: "procedure" as const,
      description_en: rp.procedures.name_en, description_ar: rp.procedures.name_ar,
      quantity: rp.quantity, unit_price: rp.procedures.default_price,
    }));
    const { error: e2 } = await supabase.from("invoice_items").insert(rows as any);
    if (e2) return toast.error(e2.message);
    toast.success(t("save"));
    nav(`/invoices/${inv.id}`);
  };

  return (
    <Card className="p-6 shadow-card space-y-4">
      {/* Existing invoices for this patient */}
      <div className="space-y-2">
        <h3 className="font-semibold">{lang === "ar" ? "فواتير المريض" : "Patient Invoices"}</h3>
        {existing.length === 0 ? (
          <div className="text-muted-foreground text-sm py-4">{t("noResults")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="p-2 text-start">{lang === "ar" ? "رقم" : "Number"}</th>
                  <th className="p-2 text-start">{lang === "ar" ? "التاريخ" : "Date"}</th>
                  <th className="p-2 text-start">{lang === "ar" ? "الحالة" : "Status"}</th>
                  <th className="p-2 text-end">{lang === "ar" ? "الإجمالي" : "Total"}</th>
                  <th className="p-2 text-end">{lang === "ar" ? "المدفوع" : "Paid"}</th>
                </tr>
              </thead>
              <tbody>
                {existing.map((inv) => (
                  <tr key={inv.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => nav(`/invoices/${inv.id}`)}>
                    <td className="p-2 font-medium">{inv.invoice_number}</td>
                    <td className="p-2">{formatDate(inv.invoice_date, lang)}</td>
                    <td className="p-2"><Badge variant="outline">{inv.status}</Badge></td>
                    <td className="p-2 text-end tabular-nums">{formatMoney(inv.total, lang)}</td>
                    <td className="p-2 text-end tabular-nums">{formatMoney(inv.paid_amount, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold">{t("invoiceFromProcedures")}</h3>
        <Button onClick={create} className="gradient-primary text-primary-foreground" disabled={items.length === 0}><FileText className="me-2 size-4"/>{t("createInvoice")}</Button>
      </div>
      {items.length === 0 ? <div className="text-muted-foreground text-center py-8">{t("noResults")}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr><th className="p-2 text-start">{t("procedure")}</th><th className="p-2 text-end">{t("qty")}</th><th className="p-2 text-end">{t("price")}</th><th className="p-2 text-end">{t("totals" as any) ?? "Total"}</th></tr>
            </thead>
            <tbody>
              {items.map((rp: any) => (
                <tr key={rp.id} className="border-t border-border">
                  <td className="p-2">{lang === "ar" ? rp.procedures.name_ar : rp.procedures.name_en}</td>
                  <td className="p-2 text-end tabular-nums">{rp.quantity}</td>
                  <td className="p-2 text-end tabular-nums">{formatMoney(rp.procedures.default_price, lang)}</td>
                  <td className="p-2 text-end tabular-nums font-semibold">{formatMoney(rp.procedures.default_price * rp.quantity, lang)}</td>
                </tr>
              ))}
              <tr className="border-t border-border"><td colSpan={3} className="p-2 text-end font-semibold">{t("totals" as any) ?? "Total"}</td><td className="p-2 text-end font-bold tabular-nums">{formatMoney(total, lang)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}