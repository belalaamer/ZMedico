import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { withTimeout } from "@/lib/withTimeout";

export type AppRole = "admin" | "manager" | "doctor" | "receptionist" | "hr" | "accountant" | "staff" | string;

export function useUserRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) { setRoles([]); setLoading(false); return; }
    setLoading(true);
    withTimeout(
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback" } as any,
        label: "user_roles.bootstrap",
      }
    )
      .then(({ data, error }: any) => {
        if (!active) return;
        if (error) {
          console.warn("[auth-debug] user_roles fetch error", {
            message: error.message,
            code: error.code,
          });
        } else {
          console.info("[auth-debug] user_roles fetch completed", {
            rows: data?.length ?? 0,
          });
        }
        setRoles((data ?? []).map((r: any) => r.role as AppRole));
      })
      .catch((error) => {
        if (!active) return;
        console.warn("[auth-debug] user_roles fetch threw", { message: error instanceof Error ? error.message : String(error) });
        setRoles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [user?.id]);

  const isAdmin = roles.includes("admin");
  return { roles, isAdmin, loading };
}