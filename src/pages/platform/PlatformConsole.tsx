import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, LoaderCircle, Plus, Search, Settings2, ShieldAlert } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { deskFailure } from "@/lib/deskFailure";
import { CLINIC_MODULES, DEFAULT_ENABLED_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { planAllowsModule } from "@/lib/subscriptionEntitlements";
import { clearPlatformWorkspaceBranch, setPlatformWorkspaceBranch } from "@/lib/platformWorkspace";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import { localizedTenantName } from "@/lib/tenantName";
import { cn } from "@/lib/utils";
import {
  SUBSCRIPTION_STATUSES,
  WORKSPACE_PAGE_SIZE,
  fetchWorkspaceBranches,
  fetchWorkspaceCounts,
  fetchWorkspaces,
  isMissingArchiveColumn,
  reviewWindowEnd,
  type DirectoryQuery,
  type Workspace,
  type WorkspaceBranch,
  type WorkspaceCounts,
  type WorkspaceStatusFilter,
  type WorkspaceView,
} from "@/lib/platformWorkspaces";
import {
  ActionButton,
  EmptyState,
  FieldLabel,
  Notice,
  Panel,
  PlatformDialog,
  PlatformInput,
  SelectField,
  SubjectLine,
} from "@/components/platform/PlatformSurface";
import { WorkspaceKpis } from "@/components/platform/WorkspaceKpis";
import { WorkspaceTabs } from "@/components/platform/WorkspaceTabs";
import { WorkspaceTable, type BranchTally, type WorkspaceActions } from "@/components/platform/WorkspaceTable";
import { ArchiveWorkspaceDialog } from "@/components/platform/ArchiveWorkspaceDialog";
import { RestoreWorkspaceDialog } from "@/components/platform/RestoreWorkspaceDialog";
import { PermanentDeleteDialog } from "@/components/platform/PermanentDeleteDialog";
import { platformDate, subscriptionLabel, usePlatformCopy } from "@/components/platform/platformCopy";
import OnboardingWizard from "@/pages/platform/OnboardingWizard";
import TenantDomains from "@/pages/platform/TenantDomains";
import TenantHealthDialog from "@/pages/platform/TenantHealthDialog";
import TenantBrandingDialog from "@/pages/platform/TenantBrandingDialog";
import PlanCatalogPanel from "@/pages/platform/PlanCatalogPanel";
import SubscriptionRequestsPanel from "@/pages/platform/SubscriptionRequestsPanel";
import { TablePager } from "@/components/TablePager";

type Plan = {
  id: string;
  name_ar: string;
  name_en: string;
  max_branches: number;
  max_staff: number;
  max_patients?: number;
  max_invoices_monthly?: number;
  price_monthly?: number;
  price_yearly?: number;
  features?: Record<string, boolean>;
};

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

const STATUS_FILTERS: WorkspaceStatusFilter[] = ["all", "active", "needs_review"];

const moduleRowClass = cn("flex items-start justify-between gap-z3 rounded-z2 border border-z-line-edge p-z3");
const moduleToggleClass = cn(
  "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-zquick ease-z-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-z-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-z-raised",
  "disabled:cursor-not-allowed disabled:opacity-60",
);
const moduleThumbClass = cn(
  "absolute top-1 size-4 rounded-full bg-z-raised shadow-z1 transition-transform duration-zquick ease-z-out",
);

export default function PlatformConsole() {
  const { tx, isAr, lang } = usePlatformCopy();
  const { user } = useAuth();
  const { authz, loading: authLoading } = useAuthorization("platform.console");
  const { setCurrentBranchId } = useBranch();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // The Archived tab is a place in the URL, not a hidden filter: a shared link opens the
  // same ledger, and Back returns to the live directory.
  const view: WorkspaceView = params.get("view") === "archived" ? "archived" : "live";
  const statusParam = params.get("status");
  const statusFilter: WorkspaceStatusFilter = STATUS_FILTERS.includes(statusParam as WorkspaceStatusFilter)
    ? (statusParam as WorkspaceStatusFilter)
    : "all";
  const planFilter = params.get("plan") ?? "all";

  const writeParams = (patch: { view?: WorkspaceView; status?: WorkspaceStatusFilter; plan?: string }) => {
    const next = new URLSearchParams(params);
    const merged = { view, status: statusFilter, plan: planFilter, ...patch };
    if (merged.view === "live") next.delete("view");
    else next.set("view", merged.view);
    if (merged.status === "all" || merged.view === "archived") next.delete("status");
    else next.set("status", merged.status);
    if (merged.plan === "all") next.delete("plan");
    else next.set("plan", merged.plan);
    setParams(next, { replace: true });
  };

  const [search, setSearch] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [page, setPage] = useState(0);
  const [archiveColumns, setArchiveColumns] = useState(true);
  const [rows, setRows] = useState<Workspace[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<WorkspaceCounts>({ live: 0, active: 0, needsReview: 0, archived: 0 });
  const [branches, setBranches] = useState<WorkspaceBranch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [moduleWorkspace, setModuleWorkspace] = useState<Workspace | null>(null);
  const [domainWorkspace, setDomainWorkspace] = useState<Workspace | null>(null);
  const [healthWorkspace, setHealthWorkspace] = useState<Workspace | null>(null);
  const [brandingWorkspace, setBrandingWorkspace] = useState<Workspace | null>(null);
  const [archiveWorkspace, setArchiveWorkspace] = useState<Workspace | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Workspace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const [subscriptionWorkspace, setSubscriptionWorkspace] = useState<Workspace | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({ planId: "", status: "active", billingCycle: "monthly", durationDays: "" });
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [subscriptionFailure, setSubscriptionFailure] = useState<{ title: string; description?: string } | null>(null);

  const [moduleValues, setModuleValues] = useState<Record<ClinicModuleKey, boolean>>(
    () => Object.fromEntries(DEFAULT_ENABLED_MODULES.map((key) => [key, true])) as Record<ClinicModuleKey, boolean>,
  );
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleReadFailed, setModuleReadFailed] = useState(false);
  const [moduleFailure, setModuleFailure] = useState<{ title: string; description?: string } | null>(null);

  const canView = authz.holdsAnyRole("system_owner");
  const busy = loading || authLoading;

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const reviewBefore = reviewWindowEnd();
    const query: DirectoryQuery = {
      view,
      status: statusFilter,
      search: serverSearch,
      planId: planFilter,
      page,
      archiveColumns,
      reviewBefore,
    };
    const [directory, planRes, branchRes, tally] = await Promise.all([
      fetchWorkspaces(query),
      supabase
        .from("subscription_plans")
        .select("id,name_ar,name_en,max_branches,max_staff,max_patients,max_invoices_monthly,price_monthly,price_yearly,features")
        .eq("is_active", true)
        .order("display_order"),
      fetchWorkspaceBranches(),
      fetchWorkspaceCounts(archiveColumns, reviewBefore),
    ]);

    // One automatic retry on the legacy spelling; after that the console says plainly that
    // restore and permanent delete are waiting on a migration instead of pretending.
    if (archiveColumns && (isMissingArchiveColumn(directory.error) || isMissingArchiveColumn(tally.error))) {
      setArchiveColumns(false);
      return;
    }

    setFailed(Boolean(directory.error) || Boolean(tally.error));
    setRows(directory.rows);
    setTotal(directory.total);
    setCounts(tally.counts);
    setPlans((planRes.data ?? []) as Plan[]);
    if (branchRes.error) {
      const fallback = await supabase.from("branches").select("id,name_en,name_ar,is_active").order("name_en");
      const legacyTenantId = directory.rows.length === 1 ? directory.rows[0].id : null;
      setBranches(((fallback.data ?? []) as WorkspaceBranch[]).map((branch) => ({ ...branch, tenant_id: legacyTenantId })));
    } else {
      setBranches(branchRes.branches);
    }
    setLoading(false);
  }, [archiveColumns, canView, page, planFilter, serverSearch, statusFilter, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => setServerSearch(sanitizeSearch(search)), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [view, statusFilter, planFilter, serverSearch]);

  useEffect(() => {
    // A platform owner enters a clinic workspace only through the explicit Open action.
    clearPlatformWorkspaceBranch();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const branchTally = useMemo(() => {
    const tally = new Map<string, BranchTally>();
    for (const branch of branches) {
      if (!branch.tenant_id) continue;
      const entry = tally.get(branch.tenant_id) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (branch.is_active) entry.active += 1;
      tally.set(branch.tenant_id, entry);
    }
    return tally;
  }, [branches]);

  const modulePlan = moduleWorkspace
    ? plans.find((plan) => plan.id === moduleWorkspace.plan_id) ?? moduleWorkspace.subscription_plans ?? null
    : null;
  const planFeatures = modulePlan?.features ?? {};

  const durationDays = Number.parseInt(subscriptionForm.durationDays, 10);
  const durationValid = Number.isInteger(durationDays) && durationDays >= 1 && durationDays <= 3650;
  const termEndsOn = durationValid ? platformDate(new Date(Date.now() + durationDays * 86_400_000).toISOString(), isAr) : "";
  const subscriptionReady = Boolean(subscriptionForm.planId) && durationValid && !subscriptionSaving;

  const openWorkspace = (workspace: Workspace) => {
    const branch = branches.find((item) => item.tenant_id === workspace.id && item.is_active);
    if (!branch) {
      toast({ title: tx("noActiveBranchTitle"), description: tx("noActiveBranchBody"), variant: "destructive" });
      return;
    }
    setCurrentBranchId(branch.id);
    setPlatformWorkspaceBranch(branch.id);
    navigate(`/workspace?branch=${encodeURIComponent(branch.id)}`);
  };

  const openModuleManager = async (workspace: Workspace) => {
    setModuleWorkspace(workspace);
    setModuleLoading(true);
    setModuleReadFailed(false);
    setModuleFailure(null);
    const { data, error } = await supabase
      .from("tenant_module_settings")
      .select("module_key,enabled")
      .eq("tenant_id", workspace.id);
    const next = Object.fromEntries(DEFAULT_ENABLED_MODULES.map((key) => [key, true])) as Record<ClinicModuleKey, boolean>;
    if (error) {
      setModuleReadFailed(true);
    } else {
      for (const row of data ?? []) {
        const key = String((row as { module_key: string }).module_key) as ClinicModuleKey;
        if (key in next) next[key] = Boolean((row as { enabled: boolean }).enabled);
      }
    }
    setModuleValues(next);
    setModuleLoading(false);
  };

  const saveModules = async () => {
    if (!moduleWorkspace) return;
    setModuleSaving(true);
    setModuleFailure(null);
    const payload = CLINIC_MODULES.map((module) => ({
      tenant_id: moduleWorkspace.id,
      module_key: module.key,
      enabled: module.alwaysOn ? true : moduleValues[module.key] ?? false,
      updated_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("tenant_module_settings").upsert(payload, { onConflict: "tenant_id,module_key" });
    if (error) {
      setModuleFailure(deskFailure(error, lang, tx("modulesSaveFailed")));
    } else {
      toast({ title: tx("modulesSaved") });
      void writePlatformChange({
        tenant_id: moduleWorkspace.id,
        category: "modules",
        action: "update",
        summary: tx("changeLogModules"),
        after_values: { enabled_modules: payload.filter((row) => row.enabled).map((row) => row.module_key) },
      });
      setModuleWorkspace(null);
    }
    setModuleSaving(false);
  };

  const openSubscriptionManager = (workspace: Workspace) => {
    const currentEnd = workspace.subscription_ends_at ?? workspace.trial_ends_at;
    const remaining = currentEnd ? Math.max(1, Math.ceil((new Date(currentEnd).getTime() - Date.now()) / 86_400_000)) : null;
    setSubscriptionWorkspace(workspace);
    setSubscriptionFailure(null);
    setSubscriptionForm({
      planId: workspace.plan_id ?? plans[0]?.id ?? "",
      status: workspace.subscription_status || "active",
      billingCycle: "monthly",
      durationDays: remaining === null ? "" : String(remaining),
    });
  };

  const saveSubscription = async () => {
    if (!subscriptionWorkspace || !subscriptionReady) return;
    setSubscriptionSaving(true);
    setSubscriptionFailure(null);
    const { error } = await supabase.rpc("platform_update_tenant_subscription" as never, {
      payload: {
        tenant_id: subscriptionWorkspace.id,
        plan_id: subscriptionForm.planId,
        status: subscriptionForm.status,
        billing_cycle: subscriptionForm.billingCycle,
        duration_days: durationDays,
        reason: "platform_console_update",
      },
    } as never);
    if (error) {
      setSubscriptionFailure(deskFailure(error, lang, tx("subscriptionSaveFailed")));
    } else {
      toast({ title: tx("subscriptionSaved") });
      void writePlatformChange({
        tenant_id: subscriptionWorkspace.id,
        category: "subscription",
        action: "update",
        summary: tx("changeLogSubscription"),
        before_values: { plan_id: subscriptionWorkspace.plan_id, status: subscriptionWorkspace.subscription_status },
        after_values: {
          plan_id: subscriptionForm.planId,
          status: subscriptionForm.status,
          billing_cycle: subscriptionForm.billingCycle,
          duration_days: durationDays,
        },
      });
      setSubscriptionWorkspace(null);
      await load();
    }
    setSubscriptionSaving(false);
  };

  const actions: WorkspaceActions = {
    open: openWorkspace,
    health: setHealthWorkspace,
    modules: (workspace) => void openModuleManager(workspace),
    planTerm: openSubscriptionManager,
    domains: setDomainWorkspace,
    branding: setBrandingWorkspace,
    archive: setArchiveWorkspace,
    restore: setRestoreTarget,
    remove: setDeleteTarget,
  };

  const filtered = serverSearch !== "" || statusFilter !== "all" || planFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setServerSearch("");
    writeParams({ status: "all", plan: "all" });
  };

  if (!authLoading && !canView) {
    return (
      <div className="z-platform flex min-h-[50vh] items-center justify-center p-z6" dir={isAr ? "rtl" : "ltr"}>
        <Panel className="mx-auto max-w-md">
          <EmptyState icon={<ShieldAlert />} title={tx("accessTitle")} body={tx("accessBody")} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="z-platform space-y-z6" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-end justify-between gap-z4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-z2 text-z-label rtl:text-z-label-ar font-medium text-z-ink-500 [&_svg]:size-3.5">
            <Building2 />
            {tx("eyebrow")}
          </div>
          <h1 className="mt-z1 text-z-title rtl:text-z-title-ar font-semibold text-z-ink-900">{tx("title")}</h1>
          <p className="mt-z2 max-w-[72ch] text-z-small rtl:text-z-small-ar text-z-ink-500">{tx("lead")}</p>
        </div>
        <ActionButton onClick={() => setOnboardingOpen(true)}>
          <Plus className="size-4" />
          {tx("addClinic")}
        </ActionButton>
      </div>

      <WorkspaceKpis
        counts={counts}
        view={view}
        status={statusFilter}
        loading={busy}
        onSelect={(nextView, nextStatus) => writeParams({ view: nextView, status: nextStatus })}
      />

      {archiveColumns ? null : (
        <Notice tone="caution" title={tx("schemaPendingTitle")}>{tx("schemaPendingBody")}</Notice>
      )}

      <Panel>
        <div className="border-b border-z-line-edge px-z4">
          <WorkspaceTabs view={view} counts={counts} panelId="workspace-directory" onChange={(next) => writeParams({ view: next })} />
        </div>
        <div id="workspace-directory" role="tabpanel" aria-labelledby={`workspace-tab-${view}`} tabIndex={-1}>
          <div className="flex flex-wrap items-center gap-z2 border-b border-z-line-hairline px-z4 py-z3">
            <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute start-z3 top-1/2 size-4 -translate-y-1/2 text-z-ink-400" />
              <PlatformInput
                type="search"
                className="ps-z9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tx("searchPlaceholder")}
                aria-label={tx("searchPlaceholder")}
              />
            </div>
            {view === "live" ? (
              <SelectField
                className="w-full sm:w-[11rem]"
                value={statusFilter}
                aria-label={tx("filterStatus")}
                onChange={(event) => writeParams({ status: event.target.value as WorkspaceStatusFilter })}
              >
                <option value="all">{tx("statusAll")}</option>
                <option value="active">{tx("statusActive")}</option>
                <option value="needs_review">{tx("statusReview")}</option>
              </SelectField>
            ) : null}
            <SelectField
              className="w-full sm:w-[12rem]"
              value={planFilter}
              aria-label={tx("filterPlan")}
              onChange={(event) => writeParams({ plan: event.target.value })}
            >
              <option value="all">{tx("planAll")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</option>
              ))}
            </SelectField>
          </div>

          <WorkspaceTable
            rows={rows}
            view={view}
            branches={branchTally}
            actions={actions}
            loading={busy}
            failed={failed}
            onRetry={() => void load()}
            filtered={filtered}
            onClearFilters={clearFilters}
            onAddClinic={() => setOnboardingOpen(true)}
            lifecycleReady={archiveColumns}
          />
          <TablePager page={page} pageSize={WORKSPACE_PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </Panel>

      <div className="border-t border-z-line-hairline pt-z4">
        <div className="text-z-label rtl:text-z-label-ar font-semibold text-z-ink-700">{tx("platformControlsTitle")}</div>
        <p className="mt-z1 max-w-[80ch] text-z-small rtl:text-z-small-ar text-z-ink-500">{tx("platformControlsBody")}</p>
      </div>

      <SubscriptionRequestsPanel onChanged={() => void load()} />
      <PlanCatalogPanel onSaved={() => void load()} />

      <PlatformDialog
        open={!!moduleWorkspace}
        onOpenChange={(next) => { if (!next) setModuleWorkspace(null); }}
        dir={isAr ? "rtl" : "ltr"}
        wide
        busy={moduleSaving}
        icon={<Settings2 />}
        title={tx("modulesTitle")}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setModuleWorkspace(null)} disabled={moduleSaving}>{tx("cancel")}</ActionButton>
            <ActionButton onClick={() => void saveModules()} disabled={moduleLoading || moduleSaving}>
              {moduleSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {moduleSaving ? tx("saving") : tx("modulesSave")}
            </ActionButton>
          </>
        }
      >
        {moduleWorkspace ? <SubjectLine name={localizedTenantName(moduleWorkspace, lang)} slug={moduleWorkspace.slug} /> : null}
        {moduleReadFailed ? (
          <Notice tone="caution" title={tx("modulesReadFailedTitle")}>{tx("modulesLoadFailed")}</Notice>
        ) : null}
        {moduleFailure ? <Notice tone="critical" title={moduleFailure.title}>{moduleFailure.description}</Notice> : null}
        {moduleLoading ? (
          <>
            <div className="grid gap-z3 sm:grid-cols-2" aria-hidden="true">
              {CLINIC_MODULES.slice(0, 4).map((module) => (
                <div key={module.key} className={cn(moduleRowClass, "animate-pulse")}>
                  <div className="min-w-0 flex-1 space-y-z2">
                    <div className="h-z3 w-2/3 rounded-z1 bg-z-sunk" />
                    <div className="h-z3 w-full rounded-z1 bg-z-sunk" />
                  </div>
                  <div className="h-6 w-11 rounded-full bg-z-sunk" />
                </div>
              ))}
            </div>
            <p role="status" className="sr-only">{tx("modulesLoading")}</p>
          </>
        ) : (
          <div className="grid gap-z3 sm:grid-cols-2">
            {CLINIC_MODULES.map((module) => {
              const locked = Boolean(module.alwaysOn);
              const planAllowed = planAllowsModule(module.key, planFeatures);
              const active = planAllowed && (locked || moduleValues[module.key]);
              const name = isAr ? module.nameAr : module.nameEn;
              return (
                <div key={module.key} className={moduleRowClass}>
                  <div className="min-w-0">
                    <div className="text-z-small rtl:text-z-small-ar font-medium text-z-ink-900">{name}</div>
                    <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-500">
                      {isAr ? module.descriptionAr : module.descriptionEn}
                    </div>
                    {!planAllowed ? (
                      <div className="mt-z1 text-z-micro rtl:text-z-micro-ar font-medium text-z-caution-ink">{tx("moduleNotInPlan")}</div>
                    ) : locked ? (
                      <div className="mt-z1 text-z-micro rtl:text-z-micro-ar text-z-ink-400">{tx("moduleAlwaysOn")}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label={name}
                    disabled={locked || !planAllowed}
                    onClick={() => setModuleValues((current) => ({ ...current, [module.key]: !current[module.key] }))}
                    className={cn(moduleToggleClass, active ? "bg-z-brand-700" : "bg-z-line-strong")}
                  >
                    <span className={cn(moduleThumbClass, active ? "start-6" : "start-1")} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PlatformDialog>

      <PlatformDialog
        open={!!subscriptionWorkspace}
        onOpenChange={(next) => { if (!next) setSubscriptionWorkspace(null); }}
        dir={isAr ? "rtl" : "ltr"}
        busy={subscriptionSaving}
        icon={<CalendarClock />}
        title={tx("subscriptionTitle")}
        footer={
          <>
            <ActionButton tone="quiet" onClick={() => setSubscriptionWorkspace(null)} disabled={subscriptionSaving}>{tx("cancel")}</ActionButton>
            <ActionButton onClick={() => void saveSubscription()} disabled={!subscriptionReady}>
              {subscriptionSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {subscriptionSaving ? tx("saving") : tx("subscriptionSave")}
            </ActionButton>
          </>
        }
      >
        {subscriptionWorkspace ? (
          <SubjectLine name={localizedTenantName(subscriptionWorkspace, lang)} slug={subscriptionWorkspace.slug} />
        ) : null}
        {subscriptionFailure ? (
          <Notice tone="critical" title={subscriptionFailure.title}>{subscriptionFailure.description}</Notice>
        ) : null}
        <div className="grid gap-z4 sm:grid-cols-2">
          <div className="space-y-z2">
            <FieldLabel htmlFor="subscription-plan">{tx("filterPlan")}</FieldLabel>
            <SelectField
              id="subscription-plan"
              value={subscriptionForm.planId}
              onChange={(event) => setSubscriptionForm((current) => ({ ...current, planId: event.target.value }))}
            >
              <option value="" disabled>{tx("subscriptionChoosePlan")}</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</option>
              ))}
            </SelectField>
          </div>
          <div className="space-y-z2">
            <FieldLabel htmlFor="subscription-status">{tx("colStatus")}</FieldLabel>
            <SelectField
              id="subscription-status"
              value={subscriptionForm.status}
              onChange={(event) => setSubscriptionForm((current) => ({ ...current, status: event.target.value }))}
            >
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>{subscriptionLabel(status, isAr)}</option>
              ))}
            </SelectField>
          </div>
          <div className="space-y-z2">
            <FieldLabel htmlFor="subscription-duration">{tx("subscriptionDuration")}</FieldLabel>
            <PlatformInput
              id="subscription-duration"
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              dir="ltr"
              className="z-num"
              value={subscriptionForm.durationDays}
              onChange={(event) => setSubscriptionForm((current) => ({ ...current, durationDays: event.target.value }))}
            />
            <p className={cn("text-z-micro rtl:text-z-micro-ar", durationValid ? "text-z-ink-500" : "text-z-caution-ink")}>
              {durationValid ? `${tx("until")} ${termEndsOn}` : tx("subscriptionDurationInvalid")}
            </p>
          </div>
          <div className="space-y-z2">
            <FieldLabel htmlFor="subscription-billing">{tx("subscriptionBilling")}</FieldLabel>
            <SelectField
              id="subscription-billing"
              value={subscriptionForm.billingCycle}
              onChange={(event) => setSubscriptionForm((current) => ({ ...current, billingCycle: event.target.value }))}
            >
              <option value="monthly">{tx("billingMonthly")}</option>
              <option value="yearly">{tx("billingYearly")}</option>
            </SelectField>
          </div>
        </div>
        <p className="text-z-micro rtl:text-z-micro-ar text-z-ink-500">
          {subscriptionWorkspace && !subscriptionWorkspace.subscription_ends_at && !subscriptionWorkspace.trial_ends_at
            ? tx("subscriptionNoTerm")
            : tx("subscriptionTermNote")}
        </p>
      </PlatformDialog>

      <ArchiveWorkspaceDialog
        workspace={archiveWorkspace}
        open={!!archiveWorkspace}
        onOpenChange={(next) => { if (!next) setArchiveWorkspace(null); }}
        onArchived={load}
      />
      <RestoreWorkspaceDialog
        workspace={restoreTarget}
        branches={branches}
        open={!!restoreTarget}
        onOpenChange={(next) => { if (!next) setRestoreTarget(null); }}
        onRestored={load}
      />
      <PermanentDeleteDialog
        workspace={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        onDeleted={load}
        onArchive={(workspace) => { setDeleteTarget(null); setArchiveWorkspace(workspace); }}
        onOpenDomains={(workspace) => { setDeleteTarget(null); setDomainWorkspace(workspace); }}
      />
      <OnboardingWizard open={onboardingOpen} onOpenChange={setOnboardingOpen} plans={plans} onCreated={load} />
      <TenantDomains
        tenant={domainWorkspace}
        branches={branches}
        open={!!domainWorkspace}
        onOpenChange={(next) => { if (!next) setDomainWorkspace(null); }}
      />
      <TenantBrandingDialog
        tenant={brandingWorkspace}
        open={!!brandingWorkspace}
        onOpenChange={(next) => { if (!next) setBrandingWorkspace(null); }}
      />
      <TenantHealthDialog
        tenant={healthWorkspace}
        branches={branches}
        plans={plans}
        open={!!healthWorkspace}
        onOpenChange={(next) => { if (!next) setHealthWorkspace(null); }}
      />
    </div>
  );
}
