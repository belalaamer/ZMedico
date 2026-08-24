import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Clock3, Globe2, History, Loader2, Puzzle, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { CLINIC_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { planAllowsModule } from "@/lib/subscriptionEntitlements";

type Tenant = {
  id: string;
  name: string;
  subscription_status: string;
  is_active: boolean;
  plan_id: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_plans?: { id: string; name_ar: string; name_en: string; features?: Record<string, boolean> } | null;
};

type Branch = { id: string; tenant_id?: string | null; is_active: boolean };
type Plan = { id: string; name_ar: string; name_en: string; features?: Record<string, boolean> };
type Domain = { id: string; hostname: string; status: string; ssl_status: string | null; hostname_status: string | null; is_enabled: boolean };
type ModuleSetting = { module_key: string; enabled: boolean };
type Change = { id: string; category: string; action: string; summary: string; created_at: string };

type Props = { tenant: Tenant | null; branches: Branch[]; plans: Plan[]; open: boolean; onOpenChange: (open: boolean) => void };

function formatDate(value: string | null, lang: string) {
  if (!value) return lang === "ar" ? "غير محدد" : "Not set";
  return new Date(value).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-EG", { year: "numeric", month: "short", day: "2-digit" });
}

function statusLabel(status: string, isAr: boolean) {
  const labels: Record<string, [string, string]> = {
    active: ["نشط", "Active"],
    trial: ["تجريبي", "Trial"],
    past_due: ["متأخر السداد", "Past due"],
    expired: ["منتهٍ", "Expired"],
    cancelled: ["ملغى", "Cancelled"],
    disabled: ["معطل", "Disabled"],
  };
  return labels[status]?.[isAr ? 0 : 1] ?? status;
}

export default function TenantHealthDialog({ tenant, branches, plans, open, onOpenChange }: Props) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [loading, setLoading] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [modules, setModules] = useState<ModuleSetting[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tenantBranches = useMemo(() => branches.filter((branch) => branch.tenant_id === tenant?.id), [branches, tenant?.id]);
  const plan = tenant ? plans.find((item) => item.id === tenant.plan_id) ?? tenant.subscription_plans ?? null : null;
  const planFeatures = plan?.features ?? {};
  const enabledModules = modules.filter((item) => item.enabled).map((item) => item.module_key);
  const unsupportedEnabled = enabledModules.filter((key) => !planAllowsModule(key as ClinicModuleKey, planFeatures));
  const activeBranches = tenantBranches.filter((branch) => branch.is_active).length;

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    const [domainResult, moduleResult, changeResult] = await Promise.all([
      supabase.functions.invoke("manage-custom-domain", { body: { action: "list", tenant_id: tenant.id } }),
      supabase.from("tenant_module_settings").select("module_key,enabled").eq("tenant_id", tenant.id),
      supabase.from("platform_change_log").select("id,category,action,summary,created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(8),
    ]);
    const problems: string[] = [];
    if (domainResult.error) problems.push(domainResult.error.message);
    else setDomains(((domainResult.data as { domains?: Domain[] } | null)?.domains ?? []));
    if (moduleResult.error) problems.push(moduleResult.error.message);
    else setModules((moduleResult.data ?? []) as ModuleSetting[]);
    if (changeResult.error) problems.push(changeResult.error.message);
    else setChanges((changeResult.data ?? []) as Change[]);
    if (problems.length) setError(isAr ? "تعذر تحميل بعض مؤشرات الصحة؛ راجع التفاصيل المتاحة أدناه." : "Some health indicators could not be loaded; available details are shown below.");
    setLoading(false);
  }, [isAr, tenant]);

  useEffect(() => {
    if (open && tenant) void load();
  }, [load, open, tenant]);

  const alerts = useMemo(() => {
    if (!tenant) return [] as string[];
    const result: string[] = [];
    if (!tenant.is_active || ["expired", "cancelled"].includes(tenant.subscription_status)) result.push(isAr ? "العميل متوقف أو اشتراكه غير نشط." : "Tenant is inactive or its subscription is not active.");
    if (!plan) result.push(isAr ? "لا توجد خطة مرتبطة بهذا العميل." : "No subscription plan is attached to this tenant.");
    if (activeBranches === 0) result.push(isAr ? "لا يوجد فرع نشط لفتح مساحة التشغيل." : "There is no active branch available for workspace access.");
    const end = tenant.subscription_ends_at ?? tenant.trial_ends_at;
    if (end) {
      const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
      if (days >= 0 && days <= 7) result.push(isAr ? `ينتهي الاشتراك خلال ${days} يومًا.` : `Subscription ends in ${days} day(s).`);
    }
    if (unsupportedEnabled.length) result.push(isAr ? "توجد وحدات مفعلة في الإعدادات لكنها غير موجودة في الخطة." : "Some tenant-enabled modules are not included in the plan.");
    return result;
  }, [activeBranches, isAr, plan, tenant, unsupportedEnabled.length]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-primary" />{isAr ? "صحة العميل" : "Tenant health"} · {tenant?.name}</DialogTitle></DialogHeader>
      {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{isAr ? "جارٍ تحميل المؤشرات…" : "Loading health indicators…"}</div> : <div className="space-y-4">
        {error ? <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthMetric icon={<CheckCircle2 className="size-4" />} label={isAr ? "الاشتراك" : "Subscription"} value={tenant ? statusLabel(tenant.subscription_status, isAr) : "—"} tone={tenant?.is_active && !["expired", "cancelled"].includes(tenant.subscription_status) ? "good" : "warn"} />
          <HealthMetric icon={<Clock3 className="size-4" />} label={isAr ? "ينتهي في" : "Ends"} value={formatDate(tenant?.subscription_ends_at ?? tenant?.trial_ends_at ?? null, lang)} />
          <HealthMetric icon={<Building2 className="size-4" />} label={isAr ? "الفروع النشطة" : "Active branches"} value={`${activeBranches}/${tenantBranches.length}`} tone={activeBranches ? "good" : "warn"} />
          <HealthMetric icon={<Puzzle className="size-4" />} label={isAr ? "الوحدات" : "Modules"} value={`${enabledModules.length}/${CLINIC_MODULES.length}`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardContent className="space-y-3 p-4"><SectionTitle icon={<AlertTriangle className="size-4" />} title={isAr ? "التنبيهات" : "Alerts"} />{alerts.length ? <div className="space-y-2">{alerts.map((item) => <div key={item} className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{item}</div>)}</div> : <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />{isAr ? "لا توجد تنبيهات حرجة." : "No critical alerts."}</div>}</CardContent></Card>
          <Card><CardContent className="space-y-3 p-4"><SectionTitle icon={<Globe2 className="size-4" />} title={isAr ? "الدومينات" : "Domains"} /><div className="space-y-2">{domains.length ? domains.map((domain) => <div key={domain.id} className="flex items-center justify-between gap-3 text-sm"><span dir="ltr" className="min-w-0 truncate font-medium">{domain.hostname}</span><Badge variant={domain.status === "active" ? "default" : "outline"}>{statusLabel(domain.status, isAr)}</Badge></div>) : <p className="text-sm text-muted-foreground">{isAr ? "لا توجد دومينات مسجلة." : "No domains registered."}</p>}</div></CardContent></Card>
        </div>
        <Card><CardContent className="space-y-3 p-4"><SectionTitle icon={<History className="size-4" />} title={isAr ? "آخر تغييرات الإدارة" : "Recent administration changes"} />{changes.length ? <div className="divide-y">{changes.map((change) => <div key={change.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div><span className="font-medium">{change.summary}</span><span className="ms-2 text-xs text-muted-foreground">{change.category} · {change.action}</span></div><time className="text-xs text-muted-foreground" dateTime={change.created_at}>{formatDate(change.created_at, lang)}</time></div>)}</div> : <p className="text-sm text-muted-foreground">{isAr ? "لا توجد تغييرات مسجلة بعد." : "No administration changes recorded yet."}</p>}</CardContent></Card>
        <div className="flex justify-end"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="me-2 size-4" />{isAr ? "تحديث المؤشرات" : "Refresh health"}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>;
}

function HealthMetric({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  return <Card><CardContent className="space-y-1 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className={`text-lg font-semibold ${tone === "good" ? "text-emerald-700 dark:text-emerald-300" : tone === "warn" ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div></CardContent></Card>;
}
