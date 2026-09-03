import { supabase } from "@/integrations/supabase/client";

export function defaultAuthenticatedPath(roles: readonly string[]): "/platform" | "/workspace" {
  return roles.includes("system_owner") ? "/platform" : "/workspace";
}

export function resolvePostAuthRedirect(path: string, roles: readonly string[]): string {
  const pathname = path.split("?", 1)[0] || "/";
  if (pathname !== "/" && pathname !== "/auth") return path;
  return defaultAuthenticatedPath(roles);
}

// RBAC-11: a patient-portal identity has zero rows in user_roles by design
// (see AppShell.tsx for the full rationale -- patient-portal-invite strips
// any role a generic trigger might add). resolvePostAuthRedirect alone
// sends that empty-roles case to /workspace, which AppShell now blocks as
// the authoritative, route-level guard. Resolving it here too means a
// patient who signs in through the shared staff /auth form (nothing there
// rejects a patient credential -- same auth.users pool, same login form)
// lands directly on their own portal instead of bouncing through a
// blocked /workspace screen first. This is a UX improvement layered on top
// of AppShell's guard, not a replacement for it -- AppShell is what
// actually prevents the staff shell from ever rendering.
export async function resolvePostAuthDestination(path: string, roles: readonly string[]): Promise<string> {
  if (roles.length > 0) return resolvePostAuthRedirect(path, roles);
  try {
    const { data, error } = await supabase.rpc("patient_portal_password_state");
    if (!error && (data as { active?: boolean } | null)?.active) return "/patient-portal";
  } catch {
    // Fall through to the default resolution below.
  }
  return resolvePostAuthRedirect(path, roles);
}
