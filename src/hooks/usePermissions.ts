import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export function usePermissions() {
  const { roles, isAdmin, loading: rolesLoading } = useUserRole();
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (rolesLoading) return;
    if (isAdmin) { setPerms({}); setLoading(false); return; }
    if (!roles.length) { setPerms({}); setLoading(false); return; }
    setLoading(true);
    (supabase as any)
      .from("role_permissions")
      .select("module,actions")
      .in("role", roles)
      .then(({ data }: any) => {
        if (!active) return;
        const map: Record<string, Set<string>> = {};
        (data ?? []).forEach((r: any) => {
          const s = map[r.module] ?? new Set<string>();
          (r.actions ?? []).forEach((a: string) => s.add(a));
          map[r.module] = s;
        });
        setPerms(map);
        setLoading(false);
      });
    return () => { active = false; };
  }, [roles.join(","), isAdmin, rolesLoading]);

  const can = (module: string, action: string = "view") => {
    if (isAdmin) return true;
    return perms[module]?.has(action) ?? false;
  };

  return { can, isAdmin, loading: rolesLoading || loading };
}
