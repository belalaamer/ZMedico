import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, CreditCard, Phone, Mail, MapPin, Calendar, Stethoscope, Trash2, Shield, Pencil } from "lucide-react";
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
import { Can } from "@/components/Can";

const statusClass: Record<string, string> = {
  draft: "status-cancelled", pending: "status-review", paid: "status-completed", partial: "status-progress", cancelled: "status-departed",
};

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [patient, setPatient] = useState<any>(null);
  const [insurer, setInsurer] = useState<any>(null);
  const [assignedDoctorName, setAssignedDoctorName] = useState<string>("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", p.assigned_doctor_id).maybeSingle();
      setAssignedDoctorName(prof?.full_name ?? "");
    } else { setAssignedDoctorName(""); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!patient) return <div className="text-center text-muted-foreground py-10">…</div>;

  const name = lang === "ar"
    ? `${patient.first_name_ar ?? patient.first_name_en} ${patient.last_name_ar ?? patient.last_name_en ?? ""}`.trim()
    : `${patient.first_name_en} ${patient.last_name_en ?? ""}`.trim();

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
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to={`/patients/${patient.id}/dental`}><Stethoscope className="me-2 size-4"/>{t("dentalChart")}</Link></Button>
          <Can module="patients" action="edit">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="me-2 size-4" />{t("edit")}
            </Button>
          </Can>
          <Button className="gradient-primary text-primary-foreground" onClick={() => setCreateOpen(true)}>
            <FileText className="me-2 size-4" />{t("createInvoice")}
          </Button>
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
        </div>
      </div>

      <Card className="p-6 shadow-card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="size-16 rounded-full gradient-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{name}</h1>
              <Badge variant="outline">#{patient.patient_code}</Badge>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {patient.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail className="size-3" />{patient.email}</span>}
              {patient.city && <span className="flex items-center gap-1"><MapPin className="size-3" />{patient.city}</span>}
              {patient.dob && <span className="flex items-center gap-1"><Calendar className="size-3" />{formatDate(patient.dob, lang)}</span>}
            </div>
          </div>
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
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="medical">{t("medicalTab")}</TabsTrigger>
          <Can module="patients" action="edit">
            <TabsTrigger value="plans">{lang === "ar" ? "خطط العلاج" : "Treatment Plans"}</TabsTrigger>
          </Can>
          <TabsTrigger value="invoices">{t("invoices")}</TabsTrigger>
          <TabsTrigger value="payments">{t("paymentHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-6 shadow-card">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground text-xs">{t("gender")}</div><div>{patient.gender ? t(patient.gender as any) : "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("nationality")}</div><div>{patient.nationality ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("address")}</div><div>{patient.address ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{t("referralSource")}</div><div>{patient.referral_source ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">{lang === "ar" ? "الطبيب المسؤول" : "Assigned Doctor"}</div><div>{assignedDoctorName || "—"}</div></div>
              {patient.notes && <div className="sm:col-span-2"><div className="text-muted-foreground text-xs">{t("notes")}</div><div className="whitespace-pre-wrap">{patient.notes}</div></div>}
            </div>
          </Card>
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

        <TabsContent value="medical" className="mt-4">
          <PatientMedicalTab patientId={patient.id} />
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <Can module="patients" action="edit" fallback={<div className="text-center text-muted-foreground py-10">{lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}</div>}>
            <PatientTreatmentPlans patientId={patient.id} />
          </Can>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
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
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
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
        </TabsContent>
      </Tabs>

      <CreateInvoiceDialog
        open={createOpen} onOpenChange={setCreateOpen}
        presetPatientId={patient.id}
        onSaved={() => { setCreateOpen(false); load(); }}
      />
      <EditPatientDialog
        open={editOpen} onOpenChange={setEditOpen}
        patient={patient}
        onSaved={() => { setEditOpen(false); load(); }}
      />
    </div>
  );
}