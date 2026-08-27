import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Loader2, Mail, Phone, Rocket, Trash2, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CLINIC_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { normalizeTenantSlug } from "@/lib/saasOnboarding";
import { defaultModulesForPlan, planAllowsModule } from "@/lib/subscriptionEntitlements";

type RequestRow = {
  id: string;
  clinic_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  plan_id: string | null;
  plan_name_en: string | null;
  plan_name_ar: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  provisioned_tenant_id: string | null;
  provisioned_branch_id: string | null;
  provisioned_at: string | null;
};

type Plan = {
  id: string;
  name_ar: string;
  name_en: string;
  features: Record<string, boolean>;
};

type ProvisionForm = {
  tenantName: string;
  slug: string;
  billingEmail: string;
  planId: string;
  branchNameEn: string;
  branchNameAr: string;
  phone: string;
  city: string;
  address: string;
  durationDays: string;
  billingCycle: "monthly" | "yearly";
};

type Props = { onChanged?: () => void | Promise<void> };

const coreKeys = new Set<ClinicModuleKey>(CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => module.key));

function statusLabel(status: string, isAr: boolean) {
  const labels: Record<string, string> = {
    pending: isAr ? "جديد" : "Pending",
    contacted: isAr ? "تم التواصل" : "Contacted",
    approved: isAr ? "مقبول" : "Approved",
    rejected: isAr ? "مرفوض" : "Rejected",
    closed: isAr ? "مغلق" : "Closed",
  };
  return labels[status] ?? status;
}

function initialModules(plan: Plan | undefined) {
  return new Set<ClinicModuleKey>(defaultModulesForPlan(plan?.features ?? {}));
}

