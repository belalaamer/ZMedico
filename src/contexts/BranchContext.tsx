import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { withTimeout } from "@/lib/withTimeout";
import { subscribeDataSync } from "@/lib/dataSync";
import { DEFAULT_ENABLED_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { getPlatformWorkspaceBranch, setPlatformWorkspaceBranch } from "@/lib/platformWorkspace";
import { filterModulesByPlan, isModuleEnabledForEntitlement, planAllowsModule } from "@/lib/subscriptionEntitlements";

export type Branch = { id: string; name_en: string; name_ar: string };

export type TenantSubscriptionSnapshot = {
  tenant_id: string;
  tenant_name: string;
  tenant_name_en: string | null;
  tenant_name_ar: string | null;
  tenant_slug: string;
  plan_id: string | null;
  plan_name_ar: string | null;
  plan_name_en: string | null;
  plan_features: Record<string, boolean>;
  max_branches: number | null;
  max_staff: number | null;
  max_patients: number | null;
  max_invoices_monthly: number | null;
  subscription_status: string;
  billing_cycle: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  is_active: boolean;
  access_allowed: boolean;
  access_reason: string;
};

type Ctx = {
  branches: Branch[];
  currentBranchId: string | null;
  branchSelectionReady: boolean;
  setCurrentBranchId: (id: string) => void;
  enabledModules: ClinicModuleKey[];
  modulesLoading: boolean;
  isModuleEnabled: (key: ClinicModuleKey) => boolean;
  subscription: TenantSubscriptionSnapshot | null;
  subscriptionLoading: boolean;
};

const BranchContext = createContext<Ctx | null>(null);

// Snapshots are re-fetched on focus; identical content must not produce a new
// object, because downstream effects (modules) key on the snapshot identity.
function sameSubscriptionSnapshot(a: TenantSubscriptionSnapshot | null, b: TenantSubscriptionSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.tenant_id === b.tenant_id &&
    a.plan_id === b.plan_id &&
    a.subscription_status === b.subscription_status &&
    a.billing_cycle === b.billing_cycle &&
    a.trial_ends_at === b.trial_ends_at &&
    a.subscription_ends_at === b.subscription_ends_at &&
    a.current_period_end === b.current_period_end &&
    a.is_active === b.is_active &&
    a.access_allowed === b.access_allowed &&
    a.access_reason === b.access_reason &&
    JSON.stringify(a.plan_features ?? {}) === JSON.stringify(b.plan_features ?? {})
  );
}

