import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pill, FlaskConical, Stethoscope, Plus, Trash2, FileText, Printer,
  Activity, ClipboardList, History, Upload, Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import {
  RX_FREQ_PRESETS, RX_INSTR_PRESETS, RX_DOSAGE_PRESETS, calcQuantity,
} from "@/lib/rxPresets";

function calcAge(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

export default function ConsultationDashboard() {
  const { recordId } = useParams();
  const { lang } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const isAr = lang === "ar";
  const T = (en: string, ar: string) => (isAr ? ar : en);

  const [record, setRecord] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [lastVisits, setLastVisits] = useState<any[]>([]);
  const [activeDx, setActiveDx] = useState<any[]>([]);
  const [currentMeds, setCurrentMeds] = useState<any[]>([]);
  const [thisDx, setThisDx] = useState<any[]>([]);
  const [thisProcs, setThisProcs] = useState<any[]>([]);
  const [thisRx, setThisRx] = useState<any[]>([]);
  const [thisDocs, setThisDocs] = useState<any[]>([]);
  const [draftInvoice, setDraftInvoice] = useState<any>(null);

  const [rxOpen, setRxOpen] = useState(false);
  const [procOpen, setProcOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [startingProc, setStartingProc] = useState(false);

  const load = useCallback(async () => {
    if (!recordId) return;
    const { data: r } = await supabase.from("medical_records").select("*").eq("id", recordId).maybeSingle();
    if (!r) { toast.error(T("Record not found", "السجل غير موجود")); return; }
    setRecord(r);

    const [
      { data: p },
      { data: lv },
      { data: rd },
      { data: rp },
      { data: rx },
      { data: dc },
      { data: inv },
    ] = await Promise.all([
      supabase.from("patients").select("*").eq("id", r.patient_id).maybeSingle(),
      supabase.from("medical_records")
        .select("id,visit_date,chief_complaint_en,chief_complaint_ar,medical_specialties(name_en,name_ar)")
        .eq("patient_id", r.patient_id).neq("id", r.id)
        .order("visit_date", { ascending: false }).limit(3),
      supabase.from("record_diagnoses").select("*, diagnoses(*)").eq("medical_record_id", r.id),
      supabase.from("record_procedures").select("*, procedures(*)").eq("medical_record_id", r.id),
      supabase.from("prescriptions").select("*").eq("medical_record_id", r.id).order("created_at", { ascending: false }),
      supabase.from("patient_documents").select("*").eq("medical_record_id", r.id).order("created_at", { ascending: false }),
      supabase.from("invoices")
        .select("id, invoice_number, status, total, paid_amount")
        .eq("medical_record_id", r.id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPatient(p);
    setLastVisits(lv ?? []);
    setThisDx(rd ?? []);
    setThisProcs(rp ?? []);
    setThisRx(rx ?? []);
    setThisDocs(dc ?? []);
    setDraftInvoice(inv ?? null);

    // Active diagnoses across recent visits (last 5)
    const { data: histDx } = await supabase
      .from("record_diagnoses")
      .select("diagnoses(code,name_en,name_ar), is_primary, medical_records!inner(patient_id, visit_date)")
      .eq("medical_records.patient_id", r.patient_id)
      .order("created_at", { ascending: false })
      .limit(8);
    setActiveDx(histDx ?? []);

    // Current meds = items from active prescriptions of this patient
    const { data: rxAll } = await supabase
      .from("prescriptions").select("id, status").eq("patient_id", r.patient_id).eq("status", "active").limit(5);
    if (rxAll && rxAll.length) {
      const { data: items } = await supabase
        .from("prescription_items")
        .select("dosage, frequency, medications(name_en,name_ar,strength)")
        .in("prescription_id", rxAll.map((x) => x.id));
      setCurrentMeds(items ?? []);
    } else setCurrentMeds([]);
  }, [recordId, isAr]);

  useEffect(() => { load(); }, [load]);

  if (!record || !patient) {
    return <div className="text-center text-muted-foreground py-10">…</div>;
  }

  const patientName = isAr
    ? `${patient.first_name_ar ?? patient.first_name_en} ${patient.last_name_ar ?? patient.last_name_en ?? ""}`.trim()
    : `${patient.first_name_en} ${patient.last_name_en ?? ""}`.trim();
  const age = calcAge(patient.dob);

  /* ────────── Start Procedure → idempotent draft invoice ────────── */
  const startProcedure = async (proc: any, qty: number) => {
    if (startingProc) return; // guard against double-clicks / parallel flows
    setStartingProc(true);
    try {
    // 1) insert record_procedures (trigger handles commissions)
    const { error: rpErr } = await supabase.from("record_procedures").insert({
      medical_record_id: record.id,
      procedure_id: proc.id,
      quantity: qty,
      duration_minutes: proc.default_duration ?? null,
      performed_by: user?.id ?? null,
    });
    if (rpErr) { toast.error(rpErr.message); return; }

    // 2) idempotent draft invoice: look for one tied to this visit
    let invoiceId = draftInvoice?.id ?? null;
    if (!invoiceId) {
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, status")
        .eq("medical_record_id", record.id)
        .is("deleted_at", null)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (existing) invoiceId = existing.id;
    }

    if (!invoiceId) {
      const { data: inv, error: iErr } = await supabase
        .from("invoices")
        .insert({
          patient_id: patient.id,
          branch_id: record.branch_id,
          medical_record_id: record.id,
          status: "draft",
          created_by: user?.id ?? null,
        } as any, { defaultToNull: false })
        .select("id").single();
      if (iErr || !inv) { toast.error(iErr?.message ?? "Invoice error"); return; }
      invoiceId = inv.id;
    }

    // 3) append line item (trigger recomputes totals). Never marks paid.
    if (proc.default_price != null) {
      const { error: itErr } = await supabase.from("invoice_items").insert({
        invoice_id: invoiceId,
        item_type: "procedure" as const,
        description_en: proc.name_en,
        description_ar: proc.name_ar,
        quantity: qty,
        unit_price: proc.default_price,
      } as any);
      if (itErr) { toast.error(itErr.message); return; }
    }
    toast.success(T("Procedure added + draft invoice updated", "تم إضافة الإجراء + تحديث فاتورة المسودة"));
    setProcOpen(false);
    load();
    } finally {
      setStartingProc(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/medical/records"><ArrowLeft className="me-2 size-4"/>{T("Back to records", "العودة للسجلات")}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{record.visit_type}</Badge>
          <Badge variant="outline">{record.status}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link to={`/medical/records/${record.id}`}><FileText className="me-2 size-4"/>{T("Open full record", "السجل الكامل")}</Link>
          </Button>
        </div>
      </div>

      {/* Patient strip */}
      <Card className="p-4 shadow-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-12 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
            {patientName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <Link to={`/patients/${patient.id}`} className="font-bold text-lg hover:underline">{patientName}</Link>
            <div className="text-xs text-muted-foreground">
              #{patient.patient_code}
              {age != null && <> · {age} {T("y/o", "سنة")}</>}
              {patient.gender && <> · {patient.gender}</>}
              {patient.phone && <> · {patient.phone}</>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {T("Visit date", "تاريخ الزيارة")}: {formatDate(record.visit_date, lang)}
            </div>
          </div>
          {draftInvoice && (
            <Link to={`/invoices/${draftInvoice.id}`} className="text-sm">
              <Badge variant="outline" className="status-progress">
                {T("Draft invoice", "فاتورة مسودة")} · {draftInvoice.invoice_number} · {formatMoney(draftInvoice.total ?? 0, lang)}
              </Badge>
            </Link>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Quick history */}
        <Card className="p-4 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary"/>
            <h2 className="font-semibold">{T("Quick history", "السجل السريع")}</h2>
          </div>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Last 3 visits", "آخر 3 زيارات")}</div>
            {lastVisits.length === 0 ? (
              <div className="text-sm text-muted-foreground">{T("No prior visits", "لا توجد زيارات سابقة")}</div>
            ) : (
              <ul className="space-y-1.5">
                {lastVisits.map((v) => (
                  <li key={v.id} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground tabular-nums shrink-0">{formatDate(v.visit_date, lang)}</span>
                    <span className="truncate">
                      {isAr ? (v.chief_complaint_ar ?? v.chief_complaint_en ?? "—") : (v.chief_complaint_en ?? v.chief_complaint_ar ?? "—")}
                      {v.medical_specialties && <> · <span className="text-muted-foreground">{isAr ? v.medical_specialties.name_ar : v.medical_specialties.name_en}</span></>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Recent diagnoses", "تشخيصات حديثة")}</div>
            {activeDx.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {activeDx.map((d, i) => d.diagnoses && (
                  <Badge key={i} variant="outline" className="text-xs">
                    {d.diagnoses.code ? `${d.diagnoses.code} · ` : ""}
                    {isAr ? (d.diagnoses.name_ar ?? d.diagnoses.name_en) : d.diagnoses.name_en}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Current medications", "الأدوية الحالية")}</div>
            {currentMeds.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {currentMeds.slice(0, 8).map((m, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Pill className="size-3 text-primary shrink-0"/>
                    <span className="font-medium">{isAr ? (m.medications?.name_ar ?? m.medications?.name_en) : m.medications?.name_en}</span>
                    {m.medications?.strength && <span className="text-xs text-muted-foreground">{m.medications.strength}</span>}
                    {m.dosage && <span className="text-xs text-muted-foreground">· {m.dosage}</span>}
                    {m.frequency && <span className="text-xs text-muted-foreground">· {m.frequency}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>

        {/* Vitals & complaints (snapshot for this visit) */}
        <Card className="p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary"/>
            <h2 className="font-semibold">{T("Vitals & complaints", "العلامات والشكاوى")}</h2>
            <Button asChild variant="ghost" size="sm" className="ms-auto">
              <Link to={`/medical/records/${record.id}`}>{T("Edit", "تعديل")}</Link>
            </Button>
          </div>
          <VitalsSnapshot patientId={patient.id} recordId={record.id}/>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">{T("Chief complaint", "الشكوى الرئيسية")}</div>
            <div className="text-sm">{(isAr ? record.chief_complaint_ar : record.chief_complaint_en) || <span className="text-muted-foreground">—</span>}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">{T("Present illness", "تاريخ المرض الحالي")}</div>
            <div className="text-sm whitespace-pre-line">{(isAr ? record.present_illness_ar : record.present_illness_en) || <span className="text-muted-foreground">—</span>}</div>
          </div>
        </Card>
      </div>

      {/* Action bar */}
      <Card className="p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setRxOpen(true)} className="gradient-primary text-primary-foreground">
            <Pill className="me-2 size-4"/>{T("Add Prescription", "إضافة روشتة")}
          </Button>
          <Button onClick={() => setLabOpen(true)} variant="outline">
            <FlaskConical className="me-2 size-4"/>{T("Order Lab", "طلب تحليل")}
          </Button>
          <Button onClick={() => setProcOpen(true)} variant="outline">
            <Stethoscope className="me-2 size-4"/>{T("Start Procedure", "بدء إجراء")}
          </Button>
        </div>
      </Card>

      {/* This visit summary */}
      <Card className="p-4 shadow-card space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary"/>
          <h2 className="font-semibold">{T("This visit", "هذه الزيارة")}</h2>
        </div>

        <section>
          <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Diagnoses", "التشخيصات")}</div>
          {thisDx.length === 0 ? <div className="text-sm text-muted-foreground">—</div> : (
            <div className="flex flex-wrap gap-1">
              {thisDx.map((d) => (
                <Badge key={d.id} variant="outline" className="text-xs">
                  {d.diagnoses?.code ? `${d.diagnoses.code} · ` : ""}
                  {isAr ? (d.diagnoses?.name_ar ?? d.diagnoses?.name_en) : d.diagnoses?.name_en}
                  {d.is_primary && <span className="ms-1 text-primary">★</span>}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Procedures", "الإجراءات")}</div>
          {thisProcs.length === 0 ? <div className="text-sm text-muted-foreground">—</div> : (
            <ul className="text-sm divide-y divide-border">
              {thisProcs.map((rp) => (
                <li key={rp.id} className="py-1.5 flex items-center gap-2">
                  <span className="flex-1">{isAr ? rp.procedures?.name_ar : rp.procedures?.name_en} <span className="text-xs text-muted-foreground">× {rp.quantity}</span></span>
                  {rp.procedures?.default_price != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(rp.procedures.default_price * rp.quantity, lang)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Prescriptions", "الروشتات")}</div>
          {thisRx.length === 0 ? <div className="text-sm text-muted-foreground">—</div> : (
            <ul className="text-sm divide-y divide-border">
              {thisRx.map((r) => (
                <li key={r.id} className="py-1.5 flex items-center gap-2">
                  <Pill className="size-3.5 text-primary"/>
                  <span className="flex-1">{formatDate(r.prescription_date ?? r.created_at, lang)} · {r.status}</span>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/medical/prescriptions/${r.id}`}><Printer className="me-1 size-3.5"/>{T("Open / Print", "فتح / طباعة")}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {thisDocs.length > 0 && (
          <section>
            <div className="text-xs uppercase text-muted-foreground mb-1.5">{T("Documents", "المستندات")}</div>
            <ul className="text-sm divide-y divide-border">
              {thisDocs.slice(0, 5).map((d) => (
                <li key={d.id} className="py-1.5 flex items-center gap-2">
                  <FileText className="size-3.5 text-primary"/>
                  <span className="flex-1 truncate">{isAr ? d.title_ar : d.title_en}</span>
                  <Badge variant="outline" className="text-[10px]">{d.document_type}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>

      {rxOpen && (
        <PrescriptionDialog
          open={rxOpen} onOpenChange={setRxOpen}
          record={record} patient={patient} userId={user?.id}
          onSaved={(rxId) => { setRxOpen(false); load(); nav(`/medical/prescriptions/${rxId}`); }}
        />
      )}
      {procOpen && (
        <ProcedureDialog
          open={procOpen} onOpenChange={setProcOpen}
          onStart={startProcedure}
          busy={startingProc}
        />
      )}
      {labOpen && (
        <LabRequestDialog
          open={labOpen} onOpenChange={setLabOpen}
          patient={patient} record={record} userId={user?.id}
          onSaved={() => { setLabOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/* ───────────── Vitals snapshot (latest row for patient) ───────────── */
function VitalsSnapshot({ patientId }: { patientId: string; recordId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    supabase.from("vital_signs")
      .select("*").eq("patient_id", patientId)
      .order("recorded_at", { ascending: false }).limit(1)
      .maybeSingle().then(({ data }) => setV(data));
  }, [patientId]);
  if (!v) return <div className="text-sm text-muted-foreground">{isAr ? "لا توجد علامات حيوية مسجلة" : "No vitals recorded"}</div>;
  const cell = (label: string, val: any, unit = "") => (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{val ?? "—"}{val != null && unit ? ` ${unit}` : ""}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cell(isAr ? "ضغط" : "BP", v.blood_pressure_systolic && v.blood_pressure_diastolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : null)}
      {cell(isAr ? "نبض" : "HR", v.heart_rate, "bpm")}
      {cell(isAr ? "حرارة" : "Temp", v.temperature, "°C")}
      {cell(isAr ? "وزن" : "Wt", v.weight, "kg")}
      {cell(isAr ? "طول" : "Ht", v.height, "cm")}
      {cell("BMI", v.bmi)}
    </div>
  );
}

/* ───────────── Prescription dialog (brand/generic search + presets) ───────────── */
type RxItem = {
  medication: any;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
  timesPerDay: number;
};

function PrescriptionDialog({
  open, onOpenChange, record, patient, userId, onSaved,
}: any) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const T = (en: string, ar: string) => (isAr ? ar : en);
  const [searchMode, setSearchMode] = useState<"brand" | "generic">("brand");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [items, setItems] = useState<RxItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const term = q.trim();
      if (!term) { setResults([]); return; }
      const col = searchMode === "brand" ? "name_en" : "generic_name";
      const { data } = await supabase.from("medications")
        .select("id,name_en,name_ar,generic_name,strength,form")
        .eq("is_active", true)
        .or(`${col}.ilike.%${term}%,name_ar.ilike.%${term}%`)
        .order("name_en").limit(15);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(handle);
  }, [q, searchMode]);

  const addItem = (m: any) => {
    if (items.find((it) => it.medication.id === m.id)) return;
    setItems((prev) => [...prev, {
      medication: m, dosage: "", frequency: "", duration: "7", quantity: "1",
      instructions: "", timesPerDay: 0,
    }]);
    setQ(""); setResults([]);
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.medication.id !== id));
  const patch = (id: string, p: Partial<RxItem>) =>
    setItems((prev) => prev.map((it) => it.medication.id === id ? { ...it, ...p } : it));

  const applyPreset = (id: string, label_en: string, label_ar: string, fr_en: string, fr_ar: string, tpd: number) => {
    const it = items.find((x) => x.medication.id === id);
    if (!it) return;
    const dur = Number(it.duration) || 0;
    patch(id, {
      frequency: isAr ? fr_ar : fr_en,
      timesPerDay: tpd,
      quantity: tpd > 0 && dur > 0 ? String(calcQuantity(tpd, dur)) : it.quantity,
    });
  };

  const save = async () => {
    if (!items.length) { toast.error(T("Add at least one medication", "أضف دواءً واحداً على الأقل")); return; }
    setSaving(true);
    const { data: rx, error } = await supabase.from("prescriptions").insert({
      patient_id: patient.id, doctor_id: userId, medical_record_id: record.id,
    } as any).select("id").single();
    if (error || !rx) { setSaving(false); toast.error(error?.message ?? "error"); return; }
    const rows = items.map((it) => ({
      prescription_id: rx.id,
      medication_id: it.medication.id,
      dosage: it.dosage || null,
      frequency: it.frequency || null,
      duration: it.duration || null,
      quantity: Number(it.quantity) || 1,
      instructions_en: it.instructions || null,
      instructions_ar: it.instructions || null,
    }));
    const { error: e2 } = await supabase.from("prescription_items").insert(rows as any);
    setSaving(false);
    if (e2) { toast.error(e2.message); return; }
    toast.success(T("Prescription saved", "تم حفظ الروشتة"));
    onSaved(rx.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{T("New Prescription", "روشتة جديدة")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant={searchMode === "brand" ? "default" : "outline"} onClick={() => setSearchMode("brand")}>
              {T("Brand", "اسم تجاري")}
            </Button>
            <Button type="button" size="sm" variant={searchMode === "generic" ? "default" : "outline"} onClick={() => setSearchMode("generic")}>
              {T("Generic", "اسم علمي")}
            </Button>
            <div className="relative flex-1">
              <Search className="absolute start-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"/>
              <Input className="ps-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("Search medication…", "ابحث عن دواء…")} />
            </div>
          </div>
          {results.length > 0 && (
            <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => addItem(m)} className="flex items-center gap-3 w-full p-2 text-start hover:bg-muted/50 border-b border-border last:border-0">
                  <Plus className="size-3.5 text-primary shrink-0"/>
                  <span className="text-sm font-medium">{isAr ? m.name_ar : m.name_en}</span>
                  {m.generic_name && <span className="text-xs text-muted-foreground">({m.generic_name})</span>}
                  {m.strength && <Badge variant="outline" className="text-[10px] ms-auto">{m.strength}</Badge>}
                </button>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              {T("Search and add medications above.", "ابحث وأضف الأدوية أعلاه.")}
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.medication.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{isAr ? it.medication.name_ar : it.medication.name_en}</span>
                    {it.medication.strength && <Badge variant="outline" className="text-[10px]">{it.medication.strength}</Badge>}
                    <Button variant="ghost" size="icon" className="ms-auto" onClick={() => removeItem(it.medication.id)}><Trash2 className="size-4 text-destructive"/></Button>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">{T("Dosage", "الجرعة")}</Label>
                      <Input value={it.dosage} onChange={(e) => patch(it.medication.id, { dosage: e.target.value })} placeholder={T("1 tab", "قرص واحد")}/>
                    </div>
                    <div>
                      <Label className="text-xs">{T("Frequency", "التكرار")}</Label>
                      <Input value={it.frequency} onChange={(e) => patch(it.medication.id, { frequency: e.target.value })} placeholder={T("e.g. TID", "مثل TID")}/>
                    </div>
                    <div>
                      <Label className="text-xs">{T("Duration (days)", "المدة (أيام)")}</Label>
                      <Input type="number" min="1" value={it.duration} onChange={(e) => {
                        const dur = Number(e.target.value) || 0;
                        patch(it.medication.id, {
                          duration: e.target.value,
                          quantity: it.timesPerDay > 0 && dur > 0 ? String(calcQuantity(it.timesPerDay, dur)) : it.quantity,
                        });
                      }}/>
                    </div>
                    <div>
                      <Label className="text-xs">{T("Quantity", "الكمية")}</Label>
                      <Input type="number" min="1" value={it.quantity} onChange={(e) => patch(it.medication.id, { quantity: e.target.value })}/>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase text-muted-foreground">{T("Dosage presets", "جرعات جاهزة")}</div>
                    <div className="flex flex-wrap gap-1">
                      {RX_DOSAGE_PRESETS.map((p, i) => (
                        <Button key={i} type="button" variant="outline" size="sm" className="h-6 text-[11px]"
                          onClick={() => patch(it.medication.id, { dosage: isAr ? p.ar : p.en })}>
                          {isAr ? p.ar : p.en}
                        </Button>
                      ))}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">{T("Frequency presets", "تكرار جاهز")}</div>
                    <div className="flex flex-wrap gap-1">
                      {RX_FREQ_PRESETS.map((p, i) => (
                        <Button key={i} type="button" variant="outline" size="sm" className="h-6 text-[11px]"
                          onClick={() => applyPreset(it.medication.id, p.label_en, p.label_ar, p.frequency_en, p.frequency_ar, p.timesPerDay)}>
                          {isAr ? p.label_ar : p.label_en}
                        </Button>
                      ))}
                    </div>
                    <div className="text-[10px] uppercase text-muted-foreground">{T("Instruction presets", "تعليمات جاهزة")}</div>
                    <div className="flex flex-wrap gap-1">
                      {RX_INSTR_PRESETS.map((p, i) => (
                        <Button key={i} type="button" variant="outline" size="sm" className="h-6 text-[11px]"
                          onClick={() => patch(it.medication.id, { instructions: isAr ? p.ar : p.en })}>
                          {isAr ? p.ar : p.en}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">{T("Instructions (free text)", "تعليمات (نص حر)")}</Label>
                    <Textarea rows={2} value={it.instructions} onChange={(e) => patch(it.medication.id, { instructions: e.target.value })} maxLength={500}/>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{T("Cancel", "إلغاء")}</Button>
          <Button onClick={save} disabled={saving || items.length === 0} className="gradient-primary text-primary-foreground">
            <Printer className="me-2 size-4"/>{T("Save & Print", "حفظ وطباعة")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Procedure dialog ───────────── */
function ProcedureDialog({ open, onOpenChange, onStart, busy }: any) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const T = (en: string, ar: string) => (isAr ? ar : en);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [qty, setQty] = useState("1");

  useEffect(() => {
    supabase.from("procedures").select("*").eq("is_active", true).order("name_en").then(({ data }) => setCatalog(data ?? []));
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return catalog.slice(0, 12);
    return catalog.filter((p) =>
      (p.code ?? "").toLowerCase().includes(s) ||
      p.name_en.toLowerCase().includes(s) ||
      (p.name_ar ?? "").includes(s)
    ).slice(0, 12);
  }, [q, catalog]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{T("Start Procedure", "بدء إجراء")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder={T("Search procedure…", "ابحث عن إجراء…")} value={q} onChange={(e) => { setQ(e.target.value); setSelected(null); }}/>
          {!selected && (
            <div className="border border-border rounded-lg max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">—</div>
              ) : filtered.map((p) => (
                <button key={p.id} type="button" onClick={() => setSelected(p)} className="flex items-center gap-3 w-full p-2 text-start hover:bg-muted/50 border-b border-border last:border-0">
                  {p.code && <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>}
                  <span className="flex-1 text-sm">{isAr ? p.name_ar : p.name_en}</span>
                  {p.default_price != null && <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(p.default_price, lang)}</span>}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="font-semibold">{isAr ? selected.name_ar : selected.name_en}</div>
              {selected.default_price != null && <div className="text-sm text-muted-foreground">{formatMoney(selected.default_price, lang)}</div>}
              <div>
                <Label className="text-xs">{T("Quantity", "الكمية")}</Label>
                <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}/>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {T("This will add to a draft invoice for this visit. Never marked as paid.",
                   "سيتم الإضافة لفاتورة مسودة لهذه الزيارة. لن تُعلَّم كمدفوعة.")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{T("Cancel", "إلغاء")}</Button>
          <Button disabled={!selected || busy} onClick={() => selected && !busy && onStart(selected, Number(qty) || 1)} className="gradient-primary text-primary-foreground">
            <Stethoscope className="me-2 size-4"/>{busy ? T("Starting…", "جارٍ البدء…") : T("Start", "بدء")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Lightweight Lab Request (document only) ───────────── */
function LabRequestDialog({ open, onOpenChange, patient, record, userId, onSaved }: any) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const T = (en: string, ar: string) => (isAr ? ar : en);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error(T("Title required", "العنوان مطلوب")); return; }
    setSaving(true);
    const labTitle = `${T("Lab request", "طلب تحليل")}: ${title.trim()}`;
    // Lightweight: store as a metadata-only document (no file); document_type='other' to avoid schema change
    const { error } = await supabase.from("patient_documents").insert({
      patient_id: patient.id,
      medical_record_id: record.id,
      document_type: "other" as any,
      title_ar: labTitle, title_en: labTitle,
      description: notes || null,
      file_url: `lab-request:${record.id}:${Date.now()}`,
      file_name: "lab-request.txt",
      uploaded_by: userId,
      tags: ["lab_request"],
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(T("Lab request saved", "تم حفظ طلب التحليل"));
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{T("Order Lab", "طلب تحليل")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("Test / panel", "التحليل")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T("e.g. CBC, FBS, LFT", "مثل CBC, FBS, LFT")} maxLength={150}/>
          </div>
          <div>
            <Label>{T("Notes", "ملاحظات")}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}/>
          </div>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Upload className="size-3"/>
            {T("Lightweight record only. Upload results later in the full record.",
               "سجل مبسط فقط. ارفع النتائج لاحقاً من السجل الكامل.")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{T("Cancel", "إلغاء")}</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">{T("Save", "حفظ")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}