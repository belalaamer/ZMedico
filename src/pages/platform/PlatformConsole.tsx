import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Building2, CalendarClock, CheckCircle2, Globe2, Loader2, Palette, Plus, RotateCcw, Search, Settings2, ShieldAlert, Trash2, Users, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CLINIC_MODULES, DEFAULT_ENABLED_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { planAllowsModule } from "@/lib/subscriptionEntitlements";
import { clearPlatformWorkspaceBranch, setPlatformWorkspaceBranch } from "@/lib/platformWorkspace";
import {
  assessWorkspaceDelete,
  permanentlyDeleteWorkspace,
  recordedActiveBranchIds,
  recordedSubscriptionStatus,
  RESTORE_STATUSES,
  restoreWorkspace,
  slugConfirmed,
  type DeleteAssessment,
  type SubscriptionStatus,
  type Workspace,
  type WorkspaceBranch,
} from "@/lib/platformWorkspaces";
import OnboardingWizard from "@/pages/platform/OnboardingWizard";
import TenantDomains from "@/pages/platform/TenantDomains";
import TenantHealthDialog from "@/pages/platform/TenantHealthDialog";
import TenantBrandingDialog from "@/pages/platform/TenantBrandingDialog";
import PlanCatalogPanel from "@/pages/platform/PlanCatalogPanel";
import SubscriptionRequestsPanel from "@/pages/platform/SubscriptionRequestsPanel";
import { TablePager } from "@/components/TablePager";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import { localizedTenantName } from "@/lib/tenantName";

type Plan = { id: string; name_ar: string; name_en: string; max_branches: number; max_staff: number; max_patients?: number; max_invoices_monthly?: number; price_monthly?: number; price_yearly?: number; features?: Record<string, boolean> };
type Tenant = {
  id: string;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  slug: string;
  subscription_status: string;
  is_active: boolean;
  is_archived?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: unknown;
  plan_id: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  subscription_plans?: Plan | null;
};
type Branch = { id: string; name_en: string; name_ar: string; is_active: boolean; tenant_id?: string | null };

const TENANT_PAGE_SIZE = 20;
type DirectoryView = "live" | "archived";

type PlatformChangePayload = {
  tenant_id: string;
  category: "subscription" | "modules" | "domains" | "tenant";
  action: string;
  summary: string;
  before_values?: Record<string, unknown>;
  after_values?: Record<string, unknown>;
};

async function writePlatformChange(payload: PlatformChangePayload) {
  const { error } = await supabase.rpc("platform_log_change" as never, { payload } as never);
  if (error && import.meta.env.DEV) console.warn("[Platform] change log unavailable", error.message);
}

function statusTone(status: string, active: boolean) {
  if (!active || ["cancelled", "expired"].includes(status)) return "secondary" as const;
  if (status === "past_due") return "destructive" as const;
  return "default" as const;
}

function deleteFailureCopy(message: string, isAr: boolean) {
  if (message.includes("PERMANENT_DELETE_SLUG_MISMATCH")) return isAr ? "اكتب الـ slug الحقيقي للتأكيد." : "Type the live slug exactly to confirm.";
  if (message.includes("PERMANENT_DELETE_ARCHIVE_FIRST")) return isAr ? "أرشف مساحة التشغيل أولًا قبل الحذف النهائي." : "Archive the workspace before deleting it permanently.";
  if (message.includes("PERMANENT_DELETE_BLOCKED")) return message;
  if (message.includes("PERMANENT_DELETE_DRIFT")) return isAr ? "تغيّرت البيانات أثناء الحذف؛ أعد المحاولة من البداية." : "The workspace changed during deletion; start again.";
  return message;
}

