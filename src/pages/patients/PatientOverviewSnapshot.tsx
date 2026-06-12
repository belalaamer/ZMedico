import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Pill, Stethoscope, Calendar, FileText, Image as ImageIcon,
  ArrowRight, Plus, CreditCard,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

type Props = {
  patientId: string;
  invoices: any[];
  payments: any[];
  canViewBilling: boolean;
  canPay: boolean;
  canTopup: boolean;
  reloadKey?: number;
  onRecordPayment: () => void;
  onTopupWallet: () => void;
  onOpenFinancial: () => void;
  onUploadDocument: () => void;
};

const statusTone: Record<string, string> = {
  scheduled: "status-progress",
  confirmed: "status-completed",
  in_progress: "status-progress",
  completed: "status-completed",
  cancelled: "status-cancelled",
  no_show: "status-cancelled",
};

export default function PatientOverviewSnapshot({
  patientId, invoices, payments,
  canViewBilling, canPay, canTopup, reloadKey,
  onRecordPayment, onTopupWallet, onOpenFinancial, onUploadDocument,
}: Props) {
  const { lang, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any | null>(null);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const nowIso = new Date().toISOString();
    Promise.all([
      supabase.from("medical_history")
        .select("has_allergies,allergies_en,allergies_ar,has_diabetes,has_hypertension,has_heart_disease,has_bleeding_disorder,is_pregnant,current_medications_en,current_medications_ar")
        .eq("patient_id", patientId).maybeSingle(),
      supabase.from("record_diagnoses")
        .select("id,created_at,diagnoses(name_en,name_ar,icd_code),medical_records!inner(patient_id,visit_date)")
        .eq("medical_records.patient_id", patientId)
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("prescription_items")
        .select("id,dosage,frequency,duration,medications(name_en,name_ar),prescriptions!inner(patient_id,prescribed_date)")
        .eq("prescriptions.patient_id", patientId)
        .order("id", { ascending: false }).limit(5),
      supabase.from("medical_records")
        .select("id,visit_date,chief_complaint_en,chief_complaint_ar,status,medical_specialties(name_en,name_ar),profiles(full_name)")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false }).limit(4),
      supabase.from("appointments")
        .select("id,scheduled_at,status,procedure,branches(name_en,name_ar),profiles!appointments_doctor_id_fkey(full_name)")
        .eq("patient_id", patientId).is("deleted_at", null)
        .gte("scheduled_at", nowIso)
        .in("status", ["scheduled", "confirmed", "in_progress"])
        .order("scheduled_at", { ascending: true }).limit(4),
      supabase.from("patient_documents")
        .select("id,title_en,title_ar,document_type,file_url,created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }).limit(6),
    ]).then(([h, rd, px, mr, ap, dc]) => {
      if (!active) return;
      setHistory(h.data ?? null);
      setDiagnoses(rd.data ?? []);
      setMeds(px.data ?? []);
      setRecentVisits(mr.data ?? []);
      // Fallback: appointments query may fail if FK alias differs — retry without alias
      if (ap.error) {
        supabase.from("appointments")
          .select("id,scheduled_at,status,procedure,branches(name_en,name_ar)")
          .eq("patient_id", patientId).is("deleted_at", null)
          .gte("scheduled_at", nowIso)
          .in("status", ["scheduled", "confirmed", "in_progress"])
          .order("scheduled_at", { ascending: true }).limit(4)
          .then(({ data }) => { if (active) setUpcoming(data ?? []); });
      } else {
        setUpcoming(ap.data ?? []);
      }
      setDocs(dc.data ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [patientId, reloadKey]);

  const allergiesText = history?.has_allergies
    ? (lang === "ar" ? (history.allergies_ar || history.allergies_en) : (history.allergies_en || history.allergies_ar))
    : null;
  const chronics: string[] = [];
  if (history?.has_diabetes) chronics.push(lang === "ar" ? "السكري" : "Diabetes");
  if (history?.has_hypertension) chronics.push(lang === "ar" ? "ضغط الدم" : "Hypertension");
  if (history?.has_heart_disease) chronics.push(lang === "ar" ? "أمراض القلب" : "Heart disease");
  if (history?.has_bleeding_disorder) chronics.push(lang === "ar" ? "نزيف" : "Bleeding disorder");
  if (history?.is_pregnant) chronics.push(lang === "ar" ? "حمل" : "Pregnant");

  const currentMedsText = lang === "ar"
    ? (history?.current_medications_ar || history?.current_medications_en)
    : (history?.current_medications_en || history?.current_medications_ar);

  const openDoc = async (path: string) => {
    const { data } = await supabase.storage.from("patient-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* MAIN column */}
      <div className="md:col-span-2 space-y-4">
        {/* Clinical Snapshot */}
        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Stethoscope className="size-4 text-primary" />
              {lang === "ar" ? "الملخص السريري" : "Clinical Snapshot"}
            </h3>
            <Button asChild size="sm" variant="ghost">
              <Link to={`/patients/${patientId}?tab=clinical`}>
                {lang === "ar" ? "عرض الكل" : "View all"}
                <ArrowRight className="ms-1 size-3.5 rtl:rotate-180" />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : (
            <div className="space-y-4">
              {(allergiesText || chronics.length === 0 && !diagnoses.length && !meds.length && !currentMedsText) && null}

              {allergiesText && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-xs font-semibold text-destructive uppercase mb-1 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    {lang === "ar" ? "تنبيه: حساسية" : "Allergy alert"}
                  </div>
                  <div className="text-sm">{allergiesText}</div>
                </div>
              )}

              {chronics.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                    {lang === "ar" ? "حالات مزمنة" : "Chronic conditions"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {chronics.map((c) => (
                      <Badge key={c} variant="outline" className="status-review">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                  {lang === "ar" ? "المشكلات النشطة" : "Active problems"}
                </div>
                {diagnoses.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {lang === "ar" ? "لا توجد تشخيصات مسجلة." : "No diagnoses recorded yet."}
                  </div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {diagnoses.slice(0, 5).map((d) => {
                      const name = lang === "ar"
                        ? (d.diagnoses?.name_ar || d.diagnoses?.name_en)
                        : (d.diagnoses?.name_en || d.diagnoses?.name_ar);
                      return (
                        <li key={d.id} className="flex items-start gap-2">
                          <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{name || "—"}</span>
                            {d.diagnoses?.icd_code && (
                              <span className="text-muted-foreground"> · {d.diagnoses.icd_code}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Pill className="size-3.5" />
                  {lang === "ar" ? "الأدوية الحالية" : "Current medications"}
                </div>
                {meds.length === 0 && !currentMedsText ? (
                  <div className="text-sm text-muted-foreground">
                    {lang === "ar" ? "لا توجد أدوية مسجلة." : "No medications recorded."}
                  </div>
                ) : meds.length > 0 ? (
                  <ul className="text-sm space-y-1">
                    {meds.slice(0, 5).map((m) => {
                      const name = lang === "ar"
                        ? (m.medications?.name_ar || m.medications?.name_en)
                        : (m.medications?.name_en || m.medications?.name_ar);
                      const dose = [m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ");
                      return (
                        <li key={m.id} className="flex items-start gap-2">
                          <span className="size-1.5 rounded-full bg-success mt-2 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{name || "—"}</span>
                            {dose && <span className="text-muted-foreground"> · {dose}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{currentMedsText}</div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Visits & Upcoming */}
        <Card className="p-5 shadow-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Recent visits */}
            <section>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="font-semibold text-sm">
                  {lang === "ar" ? "آخر الزيارات" : "Recent visits"}
                </h3>
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link to={`/patients/${patientId}?tab=timeline`}>
                    {lang === "ar" ? "الكل" : "All"}
                    <ArrowRight className="ms-1 size-3 rtl:rotate-180" />
                  </Link>
                </Button>
              </div>
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              ) : recentVisits.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3">
                  {lang === "ar" ? "لا توجد زيارات مسجلة بعد." : "No visits recorded yet."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {recentVisits.map((r) => {
                    const title = r.chief_complaint_en || r.chief_complaint_ar
                      || (lang === "ar" ? "استشارة" : "Consultation");
                    const spec = r.medical_specialties
                      ? (lang === "ar" ? r.medical_specialties.name_ar : r.medical_specialties.name_en) : null;
                    return (
                      <li key={r.id}>
                        <Link to={`/medical/records/${r.id}`}
                          className="block rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                          <div className="text-sm font-medium truncate">{title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {formatDate(r.visit_date, lang)}
                            {spec ? ` · ${spec}` : ""}
                            {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Upcoming */}
            <section>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {lang === "ar" ? "المواعيد القادمة" : "Upcoming appointments"}
                </h3>
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link to="/calendar">
                    {lang === "ar" ? "التقويم" : "Calendar"}
                    <ArrowRight className="ms-1 size-3 rtl:rotate-180" />
                  </Link>
                </Button>
              </div>
              {loading ? (
                <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              ) : upcoming.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3">
                  {lang === "ar" ? "لا توجد مواعيد قادمة." : "No upcoming appointments."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {upcoming.map((a) => {
                    const branch = a.branches
                      ? (lang === "ar" ? (a.branches.name_ar || a.branches.name_en) : (a.branches.name_en || a.branches.name_ar))
                      : null;
                    return (
                      <li key={a.id}
                        className="rounded-lg border border-border p-3 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {formatDateTime(a.scheduled_at, lang)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {[a.procedure, branch, a.profiles?.full_name].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <Badge variant="outline" className={statusTone[a.status] ?? ""}>{a.status}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </Card>
      </div>

      {/* SIDE column */}
      <div className="md:col-span-1 space-y-4">
        {canViewBilling && (
          <Card className="p-5 shadow-card">
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <CreditCard className="size-4 text-primary" />
              {lang === "ar" ? "الملخص المالي" : "Billing snapshot"}
            </h3>
            <BillingMini
              invoices={invoices}
              payments={payments}
              lang={lang}
            />
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border">
              {canPay && (
                <Button size="sm" variant="outline" onClick={onRecordPayment}>
                  {t("recordPayment")}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ms-auto h-8 px-2" onClick={onOpenFinancial}>
                {lang === "ar" ? "كل الفواتير" : "All invoices"}
                <ArrowRight className="ms-1 size-3.5 rtl:rotate-180" />
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-5 shadow-card">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              {lang === "ar" ? "المرفقات" : "Attachments"}
            </h3>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onUploadDocument}>
              <Plus className="size-3.5" />
              <span className="ms-1">{lang === "ar" ? "رفع" : "Upload"}</span>
            </Button>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">
              {lang === "ar" ? "لا توجد مرفقات." : "No attachments uploaded yet."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {docs.map((d) => {
                const title = lang === "ar" ? (d.title_ar || d.title_en) : (d.title_en || d.title_ar);
                return (
                  <button key={d.id} onClick={() => openDoc(d.file_url)}
                    className="text-start p-2 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                    <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-1.5">
                      <FileText className="size-4" />
                    </div>
                    <div className="text-xs font-medium truncate">{title || "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {d.document_type} · {formatDate(d.created_at, lang)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function BillingMini({
  invoices, payments, lang,
}: { invoices: any[]; payments: any[]; lang: "ar" | "en" }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const open = invoices.filter((i) => i.status !== "cancelled" && (Number(i.total) - Number(i.paid_amount)) > 0.009);
  const overdue = open.filter((i) => i.due_date && new Date(i.due_date).getTime() < today.getTime());
  const overdueAmt = overdue.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);
  const openAmt = open.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const total = invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Number(i.total), 0);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {lang === "ar" ? "الإجمالي" : "Total"}
          </div>
          <div className="font-bold tabular-nums">{formatMoney(total, lang)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {lang === "ar" ? "المدفوع" : "Paid"}
          </div>
          <div className="font-bold tabular-nums text-success">{formatMoney(paid, lang)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {lang === "ar" ? "المتبقي" : "Remaining"}
          </div>
          <div className={`font-bold tabular-nums ${openAmt > 0 ? "text-warning" : ""}`}>{formatMoney(openAmt, lang)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {lang === "ar" ? "متأخر" : "Overdue"}
          </div>
          <div className={`font-bold tabular-nums ${overdueAmt > 0 ? "text-destructive" : ""}`}>{formatMoney(overdueAmt, lang)}</div>
        </div>
      </div>
      <div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${overdueAmt > 0 ? "bg-destructive" : openAmt > 0 ? "bg-warning" : "bg-success"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>{pct}% {lang === "ar" ? "مدفوع" : "paid"}</span>
          <span className={overdueAmt > 0 ? "text-destructive" : openAmt > 0 ? "text-warning" : "text-success"}>
            {overdueAmt > 0
              ? (lang === "ar" ? "متأخر" : "Overdue")
              : openAmt > 0
                ? (lang === "ar" ? "متبقي" : "Outstanding")
                : (lang === "ar" ? "مسدّد" : "On track")}
          </span>
        </div>
      </div>
    </div>
  );
}