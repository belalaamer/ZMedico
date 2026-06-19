import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { withTimeout } from "@/lib/withTimeout";
import { subscribeDataSync } from "@/lib/dataSync";

export type Branch = { id: string; name_en: string; name_ar: string };

type Ctx = {
  branches: Branch[];
  currentBranchId: string | null;
  setCurrentBranchId: (id: string) => void;
};

const BranchContext = createContext<Ctx | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = useState<string | null>(
    () => localStorage.getItem("zmedico.branch")
  );

  const loadBranches = () => {
    if (!user) { setBranches([]); return; }
    withTimeout(
      supabase.from("branches").select("id,name_en,name_ar").order("name_en"),
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback" } as any,
        label: "branches.bootstrap",
      }
    ).then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      setCurrentBranchIdState((prev) => {
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
  }, [user]);

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

  return <BranchContext.Provider value={{ branches, currentBranchId, setCurrentBranchId }}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}