function restoreFailureCopy(message: string, isAr: boolean) {
  if (message.includes("RESTORE_BRANCH_SELECTION_REQUIRED")) return isAr ? "اختر فرعًا واحدًا على الأقل لاستعادته." : "Select at least one branch to restore.";
  if (message.includes("RESTORE_SUBSCRIPTION_STATUS_REQUIRED")) return isAr ? "اختر حالة الاشتراك التي تعود إليها المساحة." : "Choose the subscription status the workspace returns to.";
  return message;
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
  const [serverSearch, setServerSearch] = useState("");
  const [view, setView] = useState<DirectoryView>("live");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "needs_review">("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [tenantPage, setTenantPage] = useState(0);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [tenantCounts, setTenantCounts] = useState({ total: 0, active: 0, needsReview: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [moduleTenant, setModuleTenant] = useState<Tenant | null>(null);
  const [domainTenant, setDomainTenant] = useState<Tenant | null>(null);
  const [healthTenant, setHealthTenant] = useState<Tenant | null>(null);
  const [brandingTenant, setBrandingTenant] = useState<Tenant | null>(null);
  const [subscriptionTenant, setSubscriptionTenant] = useState<Tenant | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({ planId: "", status: "active", billingCycle: "monthly", durationDays: "30" });
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [archiveTenant, setArchiveTenant] = useState<Tenant | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [moduleValues, setModuleValues] = useState<Record<ClinicModuleKey, boolean>>(() => Object.fromEntries(DEFAULT_ENABLED_MODULES.map((key) => [key, true])) as Record<ClinicModuleKey, boolean>);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);

  // Restore (the inverse of archive) — replays the snapshot the archive recorded.
  const [restoreTenant, setRestoreTenant] = useState<Tenant | null>(null);
  const [restoreBranchIds, setRestoreBranchIds] = useState<string[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<SubscriptionStatus>("active");
  const [restoreReason, setRestoreReason] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreFailure, setRestoreFailure] = useState<string | null>(null);

  // Permanent delete — only what the assessment proves safe.
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [assessment, setAssessment] = useState<DeleteAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);

  const canView = authz.holdsAnyRole("system_owner");

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    let tenantQuery = supabase
      .from("tenants")
      .select("id,name,name_en,name_ar,slug,subscription_status,is_active,is_archived,archived_at,archive_reason,plan_id,trial_ends_at,subscription_ends_at,archive_snapshot,subscription_plans(id,name_ar,name_en,max_branches,max_staff,features)", { count: "exact" })
      .eq("is_archived", view === "archived")
      .order("created_at", { ascending: false })
      .range(tenantPage * TENANT_PAGE_SIZE, (tenantPage + 1) * TENANT_PAGE_SIZE - 1);
    if (serverSearch) tenantQuery = tenantQuery.or(`name.ilike.%${serverSearch}%,name_en.ilike.%${serverSearch}%,name_ar.ilike.%${serverSearch}%,slug.ilike.%${serverSearch}%,subscription_status.ilike.%${serverSearch}%`);
    if (view === "live" && statusFilter === "active") tenantQuery = tenantQuery.eq("is_active", true).not("subscription_status", "in", "(cancelled,expired)");
    if (view === "live" && statusFilter === "needs_review") tenantQuery = tenantQuery.or("is_active.eq.false,subscription_status.eq.cancelled,subscription_status.eq.expired");
    if (planFilter !== "all") tenantQuery = tenantQuery.eq("plan_id", planFilter);

    // The KPIs count the live directory only: an archived workspace is not active work,
    // and the archived total is reported separately on its own tab.
    const [tenantRes, planRes, branchWithTenantRes, liveCountRes, activeCountRes, reviewCountRes, archivedCountRes] = await Promise.all([
      tenantQuery,
      supabase.from("subscription_plans").select("id,name_ar,name_en,max_branches,max_staff,max_patients,max_invoices_monthly,price_monthly,price_yearly,features").eq("is_active", true).order("display_order"),
      supabase.from("branches").select("id,name_en,name_ar,is_active,tenant_id").order("name_en"),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_archived", false),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_archived", false).eq("is_active", true).not("subscription_status", "in", "(cancelled,expired)"),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_archived", false).eq("is_active", false).not("subscription_status", "in", "(cancelled,expired)"),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_archived", true),
    ]);
    if (tenantRes.error) toast({ title: tenantRes.error.message, variant: "destructive" });
    setTenantTotal(tenantRes.count ?? 0);
    setTenantCounts({ total: liveCountRes.count ?? 0, active: activeCountRes.count ?? 0, needsReview: reviewCountRes.count ?? 0, archived: archivedCountRes.count ?? 0 });
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
  }, [canView, planFilter, serverSearch, statusFilter, tenantPage, toast, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setServerSearch(sanitizeSearch(search));
      setTenantPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setTenantPage(0);
  }, [planFilter, statusFilter, view]);

  useEffect(() => {
    // A platform owner must enter a clinic workspace only through the explicit
    // Open Workspace action. Clear stale handoffs whenever the console mounts.
    clearPlatformWorkspaceBranch();
  }, []);

  useEffect(() => { void load(); }, [load]);

  const branchCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const branch of branches) if (branch.tenant_id) counts.set(branch.tenant_id, (counts.get(branch.tenant_id) ?? 0) + 1);
    return counts;
  }, [branches]);

  const filtered = tenants;
  const tenantDisplayName = (tenant: Tenant) => localizedTenantName(tenant, isAr ? "ar" : "en");

  const planForModuleTenant = moduleTenant
    ? plans.find((plan) => plan.id === moduleTenant.plan_id) ?? moduleTenant.subscription_plans ?? null
    : null;
  const planFeatures = planForModuleTenant?.features ?? {};

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
    const remainingDays = currentEnd ? Math.max(1, Math.ceil((new Date(currentEnd).getTime() - Date.now()) / 86_400_000)) : null;
    setSubscriptionTenant(tenant);
    setSubscriptionForm({ planId: tenant.plan_id ?? plans[0]?.id ?? "", status: tenant.subscription_status || "active", billingCycle: "monthly", durationDays: remainingDays === null ? "" : String(remainingDays) });
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
      void writePlatformChange({ tenant_id: subscriptionTenant.id, category: "subscription", action: "update", summary: isAr ? "تم تحديث خطة ومدة الاشتراك" : "Subscription plan and term updated", before_values: { plan_id: subscriptionTenant.plan_id, status: subscriptionTenant.subscription_status }, after_values: { plan_id: subscriptionForm.planId, status: subscriptionForm.status, billing_cycle: subscriptionForm.billingCycle, duration_days: durationDays } });
      setSubscriptionTenant(null);
      await load();
    }
    setSubscriptionSaving(false);
  };

  const archiveSelectedTenant = async () => {
    if (!archiveTenant || !slugConfirmed(archiveConfirmation, archiveTenant.slug)) return;
    setArchiving(true);
    const { error } = await supabase.rpc("platform_archive_tenant" as never, { p_tenant_id: archiveTenant.id, p_reason: "platform_console_archive" } as never);
    setArchiving(false);
    if (error) {
      toast({ title: isAr ? "تعذر أرشفة Workspace" : "Unable to archive workspace", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم إيقاف Workspace وأرشفته" : "Workspace archived and deactivated" });
    setArchiveTenant(null);
    setArchiveConfirmation("");
    await load();
  };

  const openRestore = (tenant: Tenant) => {
    const owned = branches.filter((branch) => branch.tenant_id === tenant.id);
    const workspace = tenant as unknown as Workspace;
    const recorded = recordedActiveBranchIds(workspace, owned as unknown as WorkspaceBranch[]);
    setRestoreTenant(tenant);
    setRestoreBranchIds(recorded.length ? recorded : owned.length === 1 ? [owned[0].id] : []);
    setRestoreStatus(recordedSubscriptionStatus(workspace) ?? "active");
    setRestoreReason("");
    setRestoreFailure(null);
  };

  const restoreSelectedTenant = async () => {
    if (!restoreTenant) return;
    const owned = branches.filter((branch) => branch.tenant_id === restoreTenant.id);
    if (restoreBranchIds.length === 0 && owned.length !== 1) {
      setRestoreFailure(isAr ? "اختر فرعًا واحدًا على الأقل لاستعادته." : "Select at least one branch to restore.");
      return;
    }
    setRestoring(true);
    setRestoreFailure(null);
    const { result, error } = await restoreWorkspace({
      tenantId: restoreTenant.id,
      reason: restoreReason.trim(),
      branchIds: restoreBranchIds,
      subscriptionStatus: restoreStatus,
    });
    setRestoring(false);
    if (error || !result) {
      setRestoreFailure(restoreFailureCopy(error?.message ?? "", isAr) || (isAr ? "تعذر استعادة Workspace." : "The workspace could not be restored."));
      return;
    }
    toast({ title: isAr ? "تم استعادة Workspace" : "Workspace restored" });
    setRestoreTenant(null);
    await load();
  };

  const openPermanentDelete = async (tenant: Tenant) => {
    setDeleteTenant(tenant);
    setAssessment(null);
    setDeleteSlug("");
    setDeleteReason("");
    setDeleteFailure(null);
    setAssessing(true);
    const { assessment: next, error } = await assessWorkspaceDelete(tenant.id);
    setAssessing(false);
    if (error || !next) {
      setDeleteFailure(error?.message ?? (isAr ? "تعذر تقييم مساحة التشغيل." : "The workspace could not be assessed."));
      return;
    }
    setAssessment(next);
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTenant || !assessment || assessment.verdict !== "DELETABLE") return;
    if (!slugConfirmed(deleteSlug, deleteTenant.slug)) {
      setDeleteFailure(isAr ? "اكتب الـ slug الحقيقي للتأكيد." : "Type the live slug exactly to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteFailure(null);
    const { receipt, error } = await permanentlyDeleteWorkspace({ tenantId: deleteTenant.id, confirmSlug: deleteSlug, reason: deleteReason.trim() });
    setDeleting(false);
    if (error || !receipt?.deleted) {
      setDeleteFailure(deleteFailureCopy(error?.message ?? "", isAr) || (isAr ? "تعذر الحذف النهائي." : "The workspace could not be deleted."));
      return;
    }
    toast({ title: isAr ? "تم حذف Workspace نهائيًا" : "Workspace permanently deleted", description: receipt.receipt_id ? `#${receipt.receipt_id.slice(0, 8)}` : undefined });
    setDeleteTenant(null);
    await load();
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
      void writePlatformChange({ tenant_id: moduleTenant.id, category: "modules", action: "update", summary: isAr ? "تم تحديث وحدات العميل" : "Tenant modules updated", after_values: { enabled_modules: Object.entries(moduleValues).filter(([, enabled]) => enabled).map(([key]) => key) } });
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
    setPlatformWorkspaceBranch(branch.id);
    navigate(`/workspace?branch=${encodeURIComponent(branch.id)}`);
  };

  if (authLoading || loading) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{isAr ? "جارٍ تحميل منصة الإدارة…" : "Loading platform console…"}</div>;
  if (!canView) return <div className="flex min-h-[50vh] items-center justify-center p-6"><Card className="max-w-md"><CardContent className="space-y-3 p-6 text-center"><ShieldAlert className="mx-auto size-10 text-destructive" /><h2 className="text-xl font-bold">{isAr ? "هذه الشاشة لمالك النظام فقط" : "System Owner access required"}</h2><p className="text-sm text-muted-foreground">{isAr ? "يتم منع الوصول حتى لو تم تغيير الرابط يدويًا." : "Access is denied even if the URL is entered manually."}</p></CardContent></Card></div>;

  const restoreOwnedBranches = restoreTenant ? branches.filter((branch) => branch.tenant_id === restoreTenant.id) : [];
  const restoreRecordedStatus = restoreTenant ? recordedSubscriptionStatus(restoreTenant as unknown as Workspace) : null;
  const deleteReady = Boolean(deleteTenant) && assessment?.verdict === "DELETABLE" && slugConfirmed(deleteSlug, deleteTenant?.slug ?? "");

  return <div className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Building2 className="size-4" />{isAr ? "إدارة المنصة" : "Platform administration"}</div><h1 className="text-2xl font-bold">{isAr ? "العيادات والعملاء" : "Clinics & tenants"}</h1><p className="mt-1 text-sm text-muted-foreground">{isAr ? "اختر العميل أولًا، ثم ادخل إلى مساحة تشغيله صراحةً." : "Choose a tenant first, then explicitly enter its operational workspace."}</p></div>
      <Button onClick={() => setOnboardingOpen(true)}><Plus className="me-2 size-4" />{isAr ? "إضافة عيادة" : "Add clinic"}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-4">
      <Stat icon={<Building2 className="size-4" />} label={isAr ? "مساحات قائمة" : "Live workspaces"} value={tenantCounts.total} />
      <Stat icon={<CheckCircle2 className="size-4 text-emerald-600" />} label={isAr ? "نشط" : "Active"} value={tenantCounts.active} />
      <Stat icon={<XCircle className="size-4 text-muted-foreground" />} label={isAr ? "يحتاج مراجعة" : "Needs review"} value={tenantCounts.needsReview} />
      <Stat icon={<Archive className="size-4 text-muted-foreground" />} label={isAr ? "مؤرشفة" : "Archived"} value={tenantCounts.archived} />
    </div>

    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">{isAr ? "دليل العملاء" : "Tenant directory"}<span className="ms-2 text-xs font-normal text-muted-foreground">{tenantTotal}/{isAr ? (view === "archived" ? tenantCounts.archived : tenantCounts.total) : (view === "archived" ? tenantCounts.archived : tenantCounts.total)}</span></CardTitle>
            <Tabs value={view} onValueChange={(value) => setView(value as DirectoryView)}>
              <TabsList>
                <TabsTrigger value="live">{isAr ? "القائمة" : "Live"}<Badge variant="secondary" className="ms-2">{tenantCounts.total}</Badge></TabsTrigger>
                <TabsTrigger value="archived">{isAr ? "المؤرشفة" : "Archived"}<Badge variant="secondary" className="ms-2">{tenantCounts.archived}</Badge></TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isAr ? "ابحث بالاسم أو المعرف" : "Search by name or slug"} /></div>
            {view === "live" ? <>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder={isAr ? "الحالة" : "Status"} /></SelectTrigger><SelectContent><SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem><SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem><SelectItem value="needs_review">{isAr ? "يحتاج مراجعة" : "Needs review"}</SelectItem></SelectContent></Select>
            </> : null}
            <Select value={planFilter} onValueChange={setPlanFilter}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder={isAr ? "الخطة" : "Plan"} /></SelectTrigger><SelectContent><SelectItem value="all">{isAr ? "كل الخطط" : "All plans"}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{view === "archived" ? (isAr ? "لا توجد مساحات مؤرشفة." : "No archived workspaces.") : (isAr ? "لا يوجد عملاء بعد." : "No tenants yet.")}</div> : filtered.map((tenant) => {
          const plan = tenant.subscription_plans;
          const count = branchCount.get(tenant.id) ?? 0;
          return <div key={tenant.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{tenantDisplayName(tenant)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="min-w-0 max-w-full truncate font-mono">{tenant.slug}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex shrink-0 items-center gap-1"><Users className="size-3" />{count} {isAr ? "فرع" : "branch(es)"}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{tenant.subscription_ends_at || tenant.trial_ends_at ? `${isAr ? "حتى" : "until"} ${new Date(tenant.subscription_ends_at ?? tenant.trial_ends_at!).toLocaleDateString(isAr ? "ar-EG" : "en-EG")}` : (isAr ? "بدون مدة محددة" : "No term set")}</span>
                  {view === "archived" && tenant.archived_at ? <><span aria-hidden="true">·</span><span>{isAr ? "أُرشفت" : "archived"} {new Date(tenant.archived_at).toLocaleDateString(isAr ? "ar-EG" : "en-EG")}</span></> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={statusTone(tenant.subscription_status, tenant.is_active)}>{tenant.is_active ? tenant.subscription_status : (isAr ? "متوقف" : "Inactive")}</Badge>
                  <Badge variant="outline">{plan ? (isAr ? plan.name_ar : plan.name_en) : (isAr ? "بدون خطة" : "No plan")}</Badge>
                </div>
                {view === "archived" && tenant.archive_reason ? <div className="mt-1 truncate text-xs text-muted-foreground">{isAr ? "السبب: " : "Reason: "}{tenant.archive_reason}</div> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {view === "archived" ? <>
                <Button size="sm" onClick={() => openRestore(tenant)}><RotateCcw className="me-1 size-3.5" />{isAr ? "استعادة" : "Restore"}</Button>
                <Button size="sm" variant="outline" onClick={() => setDomainTenant(tenant)}><Globe2 className="me-1 size-3.5" />{isAr ? "الدومينات" : "Domains"}</Button>
                <Button size="sm" variant="destructive" onClick={() => void openPermanentDelete(tenant)}><Trash2 className="me-1 size-3.5" />{isAr ? "حذف نهائي" : "Delete permanently"}</Button>
              </> : <>
                <Button size="sm" onClick={() => openTenant(tenant)} disabled={!count}>{isAr ? "فتح مساحة التشغيل" : "Open workspace"}</Button>
                <Button size="sm" variant="outline" onClick={() => setHealthTenant(tenant)}><ShieldAlert className="me-1 size-3.5" />{isAr ? "الصحة" : "Health"}</Button>
                <Button size="sm" variant="outline" onClick={() => void openModuleManager(tenant)}><Settings2 className="me-1 size-3.5" />{isAr ? "الوحدات" : "Modules"}</Button>
                <Button size="sm" variant="outline" onClick={() => openSubscriptionManager(tenant)}><CalendarClock className="me-1 size-3.5" />{isAr ? "الخطة والمدة" : "Plan & term"}</Button>
                <Button size="sm" variant="outline" onClick={() => setDomainTenant(tenant)}><Globe2 className="me-1 size-3.5" />{isAr ? "الدومينات" : "Domains"}</Button>
                <Button size="sm" variant="outline" onClick={() => setBrandingTenant(tenant)}><Palette className="me-1 size-3.5" />{isAr ? "الهوية" : "Branding"}</Button>
                {tenant.is_active ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setArchiveTenant(tenant); setArchiveConfirmation(""); }}><Archive className="me-1 size-3.5" />{isAr ? "أرشفة" : "Archive"}</Button> : null}
              </>}
            </div>
          </div>;
        })}
      </CardContent>
      <TablePager page={tenantPage} pageSize={TENANT_PAGE_SIZE} total={tenantTotal} onPageChange={setTenantPage} />
    </Card>

    <Card className="border-primary/20 bg-primary/5"><CardContent className="p-4 text-sm"><div className="font-semibold">{isAr ? "إدارة المنصة" : "Platform controls"}</div><p className="mt-1 text-muted-foreground">{isAr ? "أنشئ العميل كاملًا من المعالج الذري، ثم أدر الوحدات والدومينات والأسعار من هنا. إعدادات التشغيل اليومية تبقى داخل مساحة العيادة." : "Create tenants atomically, then manage modules, domains, and public pricing here. Daily operational settings remain inside the clinic workspace."}</p></CardContent></Card>
    <SubscriptionRequestsPanel onChanged={() => void load()} />
    <PlanCatalogPanel onSaved={() => void load()} />

    <Dialog open={!!moduleTenant} onOpenChange={(value) => !value && setModuleTenant(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="size-5 text-primary" />{isAr ? "وحدات العميل" : "Tenant modules"} · {moduleTenant?.name}</DialogTitle></DialogHeader>{moduleLoading ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الإعدادات…" : "Loading settings…"}</div> : <div className="grid gap-3 sm:grid-cols-2">{CLINIC_MODULES.map((module) => { const locked = Boolean(module.alwaysOn); const planAllowed = planAllowsModule(module.key, planFeatures); const active = planAllowed && (locked || moduleValues[module.key]); return <div key={module.key} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="font-medium">{isAr ? module.nameAr : module.nameEn}</div><div className="mt-1 text-xs text-muted-foreground">{isAr ? module.descriptionAr : module.descriptionEn}</div>{!planAllowed ? <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{isAr ? "غير متاحة في الخطة الحالية" : "Not included in this plan"}</div> : null}</div><button type="button" aria-pressed={active} disabled={locked || !planAllowed} onClick={() => setModuleValues((current) => ({ ...current, [module.key]: !current[module.key] }))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${active ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform ${active ? "start-6" : "start-1"}`} /></button></div>; })}</div>}<DialogFooter><Button variant="outline" onClick={() => setModuleTenant(null)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void saveModules()} disabled={moduleLoading || moduleSaving}>{moduleSaving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ الوحدات" : "Save modules"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!subscriptionTenant} onOpenChange={(value) => !value && setSubscriptionTenant(null)}><DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}><DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" />{isAr ? "إدارة الخطة والاشتراك" : "Plan & subscription management"} · {subscriptionTenant?.name}</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>{isAr ? "الخطة" : "Plan"}</Label><Select value={subscriptionForm.planId} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, planId: value }))}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الخطة" : "Choose plan"} /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>{isAr ? "الحالة" : "Status"}</Label><Select value={subscriptionForm.status} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">{isAr ? "تجربة" : "Trial"}</SelectItem><SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem><SelectItem value="past_due">{isAr ? "متأخر السداد" : "Past due"}</SelectItem><SelectItem value="cancelled">{isAr ? "ملغى" : "Cancelled"}</SelectItem><SelectItem value="expired">{isAr ? "منتهٍ" : "Expired"}</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>{isAr ? "المدة بالأيام" : "Term length (days)"}</Label><Input type="number" min={1} max={3650} value={subscriptionForm.durationDays} onChange={(event) => setSubscriptionForm((current) => ({ ...current, durationDays: event.target.value }))} /></div><div className="space-y-1.5"><Label>{isAr ? "دورة الفوترة" : "Billing cycle"}</Label><Select value={subscriptionForm.billingCycle} onValueChange={(value) => setSubscriptionForm((current) => ({ ...current, billingCycle: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem><SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem></SelectContent></Select></div></div><p className="text-xs text-muted-foreground">{subscriptionTenant && !subscriptionTenant.subscription_ends_at && !subscriptionTenant.trial_ends_at ? (isAr ? "لا توجد مدة محفوظة لهذا العميل. أدخل عدد الأيام صراحةً قبل الحفظ؛ لن نفترض 30 يومًا تلقائيًا." : "No saved term exists for this tenant. Enter the number of days explicitly; we will not assume 30 days automatically.") : (isAr ? "عند انتهاء المدة أو إيقاف العميل، تُغلق مساحة التشغيل ولا تُحذف البيانات." : "When the term ends or the tenant is paused, the workspace closes without deleting data.")}</p></div><DialogFooter><Button variant="outline" onClick={() => setSubscriptionTenant(null)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void saveSubscription()} disabled={subscriptionSaving || !subscriptionForm.planId}>{subscriptionSaving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ التغيير" : "Save change"}</Button></DialogFooter></DialogContent></Dialog>
    <OnboardingWizard open={onboardingOpen} onOpenChange={setOnboardingOpen} plans={plans} onCreated={load} />
    <TenantDomains tenant={domainTenant} branches={branches} open={!!domainTenant} onOpenChange={(value) => { if (!value) setDomainTenant(null); }} />
    <TenantBrandingDialog tenant={brandingTenant} open={!!brandingTenant} onOpenChange={(value) => { if (!value) setBrandingTenant(null); }} />

    <Dialog open={!!archiveTenant} onOpenChange={(value) => { if (!value && !archiving) { setArchiveTenant(null); setArchiveConfirmation(""); } }}><DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Archive className="size-5" />{isAr ? "أرشفة Workspace" : "Archive workspace"}</DialogTitle></DialogHeader><div className="space-y-4 text-sm"><p>{isAr ? `سيتم إيقاف ${archiveTenant?.name ?? ""} ومنع الدخول إليه وتعطيل فروعه ودوميناته.` : `This will deactivate ${archiveTenant?.name ?? ""}, block access, and disable its branches and domains.`}</p><p className="font-medium text-amber-700 dark:text-amber-300">{isAr ? "لن يتم حذف المرضى أو المواعيد أو الفواتير أو المدفوعات. ستظل البيانات محفوظة ويمكن استعادة Workspace لاحقًا عبر إجراء إداري منفصل." : "Patients, appointments, invoices and payments will not be deleted. Data is retained and can be restored later through a separate administrative action."}</p><div className="space-y-1.5"><Label>{isAr ? `اكتب Slug للتأكيد: ${archiveTenant?.slug ?? ""}` : `Type the slug to confirm: ${archiveTenant?.slug ?? ""}`}</Label><Input dir="ltr" value={archiveConfirmation} onChange={(event) => setArchiveConfirmation(event.target.value)} placeholder={archiveTenant?.slug ?? "tenant-slug"} /></div></div><DialogFooter><Button variant="outline" onClick={() => setArchiveTenant(null)} disabled={archiving}>{isAr ? "إلغاء" : "Cancel"}</Button><Button variant="destructive" onClick={() => void archiveSelectedTenant()} disabled={archiving || !slugConfirmed(archiveConfirmation, archiveTenant?.slug ?? "")}>{archiving ? <Loader2 className="me-2 size-4 animate-spin" /> : <Archive className="me-2 size-4" />}{isAr ? "تأكيد الأرشفة" : "Confirm archive"}</Button></DialogFooter></DialogContent></Dialog>
    <TenantHealthDialog tenant={healthTenant} branches={branches} plans={plans} open={!!healthTenant} onOpenChange={(value) => { if (!value) setHealthTenant(null); }} />

    {/* Restore: replays the snapshot the archive recorded, so the workspace comes back
        exactly as it was left rather than as a blank shell. */}
    <Dialog open={!!restoreTenant} onOpenChange={(value) => { if (!value && !restoring) { setRestoreTenant(null); setRestoreFailure(null); } }}>
      <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="size-5 text-primary" />{isAr ? "استعادة Workspace" : "Restore workspace"} · {restoreTenant?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{isAr ? "ستُعاد المساحة إلى الحالة المحفوظة قبل الأرشفة: الفروع النشطة، وحالة الاشتراك، ونهايات الفترات المدفوعة." : "The workspace returns to the state recorded before archiving: the active branches, the subscription status, and the paid period ends."}</p>
          <div className="space-y-2">
            <Label>{isAr ? "الفروع التي تعود" : "Branches to reactivate"}</Label>
            {restoreOwnedBranches.length === 0 ? <p className="text-xs text-muted-foreground">{isAr ? "لا توجد فروع لهذه المساحة." : "This workspace has no branches."}</p> : (
              <div className="space-y-1.5">
                {restoreOwnedBranches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={restoreBranchIds.includes(branch.id)}
                      onChange={(event) => setRestoreBranchIds((current) => event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id))}
                    />
                    <span>{isAr ? branch.name_ar : branch.name_en}</span>
                    {branch.is_active ? <Badge variant="secondary" className="ms-auto">{isAr ? "نشط" : "active"}</Badge> : null}
                  </label>
                ))}
              </div>
            )}
          </div>
          {restoreRecordedStatus === null ? (
            <div className="space-y-1.5">
              <Label>{isAr ? "حالة الاشتراك عند الاستعادة" : "Subscription status on restore"}</Label>
              <Select value={restoreStatus} onValueChange={(value) => setRestoreStatus(value as SubscriptionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RESTORE_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{isAr ? "هذا أرشيف قديم لا يحمل سجلًا لما قبل الأرشفة، فاختر الحالة صراحةً." : "This archive predates the ledger, so the prior status is not recorded. Choose it explicitly."}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">{isAr ? `الحالة المحفوظة: ${restoreRecordedStatus}` : `Recorded status: ${restoreRecordedStatus}`}</p>}
          <div className="space-y-1.5">
            <Label>{isAr ? "سبب الاستعادة (اختياري)" : "Reason (optional)"}</Label>
            <Input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} maxLength={500} />
          </div>
          {restoreFailure ? <p className="text-sm text-destructive">{restoreFailure}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRestoreTenant(null)} disabled={restoring}>{isAr ? "إلغاء" : "Cancel"}</Button>
          <Button onClick={() => void restoreSelectedTenant()} disabled={restoring || restoreOwnedBranches.length === 0}>{restoring ? <Loader2 className="me-2 size-4 animate-spin" /> : <RotateCcw className="me-2 size-4" />}{isAr ? "تأكيد الاستعادة" : "Confirm restore"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Permanent delete: the assessment proves what is safe to erase, and the delete
        executes only that plan. A blocked workspace is named table by table. */}
    <Dialog open={!!deleteTenant} onOpenChange={(value) => { if (!value && !deleting) { setDeleteTenant(null); setDeleteFailure(null); } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="size-5" />{isAr ? "حذف Workspace نهائيًا" : "Delete workspace permanently"} · {deleteTenant?.name}</DialogTitle></DialogHeader>
        {assessing ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تقييم ما يمكن حذفه…" : "Assessing what can be deleted…"}</div> : assessment ? (
          <div className="space-y-4 text-sm">
            {assessment.verdict === "DELETABLE" ? (
              <>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="size-4" />{isAr ? "هذا الحذف لا يمكن التراجع عنه" : "This deletion cannot be undone"}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{isAr ? `قيّمنا ${assessment.tables_measured} جدولًا. ستُحذف ${assessment.erased.length} مجموعة إعدادات فارغة، ويبقى ${assessment.survivors.length} سجل تدقيق لا يمكن حذفه.` : `${assessment.tables_measured} tables assessed. ${assessment.erased.length} empty configuration tables will be erased; ${assessment.survivors.length} audit trail(s) are kept and disclosed.`}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? `اكتب Slug للتأكيد: ${deleteTenant?.slug ?? ""}` : `Type the slug to confirm: ${deleteTenant?.slug ?? ""}`}</Label>
                  <Input dir="ltr" value={deleteSlug} onChange={(event) => setDeleteSlug(event.target.value)} placeholder={deleteTenant?.slug ?? "tenant-slug"} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? "سبب الحذف (اختياري)" : "Reason (optional)"}</Label>
                  <Input value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} maxLength={500} />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="size-4" />{assessment.verdict === "NEEDS_ARCHIVE" ? (isAr ? "أرشف Workspace أولًا" : "Archive the workspace first") : (isAr ? "الحذف محجوب" : "Deletion is blocked")}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{isAr ? "هذه المساحة تحتوي على بيانات لا يجوز محوها مع Workspace. أرشفها بدلًا من حذفها، أو عالج الجداول المذكورة أدناه أولًا." : "This workspace holds data that must not be erased with a workspace. Archive it instead, or clear the tables named below first."}</p>
                </div>
                {assessment.blockers.length ? (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {assessment.blockers.map((blocker) => (
                      <div key={`${blocker.table}-${blocker.code}`} className="rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{blocker.table}</span><Badge variant="outline">{blocker.rows ?? "?"}</Badge></div>
                        <div className="mt-1 text-xs text-muted-foreground">{blocker.reason}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {deleteFailure ? <p className="text-sm text-destructive">{deleteFailure}</p> : null}
          </div>
        ) : deleteFailure ? <p className="text-sm text-destructive">{deleteFailure}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTenant(null)} disabled={deleting}>{isAr ? "إلغاء" : "Cancel"}</Button>
          <Button variant="destructive" onClick={() => void confirmPermanentDelete()} disabled={!deleteReady || deleting}>{deleting ? <Loader2 className="me-2 size-4 animate-spin" /> : <Trash2 className="me-2 size-4" />}{isAr ? "حذف نهائي" : "Delete permanently"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></CardContent></Card>;
}
