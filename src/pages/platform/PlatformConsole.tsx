import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, CheckCircle2, Globe2, Loader2, Plus, Search, Settings2, ShieldAlert, Users, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CLINIC_MODULES, DEFAULT_ENABLED_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import OnboardingWizard from "@/pages/platform/OnboardingWizard";
import TenantDomains from "@/pages/platform/TenantDomains";

type Plan = { id: string; name_ar: string; name_en: string; max_branches: number; max_staff: number; max_patients?: number; max_invoices_monthly?: number; price_monthly?: number; price_yearly?: number; features?: Record<string, boolean> };
type Tenant = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  is_active: boolean;
  plan_id: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_plans?: Plan | null;
};
type Branch = { id: string; name_en: string; name_ar: string; is_active: boolean; tenant_id?: string | null };

function statusTone(status: string, active: boolean) {
  if (!active || ["cancelled", "expired"].includes(status)) return "secondary" as const;
  if (status === "past_due") return "destructive" as const;
  return "default" as const;
}

export default function PlatformConsole() {
  const { lang } = useI18n();
  const { user } = useAuth();
  const { authz, loading: authLoading } = useAuthorization("platform.console");
  const { setCurrentBranchId } = useBranch();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [moduleTenant, setModuleTenant] = useState<Tenant | null>(null);
  const [domainTenant, setDomainTenant] = useState<Tenant | null>(null);
  const [subscriptionTenant, setSubscriptionTenant] = useState<Tenant | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({ planId: "", status: "active", billingCycle: "monthly", durationDays: "30" });
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [moduleValues, setModuleValues] = useState<Record<ClinicModuleKey, boolean>>(() => Object.fromEntries(DEFAULT_ENABLED_MODULES.map((key) => [key, true])) as Record<ClinicModuleKey, boolean>);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);

  const canView = authz.holdsAnyRole("system_owner");

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    const [tenantRes, planRes, branchWithTenantRes] = await Promise.all([
      supabase.from("tenants").select("id,name,slug,subscription_status,is_active,plan_id,trial_ends_at,subscription_ends_at,subscription_plans(id,name_ar,name_en,max_branches,max_staff)").order("created_at"),
      supabase.from("subscription_plans").select("id,name_ar,name_en,max_branches,max_staff,max_patients,max_invoices_monthly,price_monthly,price_yearly,features").eq("is_active", true).order("display_order"),
      supabase.from("branches").select("id,name_en,name_ar,is_active,tenant_id").order("name_en"),
    ]);
    if (tenantRes.error) toast({ title: tenantRes.error.message, variant: "destructive" });
    setTenants((tenantRes.data ?? []) as unknown as Tenant[]);
    setPlans((planRes.data ?? []) as Plan[]);
    if (branchWithTenantRes.error) {
      // This fallback keeps the console readable while an older database is
      // being migrated; the tenant_id column is required for full mapping.
      const fallback = await supabase.from("branches").select("id,name_en,name_ar,is_active").order("name_en");
      const legacyTenantId = tenantRes.data?.length === 1 ? (tenantRes.data[0] as { id: string }).id : null;
      setBranches(((fallback.data ?? []) as Branch[]).map((branch) => ({ ...branch, tenant_id: legacyTenantId })));
    } else {
      setBranches((branchWithTenantRes.data ?? []) as Branch[]);
    }
    setLoading(false);
  }, [canView, toast]);

  useEffect(() => { void load(); }, [load]);

  const branchCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const branch of branches) if (branch.tenant_id) counts.set(branch.tenant_id, (counts.get(branch.tenant_id) ?? 0) + 1);
    return counts;
  }, [branches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant) => `${tenant.name} ${tenant.slug} ${tenant.subscription_status}`.toLowerCase().includes(q));
  }, [search, tenants]);

  const openModuleManager = async (tenant: Tenant) => {
    setModuleTenant(tenant);
    setModuleLoading(true);
    const { data, error } = await supabase.from("tenant_module_settings").select("module_key,enabled").eq("tenant_id", tenant.id);
    const next = Object.fromEntries(DEFAULT_ENABLED_MODULES.map((key) => [key, true])) as Record<ClinicModuleKey, boolean>;
    if (!error) {
      for (const row of data ?? []) {
        const key = String((row as { module_key: string }).module_key) as ClinicModuleKey;
        if (key in next) next[key] = Boolean((row as { enabled: boolean }).enabled);
      }
    }
    setModuleValues(next);
    setModuleLoading(false);
    if (error) toast({ title: isAr ? "إعدادات الوحدات ستتوفر بعد تطبيق migration" : "Module settings will be available after the migration is applied", variant: "destructive" });
  };

  const openSubscriptionManager = (tenant: Tenant) => {
    const currentEnd = tenant.subscription_ends_at ?? tenant.trial_ends_at;
    const remainingDays = currentEnd ? Math.max(1, Math.ceil((new Date(currentEnd).getTime() - Date.now()) / 86_400_000)) : 30;
    setSubscriptionTenant(tenant);
    setSubscriptionForm({ planId: tenant.plan_id ?? plans[0]?.id ?? "", status: tenant.subscription_status || "active", billingCycle: "monthly", durationDays: String(remainingDays) });
  };

  const saveSubscription = async () => {
    if (!subscriptionTenant || !subscriptionForm.planId) return;
    setSubscriptionSaving(true);
    const durationDays = Number.parseInt(subscriptionForm.durationDays, 10);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      toast({ title: isAr ? "المدة يجب أن تكون بين يوم و3650 يومًا" : "Term must be between 1 and 3650 days", variant: "destructive" });
      setSubscriptionSaving(false);
      return;
    }
    const { error } = await supabase.rpc("platform_update_tenant_subscription" as never, { payload: {
      tenant_id: subscriptionTenant.id,
      plan_id: subscriptionForm.planId,
      status: subscriptionForm.status,
      billing_cycle: subscriptionForm.billingCycle,
      duration_days: durationDays,
      reason: "platform_console_update",
    }} as never);
    if (error) toast({ title: error.message, variant: "destructive" });
    else {
      toast({ title: isAr ? "تم تحديث خطة العميل" : "Tenant subscription updated" });
      setSubscriptionTenant(null);
      await load();
    }
    setSubscriptionSaving(false);
  };

  const saveModules = async () => {
    if (!moduleTenant) return;
    setModuleSaving(true);
    const rows = CLINIC_MODULES.map((module) => ({ tenant_id: moduleTenant.id, module_key: module.key, enabled: module.alwaysOn ? true : moduleValues[module.key] ?? false, updated_by: user?.id ?? null }));
    const { error } = await supabase.from("tenant_module_settings").upsert(rows, { onConflict: "tenant_id,module_key" });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: isAr ? "تم حفظ وحدات العميل" : "Tenant modules saved" });
      setModuleTenant(null);
    }
    setModuleSaving(false);
  };

  const openTenant = (tenant: Tenant) => {
    const branch = branches.find((item) => item.tenant_id === tenant.id && item.is_active);
    if (!branch) {
      toast({ title: isAr ? "لا يوجد فرع نشط لهذا العميل بعد" : "This clinic has no active branch yet", description: isAr ? "أنشئ الفرع الأول ثم افتح مساحة التشغيل." : "Create its first branch, then open the workspace.", variant: "destructive" });
      return;
    }
    setCurrentBranchId(branch.id);
    navigate("/workspace");
  };

  if (authLoading || loading) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{isAr ? "جارٍ تحميل منصة الإدارة…" : "Loading platform console…"}</div>;
  if (!canView) return <div className="flex min-h-[50vh] items-center justify-center p-6"><Card className="max-w-md"><CardContent className="space-y-3 p-6 text-center"><ShieldAlert className="mx-auto size-10 text-destructive" /><h2 className="text-xl font-bold">{isAr ? "هذه الشاشة لمالك النظام فقط" : "System Owner access required"}</h2><p className="text-sm text-muted-foreground">{isAr ? "يتم منع الوصول حتى لو تم تغيير الرابط يدويًا." : "Access is denied even if the URL is entered manually."}</p></CardContent></Card></div>;

  const activeCount = tenants.filter((tenant) => tenant.is_active && !["cancelled", "expired"].includes(tenant.subscription_status)).length;
  const inactiveCount = tenants.length - activeCount;

  return <div className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Building2 className="size-4" />{isAr ? "إدارة المنصة" : "Platform administration"}</div><h1 className="text-2xl font-bold">{isAr ? "العيادات والعملاء" : "Clinics & tenants"}</h1><p className="mt-1 text-sm text-muted-foreground">{isAr ? "اختر العميل أولًا، ثم ادخل إلى مساحة تشغيله صراحةً." : "Choose a tenant first, then explicitly enter its operational workspace."}</p></div>
      <Button onClick={() => setOnboardingOpen(true)}><Plus className="me-2 size-4" />{isAr ? "إضافة عيادة" : "Add clinic"}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3"><Stat icon={<Building2 className="size-4" />} label={isAr ? "كل العملاء" : "All tenants"} value={tenants.length} /><Stat icon={<CheckCircle2 className="size-4 text-emerald-600" />} label={isAr ? "نشط" : "Active"} value={activeCount} /><Stat icon={<XCircle className="size-4 text-muted-foreground" />} label={isAr ? "يحتاج مراجعة" : "Needs review"} value={inactiveCount} /></div>

    <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{isAr ? "دليل العملاء" : "Tenant directory"}</CardTitle><div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? "ابحث بالاسم أو المعرف" : "Search by name or slug"} /></div></div></CardHeader><CardContent className="space-y-3">{filtered.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{isAr ? "لا يوجد عملاء بعد." : "No tenants yet."}</div> : filtered.map((tenant) => { const plan = tenant.subscription_plans; const count = branchCount.get(tenant.id) ?? 0; return <div key={tenant.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div><div className="min-w-0"><div className="truncate font-semibold">{tenant.name}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-mono">{tenant.slug}</span><span>·</span><span className="inline-flex items-center gap-1"><Users className="size-3" />{count} {isAr ? "فرع" : "branch(es)"}</span></div></div></div><Badge variant={statusTone(tenant.subscription_status, tenant.is_active)}>{tenant.is_active ? tenant.subscription_status : (isAr ? "متوقف" : "Inactive")}</Badge><Badge variant="outline">{plan ? (isAr ? plan.name_ar : plan.name_en) : (isAr ? "بدون خطة" : "No plan")}</Badge><span className="text-xs text-muted-foreground">{tenant.subscription_ends_at || tenant.trial_ends_at ? `${isAr ? "حتى" : "until"} ${new Date(tenant.subscription_ends_at ?? tenant.trial_ends_at!).toLocaleDateString(isAr ? "ar-EG" : "en-EG")}` : (isAr ? "بدون مدة محددة" : "No term set")}</span><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => openTenant(tenant)} disabled={!count}>{isAr ? "فتح مساحة التشغيل" : "Open workspace"}</Button><Button size="sm" variant="outline" onClick={() => void openModuleManager(tenant)}><Settings2 className="me-1 size-3.5" />{isAr ? "الوحدات" : "Modules"}</Button><Button size="sm" variant="outline" onClick={() => openSubscriptionManager(tenant)}><CalendarClock className="me-1 size-3.5" />{isAr ? "الخطة والمدة" : "Plan & term"}</Button><Button size="sm" variant="outline" onClick={() => setDomainTenant(tenant)}><Globe2 className="me-1 size-3.5" />{isAr ? "الدومينات" : "Domains"}</Button></div></div>; })}</CardContent></Card>

    <Card className="border-primary/20 bg-primary/5"><CardContent className="p-4 text-sm"><div className="font-semibold">{isAr ? "إدارة المنصة" : "Platform controls"}</div><p className="mt-1 text-muted-foreground">{isAr ? "أنشئ العميل كاملًا من المعالج الذري، ثم أدر الوحدات والدومينات من هنا. إعدادات التشغيل اليومية تبقى داخل مساحة العيادة." : "Create the tenant atomically, then manage modules and domains here. Daily operational settings remain inside the clinic workspace."}</p></CardContent></Card>

    <Dialog open={!!moduleTenant} onOpenChange={(value) => !value && setModuleTenant(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="size-5 text-primary" />{isAr ? "وحدات العميل" : "Tenant modules"} · {moduleTenant?.name}</DialogTitle></DialogHeader>{moduleLoading ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الإعدادات…" : "Loading settings…"}</div> : <div className="grid gap-3 sm:grid-cols-2">{CLINIC_MODULES.map((module) => { const locked = Boolean(module.alwaysOn); return <div key={module.key} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="font-medium">{isAr ? module.nameAr : module.nameEn}</div><div className="mt-1 text-xs text-muted-foreground">{isAr ? module.descriptionAr : module.descriptionEn}</div></div><button type="button" aria-pressed={locked || moduleValues[module.key]} disabled={locked} onClick={() => setModuleValues((current) => ({ ...current, [module.key]: !current[module.key] }))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${locked || moduleValues[module.key] ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform ${locked || moduleValues[module.key] ? "start-6" : "start-1"}`} /></button></div>; })}</div>}<DialogFooter><Button variant="outline" onClick={() => setModuleTenant(null)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void saveModules()} disabled={moduleLoading || moduleSaving}>{moduleSaving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ الوحدات" : "Save modules"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!subscriptionTenant} onOpenChange={(value) => !value && setSubscriptionTenant(null)}><DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}><DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" />{isAr ? "إدارة الخطة والاشتراك" : "Plan & subscription management"} · {subscriptionTenant?.name}</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>{isAr ? "الخطة" : "Plan"}</Label><Select value={subscriptionForm.planId} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, planId: value }))}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الخطة" : "Choose plan"} /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>{isAr ? "الحالة" : "Status"}</Label><Select value={subscriptionForm.status} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">{isAr ? "تجربة" : "Trial"}</SelectItem><SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem><SelectItem value="past_due">{isAr ? "متأخر السداد" : "Past due"}</SelectItem><SelectItem value="cancelled">{isAr ? "ملغى" : "Cancelled"}</SelectItem><SelectItem value="expired">{isAr ? "منتهٍ" : "Expired"}</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>{isAr ? "المدة بالأيام" : "Term length (days)"}</Label><Input type="number" min={1} max={3650} value={subscriptionForm.durationDays} onChange={(event) => setSubscriptionForm((current) => ({ ...current, durationDays: event.target.value }))} /></div><div className="space-y-1.5"><Label>{isAr ? "دورة الفوترة" : "Billing cycle"}</Label><Select value={subscriptionForm.billingCycle} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, billingCycle: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem><SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem></SelectContent></Select></div></div><p className="text-xs text-muted-foreground">{isAr ? "عند انتهاء المدة أو إيقاف العميل، تُغلق مساحة التشغيل ولا تُحذف البيانات." : "When the term ends or the tenant is paused, the workspace closes without deleting data."}</p></div><DialogFooter><Button variant="outline" onClick={() => setSubscriptionTenant(null)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void saveSubscription()} disabled={subscriptionSaving || !subscriptionForm.planId}>{subscriptionSaving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ التغيير" : "Save change"}</Button></DialogFooter></DialogContent></Dialog>
    <OnboardingWizard open={onboardingOpen} onOpenChange={setOnboardingOpen} plans={plans} onCreated={load} />
    <TenantDomains tenant={domainTenant} branches={branches} open={!!domainTenant} onOpenChange={(value) => { if (!value) setDomainTenant(null); }} />
  </div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></CardContent></Card>;
}
