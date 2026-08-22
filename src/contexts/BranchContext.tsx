import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { withTimeout } from "@/lib/withTimeout";
import { subscribeDataSync } from "@/lib/dataSync";
import { DEFAULT_ENABLED_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";

export type Branch = { id: string; name_en: string; name_ar: string };

type Ctx = {
  branches: Branch[];
  currentBranchId: string | null;
  setCurrentBranchId: (id: string) => void;
  enabledModules: ClinicModuleKey[];
  modulesLoading: boolean;
  isModuleEnabled: (key: ClinicModuleKey) => boolean;
};

const BranchContext = createContext<Ctx | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isSystemOwner, loading: roleLoading } = useUserRole();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(
    () => localStorage.getItem("zmedico.branch")
  );
  const [enabledModules, setEnabledModules] = useState<ClinicModuleKey[]>(DEFAULT_ENABLED_MODULES);
  const [modulesLoading, setModulesLoading] = useState(false);

  const loadBranches = () => {
    if (!user) { setBranches([]); return; }
    withTimeout(
      supabase.from("branches").select("id,name_en,name_ar").order("name_en"),
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback" },
        label: "branches.bootstrap",
      }
    ).then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      setCurrentBranchIdState((prev) => {
        // System Owner starts in the platform console, not inside the first
        // clinic. A clinic is selected only after an explicit user action.
        if (roleLoading) return prev;
        if (isSystemOwner) {
          localStorage.removeItem("zmedico.branch");
          return null;
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
    }).catch(() => {
      setBranches([]);
    });
  };

  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSystemOwner, roleLoading]);

  useEffect(() => {
    let active = true;
    const loadModules = async () => {
      if (!currentBranchId) {
        setEnabledModules(DEFAULT_ENABLED_MODULES);
        return;
      }
      setModulesLoading(true);
      try {
        const { data: branch } = await supabase
          .from("branches")
          .select("tenant_id")
          .eq("id", currentBranchId)
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
        const configured = (data ?? [])
          .map((row) => String((row as { module_key: string }).module_key))
          .filter((key): key is ClinicModuleKey => DEFAULT_ENABLED_MODULES.includes(key as ClinicModuleKey));
        setEnabledModules(configured.length > 0 ? configured : DEFAULT_ENABLED_MODULES);
      } finally {
        if (active) setModulesLoading(false);
      }
    };
    void loadModules();
    return () => { active = false; };
  }, [currentBranchId]);

  // Refetch whenever any branches mutation happens elsewhere in the app
  // (create / update / delete) so sidebar, switcher and branch-scoped UI
  // immediately reflect the change.
  useEffect(() => {
    const unsub = subscribeDataSync(["branches"], () => loadBranches());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setCurrentBranchId = (id: string) => {
    setCurrentBranchIdState(id);
    localStorage.setItem("zmedico.branch", id);
  };

  const isModuleEnabled = (key: ClinicModuleKey) => enabledModules.includes(key);
  return <BranchContext.Provider value={{ branches, currentBranchId, setCurrentBranchId, enabledModules, modulesLoading, isModuleEnabled }}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}