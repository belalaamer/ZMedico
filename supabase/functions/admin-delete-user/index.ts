import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";
import { requireActiveSession } from "../_shared/active-session.ts";
import { isAdministrator, readUserRoles } from "../_shared/staff-roles.ts";
const MAX_BODY_BYTES = 8 * 1024;

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
    const callerRoles = await readUserRoles(admin, userData.user.id);
    if (callerRoles.roles === null) {
      return jsonResponse({ error: "Unable to verify administrator access" }, 503);
    }
    if (!isAdministrator(callerRoles.roles)) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: "Request body is too large" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw || "{}"); } catch { return jsonResponse({ error: "Invalid request" }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonResponse({ error: "Invalid request" }, 400);
    const body = parsed as Record<string, unknown>;
    const target_user_id = String(body.user_id ?? "").trim();
    const reason = body.reason ? String(body.reason).slice(0, 500) : null;
    const branchId = body.branch_id ? String(body.branch_id) : null;
    if (!target_user_id) {
      return jsonResponse({ error: "user_id required" }, 400);
    }
    if (target_user_id === userData.user.id) {
      return jsonResponse(
        { error: "You cannot delete your own account" },
        400,
      );
    }

    const callerIsSystemOwner = callerRoles.roles.includes("system_owner");

    const targetRoles = await readUserRoles(admin, target_user_id);
    if (targetRoles.roles === null) {
      return jsonResponse({ error: "Unable to verify target role" }, 500);
    }
    const targetIsSystemOwner = targetRoles.roles.includes("system_owner");

    if (targetIsSystemOwner && !callerIsSystemOwner) {
      return jsonResponse({ error: "Only the System Owner may delete another System Owner" }, 403);
    }

    if (targetIsSystemOwner) {
      const { count: ownerCount, error: ownerCountErr } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "system_owner");
      if (ownerCountErr) {
        return jsonResponse({ error: "Unable to verify System Owner count" }, 500);
      }
      if ((ownerCount ?? 0) <= 1) {
        return jsonResponse({ error: "The last System Owner cannot be deleted" }, 409);
      }
    }

    if (!callerIsSystemOwner) {
      const { data: targetBranches, error: branchErr } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", target_user_id);
      if (branchErr) {
        return jsonResponse({ error: "Unable to verify target branch" }, 500);
      }
      if (!targetBranches?.length) {
        return jsonResponse({ error: "Target user is outside your branch scope" }, 403);
      }

      const { data: callerBranches, error: callerBranchErr } = await admin
        .from("staff_branches")
        .select("branch_id")
        .eq("user_id", userData.user.id);
      if (callerBranchErr) {
        return jsonResponse({ error: "Unable to verify caller branch" }, 500);
      }

      const callerBranchIds = new Set((callerBranches ?? []).map((row) => row.branch_id));
      const inScope = targetBranches.some((row) => callerBranchIds.has(row.branch_id));
      if (!inScope) {
        return jsonResponse({ error: "Target user is outside your branch scope" }, 403);
      }
    }

    // Pre-deletion audit record. Written BEFORE the destructive cascade so
    // the trail exists even if the delete partially fails downstream.
    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: userData.user.id,
      branch_id: branchId,
      action: "admin_delete_user",
      entity_type: "auth_user",
      entity_id: target_user_id,
      new_values: {
        actor_user_id: userData.user.id,
        target_user_id,
        reason,
        requested_at: new Date().toISOString(),
      },
    });
    if (auditError) return jsonResponse({ error: "Unable to record deletion audit; deletion aborted" }, 500);

    // Clean dependent rows first and fail closed if any cleanup step errors.
    for (const [table, column] of [["user_roles", "user_id"], ["staff_profiles", "id"], ["profiles", "id"]] as const) {
      const { error } = await admin.from(table).delete().eq(column, target_user_id);
      if (table === "user_roles" && error?.code === "PT409") {
        return jsonResponse({ error: "The last System Owner cannot be deleted" }, 409);
      }
      if (error) return jsonResponse({ error: `Unable to clean ${table}; auth deletion aborted` }, 500);
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(target_user_id);
    if (delErr) {
      return jsonResponse({ error: "Unable to delete user" }, 400);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Unable to delete user" }, 500);
  }
});
