import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, CreditCard, Phone, Mail, MapPin, Calendar, Stethoscope, Trash2, Shield, Pencil, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { CreateInvoiceDialog } from "../invoices/CreateInvoiceDialog";
import PatientMedicalTab from "./PatientMedicalTab";
import { EditPatientDialog } from "./EditPatientDialog";
import PatientTreatmentPlans from "./PatientTreatmentPlans";
import PatientTimeline from "./PatientTimeline";
import PatientWalletTab from "./PatientWalletTab";
import { Can } from "@/components/Can";
import PatientSummaryStrip from "./PatientSummaryStrip";
import PatientFinancialCard from "./PatientFinancialCard";
import PatientQuickActions from "./PatientQuickActions";
import PatientDocumentsTab from "./PatientDocumentsTab";
import PatientPortalCard from "./PatientPortalCard";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useBranch } from "@/contexts/BranchContext";
import PatientOverviewSnapshot from "./PatientOverviewSnapshot";
import { logPhiAccess } from "@/lib/observability/phiAudit";
import { patientDisplayDirection, patientDisplayName } from "@/lib/patientName";
import { doctorDisplayName, type DoctorNameFields } from "@/lib/doctorName";

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", paid: "status-completed", partial: "status-progress", cancelled: "status-departed",
};

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  // R2: canonical authorization entry point.
  const { authz } = useAuthorization("PatientProfile");
  const { isModuleEnabled } = useBranch();
  const canViewMedical = authz.can("medical_records.view");
  const canViewBilling = authz.can("invoices.view");
  const canViewAppointments = authz.can("appointments.view");
  const canUseDental = canViewMedical && isModuleEnabled("dental");
  const canUsePhysio = canViewMedical && isModuleEnabled("physio");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") ?? "overview";
  const tabParam = !canViewMedical && ["timeline", "clinical", "documents", "physio"].includes(requestedTab)
    ? "overview"
    : requestedTab;
  const uploadFlag = searchParams.get("upload") === "1";
  const [patient, setPatient] = useState<any>(null);
  const [insurer, setInsurer] = useState<any>(null);
  const [assignedDoctor, setAssignedDoctor] = useState<DoctorNameFields | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [clinicalView, setClinicalView] = useState<"medical" | "plans">("medical");
  const [reloadKey, setReloadKey] = useState(0);
  const [physioCases, setPhysioCases] = useState<any[]>([]);
  const [physioStats, setPhysioStats] = useState<{ active: number; lastSession: string | null; lastReassessment: string | null; nextFollowup: string | null; overdueFollowup: string | null } | null>(null);
  const [activePhysioCaseId, setActivePhysioCaseId] = useState<string | null>(null);
  const phiLogged = useRef(false);

  useEffect(() => {
    if (!id) return;
    if (!canUsePhysio) { setPhysioCases([]); setPhysioStats(null); setActivePhysioCaseId(null); return; }
    (async () => {
      // Full set (branch-scoped) for accurate stats.
      let allQ = supabase.from("physio_cases" as any)
        .select("id,status,followup_enabled,followup_due_date,branch_id")
        .eq("patient_id", id).is("deleted_at", null);
      if ((patient as any)?.branch_id) allQ = allQ.eq("branch_id", (patient as any).branch_id);
      const { data: all } = await allQ;
      const allList = (all as any) ?? [];
      const allCaseIds = allList.map((c: any) => c.id);
      const firstActive = allList.find((c: any) => c.status === "active");
      setActivePhysioCaseId(firstActive?.id ?? null);
      // Preview list (5 most recent) for display.
      let prevQ = supabase.from("physio_cases" as any)
        .select("id,diagnosis,status,start_date,expected_sessions,followup_enabled,followup_due_date,branch_id")
        .eq("patient_id", id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(5);
      if ((patient as any)?.branch_id) prevQ = prevQ.eq("branch_id", (patient as any).branch_id);
      const { data: preview } = await prevQ;
      setPhysioCases((preview as any) ?? []);
      if (!allCaseIds.length) { setPhysioStats({ active: 0, lastSession: null, lastReassessment: null, nextFollowup: null, overdueFollowup: null }); return; }
      const [{ data: ss }, { data: rs }] = await Promise.all([
        supabase.from("physio_sessions" as any).select("session_date").in("case_id", allCaseIds).is("deleted_at", null).eq("attendance", "done").order("session_date", { ascending: false }).limit(1),
        supabase.from("physio_reassessments" as any).select("assessment_date").in("case_id", allCaseIds).is("deleted_at", null).order("assessment_date", { ascending: false }).limit(1),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const activeFollowups = allList
        .filter((c: any) => c.status === "active" && c.followup_enabled && c.followup_due_date)
        .map((c: any) => c.followup_due_date)
        .sort();
      const overdue = activeFollowups.filter((d: string) => d < today);
      const upcoming = activeFollowups.filter((d: string) => d >= today);
      setPhysioStats({
        active: allList.filter((c: any) => c.status === "active").length,
        lastSession: (ss as any)?.[0]?.session_date ?? null,
        lastReassessment: (rs as any)?.[0]?.assessment_date ?? null,
        nextFollowup: upcoming[0] ?? null,
        overdueFollowup: overdue[overdue.length - 1] ?? null,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey, canUsePhysio, patient?.branch_id]);

  const setTab = (next: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    p.delete("upload");
    setSearchParams(p, { replace: true });
  };

  const load = async () => {
    if (!id) return;
    const [{ data: p, error: pe }, { data: invs }, { data: pays }] = await Promise.all([
      supabase.from("patients").select("*").eq("id", id).maybeSingle(),
      supabase.from("invoices").select("*").eq("patient_id", id).order("invoice_date", { ascending: false }),
      supabase.from("payments").select("*, invoices(invoice_number)").eq("patient_id", id).order("created_at", { ascending: false }),
    ]);
    if (pe) toast.error(pe.message);
    setPatient(p); setInvoices(invs ?? []); setPayments(pays ?? []);
    if (p?.insurance_company_id) {
      const { data: ins } = await (supabase as any).from("insurance_companies").select("*").eq("id", p.insurance_company_id).maybeSingle();
      setInsurer(ins);
    } else { setInsurer(null); }
    if (p?.assigned_doctor_id) {
      const { data: prof } = await supabase.from("profiles").select("full_name,full_name_en,full_name_ar").eq("id", p.assigned_doctor_id).maybeSingle();
      setAssignedDoctor(prof ?? null);
    } else { setAssignedDoctor(null); }
    // Task B: log PHI access once after data arrives, guarded against re-fires.
    if (p?.id) {
      if (!phiLogged.current) {
        phiLogged.current = true;
        logPhiAccess("patient", p.id, { patientId: p.id });
      }
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!patient) return <div className="text-center text-muted-foreground py-10">…</div>;

  const name = patientDisplayName(patient, lang);
  const nameDir = patientDisplayDirection(patient, lang);

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalOutstanding = invoices
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);

  const handleDelete = async () => {
    const { error } = await supabase.from("patients").update({ deleted_at: new Date().toISOString() } as any).eq("id", patient.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حذف المريض" : "Patient deleted");
    navigate("/patients");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/patients"><ArrowLeft className="me-2 size-4" />{t("patients")}</Link></Button>
        <div className="flex w-full sm:w-auto flex-wrap items-center justify-end gap-2">
          {canUseDental && (
            <Button asChild variant="outline" size="sm"><Link to={`/patients/${patient.id}/dental`}><Stethoscope className="me-2 size-4"/>{t("dentalChart")}</Link></Button>
          )}
          <Can permission="patients.edit">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="me-2 size-4" />{t("edit")}
            </Button>
          </Can>
          <Can permission="invoices.create">
            <Button className="gradient-primary text-primary-foreground" onClick={() => setCreateOpen(true)}>
              <FileText className="me-2 size-4" />{t("createInvoice")}
            </Button>
          </Can>
          <Can permission="patients.delete">
            <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="me-2 size-4" />{lang === "ar" ? "حذف" : "Delete"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{lang === "ar" ? "حذف المريض" : "Delete patient"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {lang === "ar"
                      ? "هل أنت متأكد من حذف هذا المريض؟ لا يمكن التراجع عن هذا الإجراء."
                      : "Are you sure you want to delete this patient? This action cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {lang === "ar" ? "حذف" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Can>
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-16 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 dir={nameDir} className="text-2xl font-bold">{name}</h1>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {patient.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail className="size-3" />{patient.email}</span>}
              {patient.city && <span className="flex items-center gap-1"><MapPin className="size-3" />{patient.city}</span>}
              {patient.dob && <span className="flex items-center gap-1"><Calendar className="size-3" />{formatDate(patient.dob, lang)}</span>}
            </div>
          </div>
          {canViewBilling ? (
            <div className="grid grid-cols-2 gap-4 text-end">
              <div>
                <div className="text-xs text-muted-foreground">{t("paid")}</div>
                <div className="text-lg font-bold tabular-nums text-success">{formatMoney(totalPaid, lang)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t("remaining")}</div>
                <div className="text-lg font-bold tabular-nums text-warning">{formatMoney(totalOutstanding, lang)}</div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <PatientSummaryStrip patientId={patient.id} patient={patient} insurer={insurer} canViewClinical={canViewMedical} canViewAppointments={canViewAppointments} />

      <PatientQuickActions
        onBook={() => navigate("/calendar")}
        onCreateInvoice={() => setCreateOpen(true)}
        onRecordPayment={() => setPayOpen(true)}
        onTopupWallet={() => setTab("financial")}
        onUploadDocument={() => {
          const p = new URLSearchParams(searchParams);
          p.set("tab", "documents"); p.set("upload", "1");
          setSearchParams(p, { replace: true });
        }}
      />

      {canViewBilling && (
        <PatientFinancialCard
          patientId={patient.id}
          invoices={invoices}
          payments={payments}
          onRecordPayment={() => setPayOpen(true)}
          onTopupWallet={() => setTab("financial")}
          onOpenFinancial={() => setTab("financial")}
          canPay={authz.can("invoices.create")}
          canTopup={authz.can("invoices.create")}
          reloadKey={reloadKey}
        />
      )}

      <Tabs value={tabParam} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          {canViewMedical ? <TabsTrigger value="timeline">{t("timelineTab")}</TabsTrigger> : null}
          {canViewMedical ? <TabsTrigger value="clinical">{lang === "ar" ? "السريري" : "Clinical"}</TabsTrigger> : null}
          {canUsePhysio && (
            <TabsTrigger value="physio">{lang === "ar" ? "العلاج الطبيعي" : "Physiotherapy"}</TabsTrigger>
          )}
          {canViewBilling && (
            <TabsTrigger value="financial">{lang === "ar" ? "المالي" : "Financial"}</TabsTrigger>
          )}
          {canViewMedical ? <TabsTrigger value="documents">{lang === "ar" ? "المستندات" : "Documents"}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {canViewMedical ? <PatientOverviewSnapshot
            patientId={patient.id}
            invoices={invoices}
            payments={payments}
            canViewBilling={canViewBilling}
            canPay={authz.can("invoices.create")}
            canTopup={authz.can("invoices.create")}
            reloadKey={reloadKey}
            onRecordPayment={() => setPayOpen(true)}
            onTopupWallet={() => setTab("financial")}
            onOpenFinancial={() => setTab("financial")}
            onUploadDocument={() => {
              const p = new URLSearchParams(searchParams);
              p.set("tab", "documents"); p.set("upload", "1");
              setSearchParams(p, { replace: true });
            }}
          /> : null}
          <Card className="p-6 shadow-card mt-4">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground text-xs">{t("gender")}</div><div>{patient.gender ? t(patient.gender as any) : "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("nationality")}</div><div>{patient.nationality ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("address")}</div><div>{patient.address ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("referralSource")}</div><div>{patient.referral_source ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "الطبيب المسؤول" : "Assigned Doctor"}</div><div>{assignedDoctor ? doctorDisplayName(assignedDoctor, lang) : "—"}</div></div>
              {patient.notes && <div className="sm:col-span-2"><div className="text-muted-foreground text-xs">{t("notes")}</div><div className="whitespace-pre-wrap">{patient.notes}</div></div>}
            </div>
          </Card>
          <Can permission="patients.edit">
            <div className="mt-4">
              <PatientPortalCard patientId={patient.id} patientEmail={patient.email ?? null} />
            </div>
          </Can>
          {(insurer || patient.insurance_policy_number) && (
            <Card className="p-6 shadow-card mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="size-4 text-primary" />
                <h3 className="font-semibold">{lang === "ar" ? "التأمين" : "Insurance"}</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                {insurer && <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "شركة التأمين" : "Insurance Company"}</div><div className="font-medium">{lang === "ar" ? (insurer.name_ar || insurer.name_en) : insurer.name_en}</div></div>}
                {patient.insurance_policy_number && <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "رقم البوليصة" : "Policy #"}</div><div>{patient.insurance_policy_number}</div></div>}
                {patient.insurance_coverage_ratio != null && <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "نسبة التغطية" : "Coverage"}</div><div>{patient.insurance_coverage_ratio}%</div></div>}
                {patient.insurance_policy_expiry && <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "تاريخ انتهاء البوليصة" : "Policy Expiry"}</div><div>{formatDate(patient.insurance_policy_expiry, lang)}</div></div>}
              </div>
            </Card>
          )}
        </TabsContent>

        {canViewMedical ? (
        <TabsContent value="timeline" className="mt-4">
          <PatientTimeline patientId={patient.id} />
        </TabsContent>
        ) : null}

        {canViewMedical ? (
        <TabsContent value="clinical" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setClinicalView("medical")}
                className={`px-3 py-1 text-sm rounded ${clinicalView === "medical" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {t("medicalTab")}
              </button>
              {authz.can("treatment_plans.view") && (
                <button
                  type="button"
                  onClick={() => setClinicalView("plans")}
                  className={`px-3 py-1 text-sm rounded ${clinicalView === "plans" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  {lang === "ar" ? "خطط العلاج" : "Treatment Plans"}
                </button>
              )}
            </div>
            {canUseDental && (
              <Button asChild variant="ghost" size="sm" className="ms-auto">
                <Link to={`/patients/${patient.id}/dental`}>
                  <Stethoscope className="me-2 size-4" />{t("dentalChart")}
                </Link>
              </Button>
            )}
          </div>
          {clinicalView === "medical" ? (
            <PatientMedicalTab patientId={patient.id} />
          ) : (
            <Can module="treatment_plans" action="view" fallback={<div className="text-center text-muted-foreground py-10">{lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}</div>}>
              <PatientTreatmentPlans patientId={patient.id} />
            </Can>
          )}
        </TabsContent>
        ) : null}

        {canUsePhysio && (
        <TabsContent value="physio" className="mt-4">
          <Can module="medical_records" action="view" fallback={<div className="text-center text-muted-foreground py-10">{lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}</div>}>
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="size-5 text-primary" />{lang === "ar" ? "العلاج الطبيعي" : "Physiotherapy"}
                  </h3>
                  <p className="text-xs text-muted-foreground">{lang === "ar" ? "حالات وجلسات ومتابعات المريض" : "Cases, sessions and follow-ups for this patient"}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activePhysioCaseId && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/physio/${activePhysioCaseId}`}>{lang === "ar" ? "افتح الحالة النشطة" : "Open active case"}</Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/physio">{lang === "ar" ? "كل الحالات" : "All cases"}</Link>
                  </Button>
                  <Can module="medical_records" action="create">
                    <Button
                      asChild
                      size="sm"
                      className={physioCases.length === 0 ? "gradient-primary text-primary-foreground" : ""}
                      variant={physioCases.length === 0 ? "default" : "outline"}
                    >
                      <Link to={`/physio?patient=${patient.id}&new=1`}>
                        <Activity className="me-2 size-4" />{lang === "ar" ? "حالة جديدة" : "New case"}
                      </Link>
                    </Button>
                  </Can>
                </div>
              </div>

              {physioStats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card className="p-3 shadow-card border-l-4 border-l-primary bg-primary/5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "نشطة" : "Active"}</div>
                    <div className="text-2xl font-bold tabular-nums">{physioStats.active}</div>
                  </Card>
                  <Card className="p-3 shadow-card border-l-4 border-l-emerald-500 bg-emerald-500/5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "آخر جلسة" : "Last session"}</div>
                    <div className="text-sm font-semibold">{physioStats.lastSession ? formatDate(physioStats.lastSession, lang) : "—"}</div>
                  </Card>
                  <Card className="p-3 shadow-card border-l-4 border-l-sky-500 bg-sky-500/5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "آخر تقييم" : "Last reassessment"}</div>
                    <div className="text-sm font-semibold">{physioStats.lastReassessment ? formatDate(physioStats.lastReassessment, lang) : "—"}</div>
                  </Card>
                  <Card className="p-3 shadow-card border-l-4 border-l-amber-500 bg-amber-500/5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "متابعة قادمة" : "Next follow-up"}</div>
                    <div className="text-sm font-semibold">{physioStats.nextFollowup ? formatDate(physioStats.nextFollowup, lang) : "—"}</div>
                  </Card>
                  <Card className={`p-3 shadow-card border-l-4 ${physioStats.overdueFollowup ? "border-l-destructive bg-destructive/5" : "border-l-muted bg-muted/30"}`}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "متأخرة" : "Overdue"}</div>
                    <div className={`text-sm font-semibold ${physioStats.overdueFollowup ? "text-destructive" : ""}`}>
                      {physioStats.overdueFollowup ? formatDate(physioStats.overdueFollowup, lang) : "—"}
                    </div>
                  </Card>
                </div>
              )}

              <Card className="shadow-card overflow-hidden">
                {physioCases.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Activity className="size-6" />
                    </div>
                    <div className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد حالات علاج طبيعي بعد" : "No physiotherapy cases yet."}</div>
                    <Can module="medical_records" action="create">
                      <Button asChild className="gradient-primary text-primary-foreground">
                        <Link to={`/physio?patient=${patient.id}&new=1`}>
                          <Activity className="me-2 size-4" />{lang === "ar" ? "إنشاء حالة جديدة" : "Create new case"}
                        </Link>
                      </Button>
                    </Can>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {physioCases.map((pc) => (
                      <Link key={pc.id} to={`/physio/${pc.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <Activity className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{pc.diagnosis || "—"}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(pc.start_date, lang)}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{pc.status}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </Can>
        </TabsContent>
        )}

        <TabsContent value="financial" className="mt-4 space-y-6">
          <Can module="invoices" action="view" fallback={<div className="text-center text-muted-foreground py-10">{lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}</div>}>
            <PatientWalletTab key={reloadKey} patientId={patient.id} />

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("invoices")}</h3>
              <Card className="shadow-card overflow-hidden">
                {invoices.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">{t("noInvoices")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {invoices.map((inv) => {
                      const remaining = +(Number(inv.total) - Number(inv.paid_amount)).toFixed(2);
                      const statusLabel = ({ draft: t("statusDraft"), pending: t("statusPending"), paid: t("statusPaid"), partial: t("statusPartial"), cancelled: t("statusCancelled") } as any)[inv.status];
                      return (
                        <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                          <FileText className="size-5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{inv.invoice_number}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(inv.invoice_date, lang)}</div>
                          </div>
                          <Badge variant="outline" className={statusClass[inv.status]}>{statusLabel}</Badge>
                          <div className="text-end">
                            <div className="font-semibold tabular-nums">{formatMoney(inv.total, lang)}</div>
                            {remaining > 0 && <div className="text-xs text-warning tabular-nums">{formatMoney(remaining, lang)}</div>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("paymentHistory")}</h3>
              <Card className="shadow-card overflow-hidden">
                {payments.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">{t("noPayments")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {payments.map((pay) => (
                      <div key={pay.id} className="flex items-center gap-4 p-4">
                        <div className="size-9 rounded-lg bg-success/10 text-success flex items-center justify-center">
                          <CreditCard className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium tabular-nums">{formatMoney(pay.amount, lang)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(pay.created_at, lang)} · {t(pay.payment_method as any) ?? pay.payment_method}
                            {pay.invoices?.invoice_number && <> · <Link to={`/invoices/${pay.invoice_id}`} className="text-primary hover:underline">{pay.invoices.invoice_number}</Link></>}
                          </div>
                        </div>
                        {pay.reference_number && <Badge variant="outline" className="text-[10px]">{pay.reference_number}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </Can>
        </TabsContent>

        {canViewMedical ? (
        <TabsContent value="documents" className="mt-4">
          <PatientDocumentsTab patientId={patient.id} autoOpenUpload={uploadFlag} />
        </TabsContent>
        ) : null}
      </Tabs>

      <CreateInvoiceDialog
        open={createOpen} onOpenChange={setCreateOpen}
        presetPatientId={patient.id}
        onSaved={() => { setCreateOpen(false); load(); setReloadKey((k) => k + 1); }}
      />
      <RecordPaymentDialog
        open={payOpen} onOpenChange={setPayOpen}
        patientId={patient.id}
        onSaved={() => { setPayOpen(false); load(); setReloadKey((k) => k + 1); }}
      />
      <EditPatientDialog
        open={editOpen} onOpenChange={setEditOpen}
        patient={patient}
        onSaved={() => { setEditOpen(false); load(); }}
      />
    </div>
  );
}
