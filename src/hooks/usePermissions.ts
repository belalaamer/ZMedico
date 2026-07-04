import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { defaultActionsFor, MODULES } from "@/lib/rolePermissions";
import { withTimeout } from "@/lib/withTimeout";

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
    withTimeout(
      (supabase as any)
        .from("role_permissions")
        .select("role,module,actions")
        .in("role", roles),
      {
        ms: 8000,
        fallback: { data: [], error: null, count: null, status: 200, statusText: "timeout-fallback" } as any,
        label: "role_permissions.bootstrap",
      }
    )
      .then(({ data }: any) => {
        if (!active) return;
        console.info("[auth-debug] role_permissions fetch completed", {
          rows: data?.length ?? 0,
        });
        const map: Record<string, Set<string>> = {};
        const seen = new Set<string>();
        (data ?? []).forEach((r: any) => {
          seen.add(`${r.role}:${r.module}`);
          const s = map[r.module] ?? new Set<string>();
          (r.actions ?? []).forEach((a: string) => s.add(a));
          map[r.module] = s;
        });
        // Fallback to defaults for any (role, module) without a DB row.
        roles.forEach((role) => {
          MODULES.forEach((mod) => {
            if (seen.has(`${role}:${mod}`)) return;
            const acts = defaultActionsFor(role, mod);
            if (!acts.length) return;
            const s = map[mod] ?? new Set<string>();
            acts.forEach((a) => s.add(a));
            map[mod] = s;
          });
        });
        setPerms(map);
      })
      .catch((error) => {
        if (!active) return;
        console.warn("[auth-debug] role_permissions fetch threw; using defaults", { message: error instanceof Error ? error.message : String(error) });
        const map: Record<string, Set<string>> = {};
        roles.forEach((role) => {
          MODULES.forEach((mod) => {
            const acts = defaultActionsFor(role, mod);
            if (!acts.length) return;
            const s = map[mod] ?? new Set<string>();
            acts.forEach((a) => s.add(a));
            map[mod] = s;
          });
        });
        setPerms(map);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [roles.join(","), isAdmin, rolesLoading]);

  const can = (module: string, action: string = "view") => {
    if (isAdmin) return true;
    return perms[module]?.has(action) ?? false;
  };

  return { can, isAdmin, loading: rolesLoading || loading };
}
