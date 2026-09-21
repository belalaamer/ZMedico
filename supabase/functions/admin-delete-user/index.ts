import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
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

    const { data: callerIsSystemOwner, error: callerOwnerErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "system_owner",
    });
    if (callerOwnerErr) {
      return jsonResponse({ error: "Unable to verify caller scope" }, 500);
    }

    const { data: targetIsSystemOwner, error: targetOwnerErr } = await admin.rpc("has_role", {
      _user_id: target_user_id,
      _role: "system_owner",
    });
    if (targetOwnerErr) {
      return jsonResponse({ error: "Unable to verify target role" }, 500);
    }

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
    await admin.from("audit_logs").insert({
      user_id: userData.user.id,
      branch_id: branchId,
      action: "admin_delete_user",
      entity_type: "auth_user",
      entity_id: target_user_id,
      new_values: {
        target_user_id,
        reason,
        requested_at: new Date().toISOString(),
      },
    });

    // Clean dependent rows first (best-effort)
    await admin.from("user_roles").delete().eq("user_id", target_user_id);
    await admin.from("staff_profiles").delete().eq("id", target_user_id);
    await admin.from("profiles").delete().eq("id", target_user_id);

    const { error: delErr } = await admin.auth.admin.deleteUser(target_user_id);
    if (delErr) {
      return jsonResponse({ error: delErr.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse(
      { error: (e as Error).message ?? "Unknown error" },
      500,
    );
  }
});