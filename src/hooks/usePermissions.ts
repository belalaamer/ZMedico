import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { defaultActionsFor, MODULES } from "@/lib/rolePermissions";
import { withTimeout } from "@/lib/withTimeout";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthzState } from "@/lib/authz/useAuthzState";
import { isCanonicalAuthzEnabled } from "@/lib/authz/canonicalFlag";
import { fetchCanonicalPermissions } from "@/lib/authz/canonicalPermissions";

export function usePermissions() {
  const { roles, isAdmin, loading: rolesLoading } = useUserRole();
  const { user } = useAuth();
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState<boolean | null>(null);
  // R1: fingerprint-driven cache invalidation. When R1 is off the hook
  // returns { fingerprint: null } and the effect below re-runs only on
  // the pre-existing dependencies (roles/isAdmin), preserving byte-
  // identical legacy behavior.
  const { fingerprint } = useAuthzState();

  // Access gate: a user must be linked to an active staff_profile to have
  // module access. Admins bypass to prevent bootstrap lockout.
  useEffect(() => {
    let active = true;
    if (!user) { setLinked(null); return; }
    (supabase as any)
      .from("staff_profiles")
      .select("id")
      .eq("linked_user_id", user.id)
      .is("deleted_at", null)
      .neq("status", "terminated")
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => { if (active) setLinked(!!data); })
      .catch(() => { if (active) setLinked(false); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    if (rolesLoading) return;
    if (isAdmin) { setPerms({}); setLoading(false); return; }
    if (!roles.length) { setPerms({}); setLoading(false); return; }
    setLoading(true);
    // Phase B — Canonical runtime path. When the flag is on, source the
    // effective permission set from `v_authz_effective_permissions`
    // (authz_bundles → authz_permissions) instead of `role_permissions`
    // + DEFAULT_PERMISSIONS. Return shape is identical. On any failure
    // we transparently fall through to the legacy reader below so the
    // user never loses access from a canonical outage.
    if (isCanonicalAuthzEnabled() && user?.id) {
      fetchCanonicalPermissions(user.id)
        .then((map) => {
          if (!active) return;
          console.info("[auth-debug] canonical permissions loaded", {
            modules: Object.keys(map).length,
          });
          setPerms(map);
          setLoading(false);
        })
        .catch((error) => {
          console.warn("[auth-debug] canonical permissions failed; falling back to legacy", {
            message: error instanceof Error ? error.message : String(error),
          });
          if (!active) return;
          loadLegacy();
        });
      return () => { active = false; };
    }
    loadLegacy();
    return () => { active = false; };

    function loadLegacy() {
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
    }
  }, [roles.join(","), isAdmin, rolesLoading, fingerprint, user?.id]);

  const can = (module: string, action: string = "view") => {
    if (isAdmin) return true;
    if (linked === false) return false;
    return perms[module]?.has(action) ?? false;
  };

  return { can, isAdmin, loading: rolesLoading || loading || (!isAdmin && linked === null && !!user) };
}
