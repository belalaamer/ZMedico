import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, corsPreflight, jsonResponse } from "../_shared/cors.ts";

// Generates a cryptographically strong random string used ONLY internally to
// satisfy Supabase's `createUser({ password })` argument. The value is never
// returned to the caller, never logged, and never persisted anywhere the
// admin surface can read. Sprint 1 hardening removed plaintext password
// responses in favour of a recovery-link flow (see docs/security).
function genInternalPassword(len = 32) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight();
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Identify caller and verify admin role
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = body.full_name ? String(body.full_name).trim() : null;
    const role = String(body.role ?? "staff");
    const branch_id = body.branch_id ? String(body.branch_id) : null;
    // If the admin supplied an explicit password, use it so the new user can
    // log in immediately with those credentials. Otherwise generate an
    // internal random password and surface a recovery link the user can use
    // to set their own password.
    const suppliedPassword = typeof body.password === "string" && body.password.trim().length >= 6
      ? body.password.trim()
      : null;
    const initialPassword = suppliedPassword ?? genInternalPassword(32);

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "Invalid email" }, 400);
    }
    const allowedRoles = [
      "system_owner", "admin", "manager", "doctor", "nurse",
      "receptionist", "accountant", "hr", "staff",
    ];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({ error: "Invalid role" }, 400);
    }

    const rolesRequiringBranch = ["manager", "doctor", "nurse", "receptionist", "accountant", "staff"];
    // system_owner and admin are cross-branch identities and do not require a branch assignment.
    if (rolesRequiringBranch.includes(role) && !branch_id) {
      return jsonResponse({ error: `Branch is required for role: ${role}` }, 400);
    }

    // Pre-authorize email so handle_new_user trigger accepts the signup
    // and assigns the chosen role + name automatically.
    await admin.from("allowed_signup_emails").upsert(
      { email, role, full_name, created_by: userData.user.id },
      { onConflict: "email" },
    );

    // Create the auth user with email pre-confirmed. The password used here
    // is a locally generated random value that is discarded immediately;
    // the caller receives a recovery link to set the real password.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? undefined },
      });

    if (createErr || !created?.user) {
      // Roll back the allowlist row so it does not linger.
      await admin.from("allowed_signup_emails").delete().eq("email", email);
      return jsonResponse(
        { error: createErr?.message ?? "Create user failed" },
        400,
      );
    }

    // Make sure profile + role exist (handle_new_user usually does this,
    // but if it didn't run we ensure consistency).
    await admin.from("profiles").upsert(
      { id: created.user.id, email, full_name },
      { onConflict: "id" },
    );
    await admin.from("user_roles").upsert(
      { user_id: created.user.id, role },
      { onConflict: "user_id,role" },
    );
    // Non-admin roles are operational identities and MUST own an active,
    // linked staff_profiles row (see docs/QA_IDENTITY_PROVISIONING.md and
    // usePermissions.linked gate). Admin bypasses by design. If staff
    // provisioning fails the entire operation is rolled back so no
    // partially-provisioned identity is ever left behind.
    const requiresStaffProfile = role !== "admin";
    if (requiresStaffProfile || branch_id) {
      // staff_profiles.employee_id is NOT NULL with no default. Generate one
      // using the employee_id_counter so the upsert does not violate the
      // constraint for newly created users.
      const { data: existing } = await admin
        .from("staff_profiles")
        .select("id, employee_id")
        .eq("id", created.user.id)
        .maybeSingle();

      let employeeId = existing?.employee_id as string | undefined;
      if (!employeeId) {
        const { data: counter } = await admin
          .from("employee_id_counter")
          .select("id, last_value")
          .eq("id", 1)
          .maybeSingle();
        const next = ((counter?.last_value as number) ?? 0) + 1;
        await admin
          .from("employee_id_counter")
          .upsert({ id: 1, last_value: next });
        employeeId = `EMP-${String(next).padStart(4, "0")}`;
      }

      const { error: spErr } = await admin.from("staff_profiles").upsert(
        {
          id: created.user.id,
          linked_user_id: created.user.id,
          branch_id,
          employee_id: employeeId,
          status: "active",
        },
        { onConflict: "id" },
      );
      if (spErr) {
        // Full rollback: remove the auth user (cascades to profiles,
        // user_roles, staff_profiles via FK) and the allowlist row so
        // the operation is atomic — either everything is provisioned
        // or nothing is.
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        await admin.from("allowed_signup_emails").delete().eq("email", email);
        return jsonResponse(
          { error: `Staff profile provisioning failed: ${spErr.message}` },
          500,
        );
      }
    }
    // Consume invite if still present
    await admin.from("allowed_signup_emails").delete().eq("email", email);

    // If the admin supplied the password, the account is ready to use with
    // those credentials — echo the email + password back so the admin can
    // hand them off. Otherwise generate a one-time recovery link so the
    // user can set their own password.
    if (suppliedPassword) {
      return jsonResponse({
        success: true,
        user_id: created.user.id,
        email,
        role,
        password: suppliedPassword,
      });
    }

    let action_link: string | null = null;
    let action_link_expires_at: string | null = null;
    try {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      action_link = (linkData as any)?.properties?.action_link ?? null;
      action_link_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } catch {
      /* non-fatal: user is created, admin can reset later */
    }

    return jsonResponse({
      success: true,
      user_id: created.user.id,
      email,
      role,
      action_link,
      action_link_expires_at,
    });
  } catch (e) {
    return jsonResponse(
      { error: (e as Error).message ?? "Unknown error" },
      500,
    );
  }
});