export default function SubscriptionRequestsPanel({ onChanged }: Props) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionRequest, setProvisionRequest] = useState<RequestRow | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<RequestRow | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState<ProvisionForm>({
    tenantName: "",
    slug: "",
    billingEmail: "",
    planId: "",
    branchNameEn: "",
    branchNameAr: "",
    phone: "",
    city: "",
    address: "",
    durationDays: "14",
    billingCycle: "monthly",
  });
  const [selectedModules, setSelectedModules] = useState<Set<ClinicModuleKey>>(new Set(coreKeys));

  const loadPlans = useCallback(async () => {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id,name_ar,name_en,features")
      .eq("is_active", true)
      .order("display_order");
    if (!error) setPlans((data ?? []) as unknown as Plan[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("platform_list_subscription_requests" as never, { p_status: status } as never);
    if (error) toast({ title: isAr ? "تعذر تحميل طلبات الاشتراك" : "Unable to load subscription requests", variant: "destructive" });
    setRows((data ?? []) as RequestRow[]);
    setLoading(false);
  }, [isAr, status, toast]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => { void load(); }, [load]);

  const openProvisioning = (row: RequestRow) => {
    const requestedPlan = plans.find((plan) => plan.id === row.plan_id);
    setProvisionRequest(row);
    setSlugEdited(false);
    setForm({
      tenantName: row.clinic_name,
      slug: normalizeTenantSlug(row.clinic_name),
      billingEmail: row.email,
      planId: row.plan_id ?? requestedPlan?.id ?? "",
      branchNameEn: row.clinic_name,
      branchNameAr: row.clinic_name,
      phone: row.phone ?? "",
      city: "",
      address: "",
      durationDays: "14",
      billingCycle: "monthly",
    });
    setSelectedModules(initialModules(requestedPlan));
  };

  const closeProvisioning = (open: boolean) => {
    if (!open && !provisioning) setProvisionRequest(null);
  };

  const updateRequest = async (id: string, nextStatus: string) => {
    setUpdating(id);
    const result = await supabase.rpc("platform_update_subscription_request" as never, {
      p_request_id: id,
      p_status: nextStatus,
      p_notes: null,
    } as never);
    setUpdating(null);
    if (result.error) {
      toast({ title: isAr ? "تعذر تحديث الطلب" : "Unable to update request", variant: "destructive" });
      return;
    }
    toast({
      title: nextStatus === "approved"
        ? (isAr ? "تمت الموافقة. راجع الإعدادات قبل إنشاء النظام." : "Request approved. Review the setup before creating the workspace.")
        : (isAr ? "تم تحديث حالة الطلب" : "Request status updated"),
    });
    await onChanged?.();
    await load();
  };

  const submitProvisioning = async () => {
    if (!provisionRequest) return;
    const tenantName = form.tenantName.trim();
    const slug = form.slug.trim().toLowerCase();
    const branchNameEn = form.branchNameEn.trim();
    const durationDays = Number.parseInt(form.durationDays, 10);
    if (!tenantName || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || !branchNameEn || !form.planId) {
      toast({ title: isAr ? "راجع اسم العميل وSlug والخطة واسم الفرع" : "Review the tenant name, slug, plan and branch name", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      toast({ title: isAr ? "المدة يجب أن تكون بين يوم و3650 يومًا" : "Duration must be between 1 and 3650 days", variant: "destructive" });
      return;
    }
    setProvisioning(true);
    const payload = {
      tenant: { name: tenantName, slug, billing_email: form.billingEmail.trim() || null, plan_id: form.planId },
      subscription: { duration_days: durationDays, billing_cycle: form.billingCycle },
      branch: {
        name_en: branchNameEn,
        name_ar: form.branchNameAr.trim() || branchNameEn,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
      },
      modules: Array.from(selectedModules),
    };
    const result = await supabase.rpc("platform_provision_approved_subscription_request" as never, {
      p_request_id: provisionRequest.id,
      p_payload: payload,
      p_notes: null,
    } as never);
    setProvisioning(false);
    if (result.error || !result.data) {
      toast({ title: result.error?.message ?? (isAr ? "تعذر إنشاء الـWorkspace" : "Unable to create the workspace"), variant: "destructive" });
      return;
    }
    const created = result.data as { tenant_id?: string; branch_id?: string; already_provisioned?: boolean };
    toast({
      title: created.already_provisioned
        ? (isAr ? "الـWorkspace موجود بالفعل" : "Workspace already exists")
        : (isAr ? "تم إنشاء الـWorkspace بعد المراجعة" : "Workspace created after review"),
      description: created.tenant_id ? `${isAr ? "معرّف العميل" : "Tenant"}: ${created.tenant_id.slice(0, 8)}…` : undefined,
    });
    setProvisionRequest(null);
    await onChanged?.();
    await load();
  };

  const deleteSelectedRequest = async () => {
    if (!deleteRequest) return;
    setDeletingRequest(true);
    const { error } = await supabase.rpc("platform_delete_subscription_request" as never, { p_request_id: deleteRequest.id } as never);
    setDeletingRequest(false);
    if (error) {
      toast({ title: isAr ? "تعذر حذف الطلب" : "Unable to delete the request", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم حذف طلب الاشتراك" : "Subscription request deleted" });
    setDeleteRequest(null);
    await onChanged?.();
    await load();
  };

  const closeSelectedRequest = async (row: RequestRow) => {
    setUpdating(row.id);
    const { error } = await supabase.rpc("platform_close_subscription_request" as never, { p_request_id: row.id } as never);
    setUpdating(null);
    if (error) {
      toast({ title: isAr ? "تعذر إغلاق الطلب" : "Unable to close the request", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم إغلاق سجل الطلب" : "Request record closed" });
    await onChanged?.();
    await load();
  };

  const groups = useMemo(() => [
    { key: "core", title: isAr ? "الوحدات المدفوعة" : "Plan-gated modules" },
    { key: "specialty", title: isAr ? "الوحدات التخصصية" : "Specialty modules" },
    { key: "business", title: isAr ? "وحدات الأعمال" : "Business modules" },
  ], [isAr]);

  return <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-4 text-primary" />{isAr ? "طلبات الاشتراك" : "Subscription requests"}</CardTitle>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[145px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["pending", "contacted", "approved", "rejected", "closed", "all"] as const).map((value) => <SelectItem key={value} value={value}>{value === "all" ? (isAr ? "كل الطلبات" : "All requests") : statusLabel(value, isAr)}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ التحميل…" : "Loading…"}</div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{isAr ? "لا توجد طلبات في هذه الحالة." : "No requests in this status."}</div> : <div className="space-y-3">
          {rows.map((row) => <div key={row.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{row.clinic_name}</span><Badge variant={row.status === "pending" ? "default" : "secondary"}>{statusLabel(row.status, isAr)}</Badge></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{row.owner_name}</span><span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{row.email}</span>{row.phone ? <span className="inline-flex items-center gap-1" dir="ltr"><Phone className="size-3.5" />{row.phone}</span> : null}</div>
                <p className="mt-2 text-xs text-muted-foreground">{isAr ? "الخطة المفضلة: " : "Preferred plan: "}{isAr ? row.plan_name_ar ?? "لم يحدد" : row.plan_name_en ?? "Not specified"} · {new Date(row.created_at).toLocaleString(isAr ? "ar-EG" : "en-EG")}</p>
                {row.provisioned_tenant_id ? <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{isAr ? "تم إنشاء Workspace والفرع الأول" : "Workspace and first branch provisioned"}</p> : row.status === "approved" ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{isAr ? "تمت الموافقة؛ راجع الإعدادات ثم أنشئ النظام" : "Approved; review the setup, then create the workspace"}</p> : null}
                {row.message ? <p className="mt-2 text-sm leading-6">{row.message}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {row.status === "pending" ? <Button size="sm" variant="outline" onClick={() => void updateRequest(row.id, "contacted")} disabled={updating === row.id}>{updating === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}{isAr ? "تم التواصل" : "Mark contacted"}</Button> : null}
                {row.status === "pending" || row.status === "contacted" ? <Button size="sm" onClick={() => void updateRequest(row.id, "approved")} disabled={updating === row.id}>{updating === row.id ? <Loader2 className="me-1 size-3.5 animate-spin" /> : <Check className="me-1 size-3.5" />}{isAr ? "موافقة فقط" : "Approve only"}</Button> : null}
                {row.status === "approved" && !row.provisioned_tenant_id ? <Button size="sm" onClick={() => openProvisioning(row)}><Rocket className="me-1 size-3.5" />{isAr ? "مراجعة وإنشاء النظام" : "Review & create workspace"}</Button> : null}
                {row.status === "pending" || row.status === "contacted" ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void updateRequest(row.id, "rejected")} disabled={updating === row.id}><X className="me-1 size-3.5" />{isAr ? "رفض" : "Reject"}</Button> : null}
                {!row.provisioned_tenant_id ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteRequest(row)} disabled={updating === row.id}><Trash2 className="me-1 size-3.5" />{isAr ? "حذف الطلب" : "Delete request"}</Button> : row.status !== "closed" ? <Button size="sm" variant="ghost" onClick={() => void closeSelectedRequest(row)} disabled={updating === row.id}>{updating === row.id ? <Loader2 className="me-1 size-3.5 animate-spin" /> : null}{isAr ? "إغلاق السجل" : "Close record"}</Button> : null}
              </div>
            </div>
          </div>)}
        </div>}
      </CardContent>
    </Card>

    <Dialog open={!!provisionRequest} onOpenChange={closeProvisioning}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><Rocket className="size-5 text-primary" />{isAr ? "مراجعة إنشاء Workspace" : "Review workspace creation"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{isAr ? "لن يتم إنشاء أي شيء حتى تضغط تأكيد الإنشاء. راجع الخطة والمدة والفرع والوحدات أولًا." : "Nothing will be created until you confirm. Review the plan, term, branch and modules first."}</p>
        </DialogHeader>
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="font-semibold">{isAr ? "بيانات العميل والاشتراك" : "Tenant and subscription"}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{isAr ? "اسم العميل / العيادة" : "Tenant / clinic name"}</Label><Input value={form.tenantName} onChange={(e) => { const value = e.target.value; setForm((current) => ({ ...current, tenantName: value, slug: slugEdited ? current.slug : normalizeTenantSlug(value) })); }} /></div>
              <div className="space-y-1.5"><Label>Slug</Label><Input dir="ltr" value={form.slug} onChange={(e) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: normalizeTenantSlug(e.target.value) })); }} /><p className="text-xs text-muted-foreground">{isAr ? "حروف إنجليزية صغيرة وأرقام وشرطات فقط." : "Lowercase letters, numbers and hyphens only."}</p></div>
              <div className="space-y-1.5"><Label>{isAr ? "بريد الفوترة" : "Billing email"}</Label><Input type="email" value={form.billingEmail} onChange={(e) => setForm((current) => ({ ...current, billingEmail: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{isAr ? "الخطة" : "Plan"}</Label><Select value={form.planId || "none"} onValueChange={(value) => { const planId = value === "none" ? "" : value; setForm((current) => ({ ...current, planId })); setSelectedModules(initialModules(plans.find((plan) => plan.id === planId))); }}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الخطة" : "Choose a plan"} /></SelectTrigger><SelectContent><SelectItem value="none">{isAr ? "اختر الخطة" : "Choose a plan"}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select>{form.planId ? <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs"><span className="font-medium">{isAr ? "مميزات الخطة:" : "Plan features:"}</span> {Object.entries(plans.find((plan) => plan.id === form.planId)?.features ?? {}).filter(([, enabled]) => enabled).map(([key]) => ({ dashboard: isAr ? "لوحة التحكم" : "Dashboard", patients: isAr ? "المرضى" : "Patients", appointments: isAr ? "المواعيد" : "Appointments", invoices: isAr ? "الفوترة" : "Billing", reports: isAr ? "التقارير المتقدمة" : "Advanced reports", inventory: isAr ? "المخزون" : "Inventory", hr: isAr ? "الموارد البشرية" : "HR", marketing: isAr ? "التسويق" : "Marketing", whatsapp: isAr ? "واتساب وSMS" : "WhatsApp/SMS", api: "API", priority_support: isAr ? "دعم أولوية" : "Priority support" } as Record<string, string>)[key] ?? key).join(isAr ? "، " : ", ")}</div> : null}</div>
              <div className="space-y-1.5"><Label>{isAr ? "المدة بالأيام" : "Term length (days)"}</Label><Input type="number" min={1} max={3650} value={form.durationDays} onChange={(e) => setForm((current) => ({ ...current, durationDays: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{isAr ? "دورة الفوترة" : "Billing cycle"}</Label><Select value={form.billingCycle} onValueChange={(value) => setForm((current) => ({ ...current, billingCycle: value as ProvisionForm["billingCycle"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem><SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem></SelectContent></Select></div>
            </div>
          </section>
          <section className="space-y-3 border-t pt-4">
            <div className="font-semibold">{isAr ? "الفرع الأول" : "First branch"}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{isAr ? "اسم الفرع بالإنجليزية" : "Branch name (English)"}</Label><Input dir="ltr" value={form.branchNameEn} onChange={(e) => setForm((current) => ({ ...current, branchNameEn: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{isAr ? "اسم الفرع بالعربية" : "Branch name (Arabic)"}</Label><Input value={form.branchNameAr} onChange={(e) => setForm((current) => ({ ...current, branchNameAr: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{isAr ? "الهاتف" : "Phone"}</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{isAr ? "المدينة" : "City"}</Label><Input value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "العنوان" : "Address"}</Label><Input value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} /></div>
            </div>
          </section>
          <section className="space-y-3 border-t pt-4">
            <div><div className="font-semibold">{isAr ? "الوحدات المفعلة" : "Enabled modules"}</div><p className="text-xs text-muted-foreground">{isAr ? "لوحة التحكم والمرضى والمواعيد والملفات الطبية والفوترة والتواصل أساسية دائمًا. أما التقارير والمخزون والموارد البشرية والتسويق فتتبع الخطة." : "Dashboard, patients, appointments, medical records, billing and communication are always included. Reports, inventory, HR and marketing follow the selected plan."}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => <span key={module.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><Check className="size-3" />{isAr ? module.nameAr : module.nameEn}</span>)}</div></div>
            <div className="grid gap-4 sm:grid-cols-2">{groups.map((group) => <div key={group.key} className="space-y-2"><div className="text-sm font-medium text-muted-foreground">{group.title}</div>{CLINIC_MODULES.filter((module) => module.group === group.key && !module.alwaysOn).map((module) => { const enabled = selectedModules.has(module.key); const planAllowed = planAllowsModule(module.key, plans.find((plan) => plan.id === form.planId)?.features ?? {}); return <label key={module.key} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${planAllowed ? "cursor-pointer" : "cursor-not-allowed bg-muted/40 opacity-70"}`}><span><span className="block text-sm font-medium">{isAr ? module.nameAr : module.nameEn}</span><span className="block text-xs text-muted-foreground">{isAr ? module.descriptionAr : module.descriptionEn}</span>{!planAllowed ? <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">{isAr ? "غير متاحة في الخطة الحالية" : "Not included in selected plan"}</span> : null}</span><input type="checkbox" checked={enabled} disabled={!planAllowed} onChange={() => setSelectedModules((current) => { const next = new Set(current); if (next.has(module.key)) next.delete(module.key); else next.add(module.key); return next; })} className="size-4 accent-primary" /></label>; })}</div>)}</div>
          </section>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => closeProvisioning(false)} disabled={provisioning}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void submitProvisioning()} disabled={provisioning}>{provisioning ? <Loader2 className="me-2 size-4 animate-spin" /> : <Rocket className="me-2 size-4" />}{isAr ? "تأكيد وإنشاء Workspace" : "Confirm & create workspace"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!deleteRequest} onOpenChange={(open) => { if (!open && !deletingRequest) setDeleteRequest(null); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="size-5" />{isAr ? "حذف طلب الاشتراك" : "Delete subscription request"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm"><p>{isAr ? `سيتم حذف طلب ${deleteRequest?.clinic_name ?? ""} نهائيًا من قائمة الطلبات فقط.` : `This will permanently remove the request for ${deleteRequest?.clinic_name ?? ""} from the request list only.`}</p><p className="text-muted-foreground">{isAr ? "لا يمكن استخدام هذا الإجراء بعد إنشاء Workspace؛ عندها استخدم إغلاق السجل أو أرشف مساحة العمل." : "This action is unavailable after a Workspace is provisioned; close the record or archive the workspace instead."}</p></div>
        <DialogFooter><Button variant="outline" onClick={() => setDeleteRequest(null)} disabled={deletingRequest}>{isAr ? "إلغاء" : "Cancel"}</Button><Button variant="destructive" onClick={() => void deleteSelectedRequest()} disabled={deletingRequest}>{deletingRequest ? <Loader2 className="me-2 size-4 animate-spin" /> : <Trash2 className="me-2 size-4" />}{isAr ? "تأكيد الحذف" : "Confirm delete"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
