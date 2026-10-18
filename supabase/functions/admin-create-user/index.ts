import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { allocateEmployeeId } from "../_shared/employee-id.ts";
import { requireActiveSession } from "../_shared/active-session.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function corsPreflight() { return new Response("ok", { headers: corsHeaders }); }
const MAX_BODY_BYTES = 8 * 1024;

// Generates a cryptographically strong temporary password. It is only returned
// once in the admin response so the admin can hand it to the new staff member.
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
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return jsonResponse({ error: "Request body is too large" }, 413);

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
    const sessionFailure = await requireActiveSession(userClient);
    if (sessionFailure) return sessionFailure;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: "Request body is too large" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw || "{}"); } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonResponse({ error: "Invalid request" }, 400);
    const body = parsed as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const username = body.username ? String(body.username).trim().toLowerCase() : null;
    const full_name = body.full_name ? String(body.full_name).trim() : null;
    const full_name_en = body.full_name_en ? String(body.full_name_en).trim() : null;
    const full_name_ar = body.full_name_ar ? String(body.full_name_ar).trim() : null;
    const role = String(body.role ?? "");
    const branch_id = body.branch_id ? String(body.branch_id) : null;
    // If the admin supplied an explicit password, use it. Otherwise generate a
    // temporary password. In both cases the account can sign in immediately.
    const suppliedPassword = typeof body.password === "string" && body.password.trim().length >= 6
      ? body.password.trim()
      : null;
    const initialPassword = suppliedPassword ?? genInternalPassword(32);

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "Invalid email" }, 400);
    }
    if (username && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username)) {
      return jsonResponse({ error: "Username must be 3-32 characters and use letters, numbers, dot, underscore, or hyphen" }, 400);
    }
    if (username) {
      const { data: taken } = await admin.from("profiles").select("id").ilike("username", username).limit(1);
      if (taken?.length) return jsonResponse({ error: "Username is already in use" }, 409);
    }
    const allowedRoles = [
      "system_owner", "admin", "manager", "doctor", "nurse",
      "receptionist", "accountant", "hr",
    ];
    if (!allowedRoles.includes(role)) {
      return jsonResponse({ error: "Invalid role" }, 400);
    }

    if (role === "system_owner") {
      const { data: isSystemOwner, error: ownerRoleErr } = await admin.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "system_owner",
      });
      if (ownerRoleErr || !isSystemOwner) {
        return jsonResponse({ error: "Only the System Owner may create another System Owner" }, 403);
      }
    }

    // RBAC-08 fix: "hr" was missing from this list even though every
    // HR-facing RLS policy (hr_staff_select, hr_payroll_select,
    // hr_attendance_select, hr_leave_select) requires
    // "has_role(auth.uid(),'hr') AND (branch_id IS NULL OR
    // user_has_branch_access(branch_id))" against the TARGET row's branch.
    // Because a fresh hr account never received a branch_id, they only ever
    // matched the "branch_id IS NULL" half of that check against their own
    // (also branch-less) row -- meaning they could see themselves and
    // nobody else. Confirmed live: a freshly created hr test account could
    // read exactly 1 staff_profiles row (their own) out of many branch-
    // scoped staff. Adding "hr" here (mirroring manager/doctor/nurse/
    // receptionist/accountant, which already require it) closes this --
    // admin remains the only role that is deliberately cross-branch "by
    // design" per the comment below.
    const rolesRequiringBranch = ["manager", "doctor", "nurse", "receptionist", "accountant", "hr", "staff"];
    // Administrators may be provisioned without a branch assignment. An
    // explicitly supplied branch still requires the caller's own authority.
    if (rolesRequiringBranch.includes(role) && !branch_id) {
      return jsonResponse({ error: `Branch is required for role: ${role}` }, 400);
    }

    if (branch_id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch_id)) {
        return jsonResponse({ error: "Invalid branch" }, 400);
      }
      try {
        // Use the real caller JWT, never the privileged provisioning client.
        // The canonical helper retains explicit System Owner global access.
        const { data: branchAllowed, error: branchError } = await userClient.rpc(
          "user_has_branch_access", { _branch: branch_id },
        );
        if (branchError) return jsonResponse({ error: "Unable to verify branch access" }, 503);
        if (branchAllowed !== true) return jsonResponse({ error: "Forbidden: branch is outside your scope" }, 403);
      } catch {
        return jsonResponse({ error: "Unable to verify branch access" }, 503);
      }
    }

    // Pre-authorize email so handle_new_user trigger accepts the signup
    // and assigns the chosen role + name automatically.
    const { error: allowlistError } = await admin.from("allowed_signup_emails").upsert(
      { email, role, full_name, branch_id, created_by: userData.user.id },
      { onConflict: "email" },
    );
    if (allowlistError) return jsonResponse({ error: "Unable to prepare signup authorization" }, 500);

    // Create the auth user with email pre-confirmed and a real password.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          full_name: full_name ?? full_name_en ?? full_name_ar ?? undefined,
          full_name_en: full_name_en ?? undefined,
          full_name_ar: full_name_ar ?? undefined,
        },
      });

    if (createErr || !created?.user) {
      // Roll back the allowlist row so it does not linger.
      await admin.from("allowed_signup_emails").delete().eq("email", email);
      return jsonResponse(
        { error: "Unable to create user" },
        400,
      );
    }

    // Make sure profile + role exist (handle_new_user usually does this,
    // but if it didn't run we ensure consistency).
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: created.user.id,
        email,
        full_name: full_name ?? full_name_en ?? full_name_ar,
        username,
        full_name_en,
        full_name_ar,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      await admin.from("allowed_signup_emails").delete().eq("email", email);
      return jsonResponse({ error: "Profile provisioning failed" }, 500);
    }
    const { error: roleProvisionError } = await admin.from("user_roles").upsert(
      { user_id: created.user.id, role },
      { onConflict: "user_id,role" },
    );
    if (roleProvisionError) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      await admin.from("allowed_signup_emails").delete().eq("email", email);
      return jsonResponse({ error: "Role provisioning failed" }, 500);
    }
    // Non-admin roles are operational identities and MUST own an active,
    // linked staff_profiles row (see docs/QA_IDENTITY_PROVISIONING.md and
    // usePermissions.linked gate). Admin bypasses by design. If staff
    // provisioning fails the entire operation is rolled back so no
    // partially-provisioned identity is ever left behind.
    const requiresStaffProfile = role !== "admin";
    if (requiresStaffProfile || branch_id) {
      // staff_profiles.employee_id is NOT NULL with no default. Generate one
      // using the database's atomic allocator so the upsert does not violate the
      // constraint for newly created users.
      const { data: existing } = await admin
        .from("staff_profiles")
        .select("id, employee_id")
        .eq("id", created.user.id)
        .maybeSingle();

      let employeeId = existing?.employee_id as string | undefined;
      if (!employeeId) {
        try {
          employeeId = await allocateEmployeeId(admin);
        } catch {
          await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
          await admin.from("allowed_signup_emails").delete().eq("email", email);
          return jsonResponse({ error: "Employee ID allocation failed" }, 500);
        }
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
          { error: "Staff profile provisioning failed" },
          500,
        );
      }
    }
    // Consume invite if still present
    await admin.from("allowed_signup_emails").delete().eq("email", email);

    return jsonResponse({
      success: true,
      user_id: created.user.id,
      email,
      role,
      password: initialPassword,
      password_was_generated: !suppliedPassword,
    });
  } catch {
    return jsonResponse({ error: "Unable to create user" }, 500);
  }
});
