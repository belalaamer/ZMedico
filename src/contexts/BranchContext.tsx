import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const loadBranches = () => {
    if (!user) { setBranches([]); setBranchSelectionReady(false); return; }
    setBranchSelectionReady(false);
    let branchQuery = supabase.from("branches").select("id,name_en,name_ar").order("name_en");
    if (domainTenantId && !isSystemOwner) branchQuery = branchQuery.eq("tenant_id", domainTenantId);
    withTimeout(
      branchQuery,
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback" },
        label: "branches.bootstrap",
      }
    ).then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (roleLoading) {
        setBranchSelectionReady(false);
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
      setBranchSelectionReady(true);
    }).catch(() => {
      setBranches([]);
      setBranchSelectionReady(false);
    });
  };

  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSystemOwner, roleLoading, domainTenantId, location.search]);

  useEffect(() => {
    let active = true;
    const loadSubscription = async () => {
      if (!activeBranchSelectionReady || !activeBranchId) {
        setSubscription(null);
        setSubscriptionLoading(false);
        return;
      }
      setSubscriptionLoading(true);
      const { data, error } = await supabase.rpc("tenant_subscription_for_branch", { _branch_id: activeBranchId });
      if (!active) return;
      setSubscription(error ? null : (data as TenantSubscriptionSnapshot | null));
      setSubscriptionLoading(false);
    };
    void loadSubscription();
    return () => { active = false; };
  }, [activeBranchSelectionReady, activeBranchId]);

  useEffect(() => {
    let active = true;
    const loadModules = async () => {
      if (!activeBranchSelectionReady || !activeBranchId) {
        setEnabledModules(DEFAULT_ENABLED_MODULES);
        setModulesLoading(false);
        return;
      }
      setModulesLoading(true);
      try {
        const { data: branch } = await supabase
          .from("branches")
          .select("tenant_id")
          .eq("id", activeBranchId)
          .maybeSingle();
        const tenantId = (branch as { tenant_id?: string | null } | null)?.tenant_id;
        if (!tenantId) {
          if (active) setEnabledModules(DEFAULT_ENABLED_MODULES);
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
          setEnabledModules(DEFAULT_ENABLED_MODULES);
          return;
        }
        const planFeatures = subscription?.plan_features ?? {};
        const configured = (data ?? [])
          .map((row) => String((row as { module_key: string }).module_key))
          .filter((key): key is ClinicModuleKey => DEFAULT_ENABLED_MODULES.includes(key as ClinicModuleKey) && planAllowsModule(key, planFeatures));
        const fallback = filterModulesByPlan(DEFAULT_ENABLED_MODULES, planFeatures);
        setEnabledModules(configured.length > 0 ? configured : fallback);
      } finally {
        if (active) setModulesLoading(false);
      }
    };
    void loadModules();
    return () => { active = false; };
  }, [activeBranchSelectionReady, activeBranchId, subscription]);

  // Refetch whenever any branches mutation happens elsewhere in the app
  // (create / update / delete) so sidebar, switcher and branch-scoped UI
  // immediately reflect the change.
  useEffect(() => {
    const unsub = subscribeDataSync(["branches"], () => loadBranches());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSystemOwner, domainTenantId]);

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