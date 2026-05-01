import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

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

  useEffect(() => {
    if (!user) { setBranches([]); return; }
    supabase.from("branches").select("id,name_en,name_ar").order("name_en").then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (!currentBranchId && list.length) {
        setCurrentBranchIdState(list[0].id);
        localStorage.setItem("zmedico.branch", list[0].id);
      }
    });
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