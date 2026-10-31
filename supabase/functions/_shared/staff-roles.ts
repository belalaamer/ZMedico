// Direct role reads for privileged admin functions.
//
// These gates used to call the has_role() RPC through the service-role
// client. Since the ZMED-274 probe hardening, has_role() only answers a
// probe from the caller himself, a request carrying the service_role JWT
// claim, a database admin session, a system_owner, or a caller holding
// settings.edit. A service-role client has no `sub`, so every identity
// probe must rely on the deprecated singular request.jwt.claim.role GUC;
// when PostgREST does not expose it the probe is indistinguishable from
// "this user holds no role", and legitimate admins received
// "Forbidden: admin only". The same silent-false could also hide a target
// System Owner from the delete/reset guards. service_role bypasses RLS,
// so reading the rows directly is both simpler and fail-safe.
//
// Semantics match has_role(): a system_owner implicitly satisfies the
// admin gate.

type RoleClient = { from: (table: string) => any };

export type UserRoleRead = { roles: string[] | null; error: unknown };

/** Reads every role row for one user. `roles: null` means the read failed. */
export async function readUserRoles(admin: RoleClient, userId: string): Promise<UserRoleRead> {
  try {
    const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if (error) return { roles: null, error };
    const rows = Array.isArray(data) ? data : [];
    return {
      roles: rows.map((row) => String((row as { role?: unknown } | null)?.role ?? "")),
      error: null,
    };
  } catch (error) {
    return { roles: null, error };
  }
}

/** Mirrors has_role(uid, 'admin'): system_owner is an implicit admin. */
export function isAdministrator(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("system_owner");
}