function sameModuleList(a: ClinicModuleKey[], b: ClinicModuleKey[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { isSystemOwner, loading: roleLoading } = useUserRole();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchSelectionReady, setBranchSelectionReady] = useState(false);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(
    () => localStorage.getItem("zmedico.branch")
  );
  const [enabledModules, setEnabledModules] = useState<ClinicModuleKey[]>(DEFAULT_ENABLED_MODULES);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [subscription, setSubscription] = useState<TenantSubscriptionSnapshot | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(() => Boolean(currentBranchId));
  const [domainTenantId, setDomainTenantId] = useState<string | null>(null);
  const branchLoadVersion = useRef(0);
  const branchSelectionReadyRef = useRef(false);
  const subscriptionBranchRef = useRef<string | null>(null);
  const modulesBranchRef = useRef<string | null>(null);
  const applyBranchSelectionReady = (ready: boolean) => {
    branchSelectionReadyRef.current = ready;
    setBranchSelectionReady(ready);
  };
  const requestedBranchId = new URLSearchParams(location.search).get("branch");
  const requestedBranchKnown = !requestedBranchId || branches.length === 0 || branches.some((branch) => branch.id === requestedBranchId);
  const routeBranchPending = requestedBranchKnown && Boolean(requestedBranchId) && requestedBranchId !== currentBranchId;
  const platformRoute = location.pathname === "/platform" || location.pathname.startsWith("/platform/");
  const activeBranchId = platformRoute && isSystemOwner ? null : (routeBranchPending ? null : currentBranchId);
  const activeBranchSelectionReady = !platformRoute && !routeBranchPending && branchSelectionReady;

  useEffect(() => {
    let active = true;
    const host = typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
    const isPlatformHost = !host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev");
    if (isPlatformHost) {
      setDomainTenantId(null);
      return () => { active = false; };
    }
    void supabase.rpc("resolve_active_tenant_domain", { _hostname: host }).then(({ data, error }) => {
      if (!active) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setDomainTenantId(null);
        return;
      }
      const resolved = data[0] as { tenant_id?: string | null };
      setDomainTenantId(resolved.tenant_id ?? null);
    });
    return () => { active = false; };
  }, [user?.id]);

  // A background refresh (tab return, data sync) revalidates the list without
  // dropping the last known branch, so the shell never unmounts the page.
  const loadBranches = async (options?: { background?: boolean }) => {
    const background = options?.background === true && branchSelectionReadyRef.current;
    const requestVersion = ++branchLoadVersion.current;
    if (!user) { setBranches([]); applyBranchSelectionReady(false); return; }
    if (!background) applyBranchSelectionReady(false);
    let tenantScopeId = domainTenantId;
    // System Owner is global only on /platform. During a workspace handoff,
    // resolve the selected branch first and restrict the context to its tenant
    // before fetching the branch list; never fetch every tenant's branches and
    // filter them only in React.
    if (isSystemOwner && !platformRoute) {
      const handoffBranchId = requestedBranchId ?? getPlatformWorkspaceBranch();
      if (!handoffBranchId) {
        if (background) return;
        setBranches([]);
        applyBranchSelectionReady(false);
        return;
      }
      const { data: handoffBranch } = await supabase
        .from("branches")
        .select("tenant_id")
        .eq("id", handoffBranchId)
        .maybeSingle();
      if (requestVersion !== branchLoadVersion.current) return;
      const handoffTenantId = (handoffBranch as { tenant_id?: string | null } | null)?.tenant_id;
      if (!handoffTenantId && background) return;
      tenantScopeId = handoffTenantId ?? "__no_workspace__";
    }
    let branchQuery = supabase.from("branches").select("id,name_en,name_ar").order("name_en");
    if (tenantScopeId) branchQuery = branchQuery.eq("tenant_id", tenantScopeId);
    withTimeout(
      branchQuery,
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback", success: true },
        label: "branches.bootstrap",
      }
    ).then(({ data, error, statusText }) => {
      if (requestVersion !== branchLoadVersion.current) return;
      // A timed-out or failed background poll keeps the last known list; the
      // foreground path still clears and blocks so a broken tenant never
      // silently operates on stale branches.
      if (background && (error || statusText === "timeout-fallback")) return;
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (roleLoading) {
        applyBranchSelectionReady(false);
        return;
      }
      setCurrentBranchIdState((prev) => {
        // System Owner starts in the platform console, not inside the first
        // clinic. An explicit URL branch always wins over stale local handoff
        // state so a previous clinic cannot bleed into the requested one.
        if (isSystemOwner) {
          const handoffBranchId = requestedBranchId ?? getPlatformWorkspaceBranch();
          if (handoffBranchId && list.some((branch) => branch.id === handoffBranchId)) {
            setPlatformWorkspaceBranch(handoffBranchId);
            return handoffBranchId;
          }
          localStorage.removeItem("zmedico.branch");
          return null;
        }
        // An explicit route branch is authoritative for every role.
        if (requestedBranchId && list.some((branch) => branch.id === requestedBranchId)) {
          localStorage.setItem("zmedico.branch", requestedBranchId);
          return requestedBranchId;
        }
        // If no selection yet, pick the first.
        if (!prev) {
          const next = list[0]?.id ?? null;
          if (next) localStorage.setItem("zmedico.branch", next);
          return next;
        }
        // If the previously selected branch was deleted, fall back to the
        // first remaining branch (or clear it if there are none).
        if (!list.some((b) => b.id === prev)) {
          const next = list[0]?.id ?? null;
          if (next) localStorage.setItem("zmedico.branch", next);
          else localStorage.removeItem("zmedico.branch");
          return next;
        }
        return prev;
      });
      applyBranchSelectionReady(true);
    }).catch(() => {
      if (requestVersion !== branchLoadVersion.current) return;
      if (background) return;
      setBranches([]);
      applyBranchSelectionReady(false);
    });
  };

  useEffect(() => {
    void loadBranches();
    return () => { branchLoadVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isSystemOwner, roleLoading, domainTenantId, location.search, platformRoute]);

  useEffect(() => {
    let active = true;
    const loadSubscription = async () => {
      if (!activeBranchSelectionReady || !activeBranchId) {
        subscriptionBranchRef.current = null;
        setSubscription(null);
        setSubscriptionLoading(false);
        return;
      }
      // Revalidating the branch whose snapshot is already on screen must not
      // re-enter the blocking "Checking subscription…" gate.
      const sameBranch = subscriptionBranchRef.current === activeBranchId;
      if (!sameBranch) setSubscriptionLoading(true);
      const { data, error } = await supabase.rpc("tenant_subscription_for_branch", { _branch_id: activeBranchId });
      if (!active) return;
      if (error) {
        if (sameBranch) return;
        subscriptionBranchRef.current = null;
        setSubscription(null);
        setSubscriptionLoading(false);
        return;
      }
      subscriptionBranchRef.current = activeBranchId;
      const next = data as TenantSubscriptionSnapshot | null;
      setSubscription((prev) => (sameSubscriptionSnapshot(prev, next) ? prev : next));
      setSubscriptionLoading(false);
    };
    void loadSubscription();
    return () => { active = false; };
  }, [activeBranchSelectionReady, activeBranchId]);

  useEffect(() => {
    let active = true;
    const loadModules = async () => {
      if (!activeBranchSelectionReady || !activeBranchId) {
        modulesBranchRef.current = null;
        setEnabledModules(DEFAULT_ENABLED_MODULES);
        setModulesLoading(false);
        return;
      }
      // Only a real branch change blocks the permission gate; revalidating the
      // same branch swaps the module list silently once it arrives.
      const sameBranch = modulesBranchRef.current === activeBranchId;
      if (!sameBranch) setModulesLoading(true);
      try {
        const { data: branch } = await supabase
          .from("branches")
          .select("tenant_id")
          .eq("id", activeBranchId)
          .maybeSingle();
        const tenantId = (branch as { tenant_id?: string | null } | null)?.tenant_id;
        if (!tenantId) {
          if (active && !sameBranch) setEnabledModules(DEFAULT_ENABLED_MODULES);
          return;
        }
        const { data, error } = await supabase
          .from("tenant_module_settings")
          .select("module_key,enabled")
          .eq("tenant_id", tenantId)
          .eq("enabled", true);
        if (!active) return;
        if (error) {
          // The feature is fail-open until the SaaS migration is available so
          // existing clinics do not lose navigation during rollout.
          if (!sameBranch) setEnabledModules(DEFAULT_ENABLED_MODULES);
          return;
        }
        const planFeatures = subscription?.plan_features ?? {};
        const configured = (data ?? [])
          .map((row) => String((row as { module_key: string }).module_key))
          .filter((key): key is ClinicModuleKey => DEFAULT_ENABLED_MODULES.includes(key as ClinicModuleKey))
          .filter((key) => planAllowsModule(key, planFeatures));
        const fallback = filterModulesByPlan(DEFAULT_ENABLED_MODULES, planFeatures);
        modulesBranchRef.current = activeBranchId;
        const next = configured.length > 0 ? configured : fallback;
        setEnabledModules((prev) => (sameModuleList(prev, next) ? prev : next));
      } finally {
        // Always release the loading gate, including when the branch lookup
        // returns no tenant_id or exits early. Otherwise protected pages can
        // remain on "Checking subscription" indefinitely.
        if (active) setModulesLoading(false);
      }
    };
    void loadModules();
    return () => { active = false; };
  }, [activeBranchSelectionReady, activeBranchId, subscription]);

  // Refetch whenever any branches mutation happens elsewhere in the app
  // (create / update / delete) so sidebar, switcher and branch-scoped UI
  // immediately reflect the change. These are background refreshes: the
  // current branch stays usable while the list revalidates.
  useEffect(() => {
    const unsub = subscribeDataSync(["branches"], () => loadBranches({ background: true }));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSystemOwner, roleLoading, domainTenantId, platformRoute, requestedBranchId]);

  const setCurrentBranchId = (id: string) => {
    setCurrentBranchIdState(id);
    localStorage.setItem("zmedico.branch", id);
  };

  const isModuleEnabled = (key: ClinicModuleKey) =>
    isModuleEnabledForEntitlement(key, enabledModules, subscription?.plan_features ?? {});
  return <BranchContext.Provider value={{ branches, currentBranchId: activeBranchId, branchSelectionReady: activeBranchSelectionReady, setCurrentBranchId, enabledModules, modulesLoading, isModuleEnabled, subscription, subscriptionLoading }}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}
